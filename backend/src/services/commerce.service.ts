import { createHash } from 'node:crypto';
import { AppError, isDuplicate } from '../utils/app-error.util.js';
import { cents } from '../utils/money.util.ts';
import { applyPromotion, normalizePromotionCode, type PromotionQuote } from '../utils/promotion.util.ts';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
import { createQrToken } from '../utils/qr.util.ts';
import { CommerceRepository, type OrderKeyRow, type PurchaseRow, type ScanResult } from '../repositories/commerce.repository.ts';
import type { Database, Principal, ConcertRow, TicketRow } from '../types/management.types.ts';
import { purchaseSchema, promotionValidationSchema, validationSchema, type PurchaseInput, type PromotionValidationInput, type PageQuery, type ValidationInput, type CreatePromotionInput, type UpdatePromotionInput, type PromotionQuery } from '../validators/commerce.schemas.ts';

export const SIMULATED_PURCHASE_NOTICE = 'Pago simulado: no se cobró dinero real ni se guardaron datos de tarjeta.';
export type PaymentOutcome = 'APPROVED' | 'REJECTED';

function fail(status: number, code: string, message: string): never { throw new AppError(status, code, message, undefined); }
// ER_DUP_ENTRY sobre la clave de idempotencia: otra solicitud con la misma clave ganó la carrera.
const isIdempotencyCollision = (error: unknown) => typeof error === 'object' && error !== null
    && (error as { code?: string }).code === 'ER_DUP_ENTRY' && String((error as { message?: string }).message).includes('uq_orders_idempotency');
const required = <T>(value: T | undefined): T => value ?? fail(404, 'NOT_FOUND', 'Recurso inexistente.');
const ownerFilter = (user: Principal) => can(user, P.ordersReadAll) ? undefined : user.id;
const ascending = (a: string, b: string) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
function owner(purchase: PurchaseRow, user: Principal): void {
    if (purchase.user_id !== user.id && !can(user, P.ordersReadAll)) fail(404, 'NOT_FOUND', 'Recurso inexistente.');
}
function sale(concert: ConcertRow, type: TicketRow, now: Date): void {
    if (concert.status !== 'PUBLISHED') fail(409, 'CONCERT_NOT_PUBLISHED', 'El concierto no está publicado.');
    if (concert.start_datetime <= now || (type.sale_start && type.sale_start > now) || (type.sale_end && type.sale_end <= now))
        fail(409, 'SALE_CLOSED', 'Fuera de la ventana de venta.');
}

export class CommerceService {
    constructor(private readonly database: Database) {}
    private run<T>(transaction: boolean, work: (repo: CommerceRepository) => Promise<T>): Promise<T> {
        const callback = (repo: { connection: ConstructorParameters<typeof CommerceRepository>[0] }) => work(new CommerceRepository(repo.connection));
        return transaction ? this.database.transaction(callback) : this.database.read(callback);
    }
    async create(input: PurchaseInput, user: Principal, idempotencyKey: string): Promise<{ purchase: unknown; replayed: boolean }> {
        const parsed = purchaseSchema.parse(input);
        const items = [...parsed.items].sort((a, b) => ascending(a.ticketTypeId, b.ticketTypeId));
        // Mismo contenido = mismo hash, sin importar el orden de los ítems del cliente.
        // The promotion code joins the hash only when present, so purchases without a promotion keep their historical hash.
        const promotionCode = parsed.promotionCode ? normalizePromotionCode(parsed.promotionCode) : undefined;
        const requestHash = createHash('sha256').update(JSON.stringify({ concertId: parsed.concertId ?? null, items: items.map(item => [item.ticketTypeId, item.quantity]),
            ...(promotionCode ? { promotionCode } : {}) })).digest('hex');
        // Resolve the immutable parent outside the transaction: never establish a stale RR snapshot before locks.
        const first = await this.run(false, async repo => required(await repo.type(items[0].ticketTypeId)));
        const concertId = parsed.concertId ?? first.concert_id;
        try {
            return await this.run(true, async repo => {
                const concert = required(await repo.concert(concertId));
                // Locking read after the concert lock: a committed original is always visible here, so retries never re-reserve.
                const original = await repo.byIdempotencyKey(user.id, idempotencyKey, true);
                if (original) return this.replay(repo, original, requestHash);
                const types: TicketRow[] = [];
                for (const item of items) {
                    const type = required(await repo.type(item.ticketTypeId, true));
                    if (type.concert_id !== concert.id) fail(422, 'WRONG_CONCERT', 'Todas las entradas deben pertenecer al concierto seleccionado.');
                    types.push(type);
                }
                const now = await repo.now();
                let expires = Math.min(now.getTime() + 15 * 60000, concert.start_datetime.getTime());
                for (const [index, type] of types.entries()) {
                    sale(concert, type, now);
                    const quantity = items[index].quantity;
                    if (type.max_per_purchase !== null && quantity > type.max_per_purchase)
                        fail(409, 'MAX_PER_PURCHASE', 'Se superó el máximo por compra.');
                    if (type.stock_total - await repo.committed(type.id) < quantity)
                        fail(409, 'INSUFFICIENT_STOCK', 'No hay entradas suficientes.');
                    if (type.sale_end) expires = Math.min(expires, type.sale_end.getTime());
                }
                // The server prices the promotion from the locked ticket prices; nothing monetary comes from the client.
                // The use is NOT consumed here: it is consumed when the purchase is confirmed (see transition).
                let promotion: { id: string; code: string; discount: string } | undefined;
                if (promotionCode) {
                    const found = await repo.promotions.byCode(promotionCode) ?? fail(404, 'PROMOTION_NOT_FOUND', 'El código promocional no existe.');
                    const subtotal = types.reduce((sum, type, index) => sum + cents(type.price) * BigInt(items[index].quantity), 0n);
                    const quote = applyPromotion(found, { concertId: concert.id, subtotal, now });
                    promotion = { id: found.id, code: found.code, discount: quote.discount };
                }
                const id = await repo.reserve(user.id, new Date(expires), idempotencyKey, requestHash);
                for (const [index, type] of types.entries()) await repo.addItem(id, type, items[index].quantity);
                await repo.total(id, promotion);
                return { purchase: { ...required(await repo.purchase(id)), items: await repo.items(id) }, replayed: false };
            });
        } catch (error) {
            // A concurrent request with the same key committed first and the unique index rejected this insert:
            // this attempt rolled back completely (no stock, reservation or payment), so return the original.
            if (!isIdempotencyCollision(error)) throw error;
            return this.run(false, async repo => this.replay(repo, required(await repo.byIdempotencyKey(user.id, idempotencyKey)), requestHash));
        }
    }
    // Preview for the checkout screen: same rules and same arithmetic as POST /purchases, but it reserves and consumes nothing.
    async validatePromotion(input: PromotionValidationInput, _user?: Principal): Promise<PromotionQuote> {
        const parsed = promotionValidationSchema.parse(input);
        return this.run(false, async repo => {
            let concertId = parsed.concertId;
            let subtotal = 0n;
            if (parsed.items && parsed.items.length > 0) {
                const types: TicketRow[] = [];
                for (const item of parsed.items) types.push(required(await repo.type(item.ticketTypeId)));
                concertId = concertId ?? types[0].concert_id;
                if (types.some(type => type.concert_id !== concertId)) fail(422, 'WRONG_CONCERT', 'Todas las entradas deben pertenecer al concierto seleccionado.');
                subtotal = types.reduce((sum, type, index) => sum + cents(type.price) * BigInt(parsed.items![index].quantity), 0n);
            } else if (parsed.subtotal !== undefined) {
                subtotal = cents(parsed.subtotal.toFixed(2));
            } else {
                fail(422, 'INVALID_INPUT', 'Debe especificar los items o el subtotal.');
            }
            const promotion = await repo.promotions.byCode(normalizePromotionCode(parsed.code)) ?? fail(404, 'PROMOTION_NOT_FOUND', 'El código promocional no existe.');
            return applyPromotion(promotion, { concertId: concertId ?? '', subtotal, now: await repo.now() });
        });
    }
    private async replay(repo: CommerceRepository, original: OrderKeyRow, requestHash: string) {
        if (original.request_hash !== requestHash) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'La clave ya se usó con otra compra.');
        return { purchase: { ...required(await repo.purchase(original.id)), items: await repo.items(original.id) }, replayed: true };
    }
    purchases(user: Principal, query: PageQuery) { return this.run(false, repo => repo.purchases(user.id, query)); }
    async purchase(id: string, user: Principal) {
        return this.run(false, async repo => ({ ...required(await repo.purchase(id, ownerFilter(user))), items: await repo.items(id), payments: await repo.payments(id) }));
    }
    // confirm = simulated payment: APPROVED confirms the purchase and issues tickets; REJECTED is recorded and the purchase stays PENDING.
    // cancel of a CONFIRMED purchase is a refund: tickets are voided, stock returns and the approved payment becomes REFUNDED.
    async transition(id: string, action: 'confirm' | 'cancel', user: Principal, outcome: PaymentOutcome = 'APPROVED') {
        const initial = await this.purchase(id, user);
        const result = await this.run(true, async repo => {
            // All writers acquire concerts -> ticket types (numeric ascending) -> purchase -> tickets.
            const concerts = new Map<string, ConcertRow>();
            for (const concertId of [...new Set(initial.items.map(item => item.concert_id))].sort(ascending))
                concerts.set(concertId, required(await repo.concert(concertId)));
            const types = new Map<string, TicketRow>();
            for (const typeId of initial.items.map(item => item.ticket_type_id).sort(ascending))
                types.set(typeId, required(await repo.type(typeId, true)));
            const purchase = required(await repo.lockPurchase(id));
            owner(purchase, user);
            const now = await repo.now();

            if (action === 'confirm') {
                // PASO 2 — CONFIRMACIÓN IDEMPOTENTE:
                // Si la orden ya fue confirmada previamente, devolvemos la compra confirmada (HTTP 200) de forma idempotente,
                // sin volver a consumir la promoción, crear otra redención, incrementar current_uses ni duplicar tickets/stock.
                if (purchase.status === 'CONFIRMED') {
                    if (outcome === 'REJECTED') fail(409, 'INVALID_STATE', 'Una compra ya confirmada no puede rechazarse.');
                    return { expired: false as const, replayed: true as const, data: await this.details(repo, id) };
                }

                if (purchase.status === 'PENDING' && (!purchase.expires_at || purchase.expires_at <= now)) {
                    await repo.setPurchaseStatus(id, 'EXPIRED');
                    return { expired: true as const };
                }
                if (purchase.status === 'EXPIRED') return { expired: true as const };

                if (purchase.status !== 'PENDING') fail(409, 'INVALID_STATE', 'La compra no puede confirmarse.');
                for (const type of types.values()) sale(required(concerts.get(type.concert_id)), type, now);
                if ((await repo.purchaseTickets(id)).length) fail(409, 'INVALID_STATE', 'La compra ya tiene entradas.');
                if (outcome === 'REJECTED') {
                    const paymentId = await repo.addPayment(purchase, user.id, 'REJECTED');
                    await repo.audit({ actor: user.id, action: 'ORDER_PAYMENT_REJECTED', target: purchase.user_id, entity: { type: 'ORDER', id },
                        details: { payment_id: paymentId, amount: purchase.total, currency: purchase.currency, simulated: true } });
                    return { expired: false as const, data: await this.details(repo, id) };
                }

                // Consume the promotion use only now that the purchase really becomes CONFIRMED.
                // PASO 3 — PROMOCIÓN AGOTADA DURANTE LA CONFIRMACIÓN:
                // Si la promoción ya no está disponible (inactiva, expirada o cupos agotados), cancelamos la orden de forma segura
                // liberando el stock inmediatamente (para que no quede 15 min en limbo) y notificamos al cliente.
                if (purchase.promotion_id) {
                    const promotion = required(await repo.promotions.lock(purchase.promotion_id));
                    const isUnavailable = promotion.status !== 'ACTIVE';
                    const isExpired = promotion.valid_until.getTime() < now.getTime();
                    let consumeResult: 'CONSUMED' | 'ALREADY_ACTIVE' | 'EXHAUSTED' = 'CONSUMED';

                    if (!isUnavailable && !isExpired) {
                        try {
                            consumeResult = await repo.promotions.consume(promotion.id, id);
                        } catch (error) {
                            if (isDuplicate(error)) consumeResult = 'ALREADY_ACTIVE';
                            else throw error;
                        }
                    }

                    if (isUnavailable || isExpired || consumeResult === 'EXHAUSTED') {
                        // Liberar stock inmediatamente y marcar la orden como CANCELLED
                        await repo.invalidateTickets(id);
                        await repo.setPurchaseStatus(id, 'CANCELLED');
                        await repo.audit({
                            actor: user.id, action: 'ORDER_CANCELLED' as any, target: purchase.user_id, entity: { type: 'ORDER', id },
                            details: {
                                reason: consumeResult === 'EXHAUSTED' ? 'PROMOTION_EXHAUSTED' : isExpired ? 'PROMOTION_EXPIRED' : 'PROMOTION_UNAVAILABLE',
                                promotion_id: purchase.promotion_id,
                                promotion_code: purchase.promotion_code,
                            },
                        });
                        return {
                            expired: false as const,
                            promotionExhausted: true as const,
                            reason: consumeResult === 'EXHAUSTED' ? 'PROMOTION_EXHAUSTED' : isExpired ? 'PROMOTION_EXPIRED' : 'PROMOTION_UNAVAILABLE',
                        };
                    }
                }

                if (await repo.confirm(id) !== 1) {
                    await repo.setPurchaseStatus(id, 'EXPIRED');
                    return { expired: true as const };
                }

                for (const item of initial.items) {
                    await repo.sold(item, 1);
                    for (let index = 0; index < item.quantity; index++) await repo.addTicket(item, purchase.user_id, createQrToken());
                }
                const paymentId = await repo.addPayment(purchase, user.id, 'APPROVED');
                await repo.audit({ actor: user.id, action: 'ORDER_PAYMENT_APPROVED', target: purchase.user_id, entity: { type: 'ORDER', id },
                    details: { payment_id: paymentId, amount: purchase.total, currency: purchase.currency, simulated: true } });
                await repo.notifications.purchase(purchase.user_id, id, initial.items[0].concert_id);
            } else {
                if (purchase.status === 'PENDING' && (!purchase.expires_at || purchase.expires_at <= now)) {
                    await repo.setPurchaseStatus(id, 'EXPIRED');
                    return { expired: true as const };
                }
                if (purchase.status === 'EXPIRED') return { expired: true as const };
                if (!['PENDING', 'CONFIRMED'].includes(purchase.status)) fail(409, 'INVALID_STATE', 'La compra no puede cancelarse.');
                const tickets = await repo.purchaseTickets(id);
                if (tickets.some(ticket => ticket.used_at !== null)) fail(409, 'TICKET_ALREADY_USED', 'La compra contiene entradas utilizadas.');
                if (purchase.status === 'CONFIRMED' && [...concerts.values()].some(concert => concert.status !== 'CANCELLED' && concert.start_datetime <= now))
                    fail(409, 'CANCELLATION_CLOSED', 'El concierto ya comenzó.');
                // A cancelled confirmed order frees its stock, voids its tickets and refunds its simulated payment.
                if (purchase.status === 'CONFIRMED') for (const item of initial.items) await repo.sold(item, -1);
                await repo.invalidateTickets(id);
                await repo.setPurchaseStatus(id, 'CANCELLED');
                if (purchase.status === 'CONFIRMED') {
                    const refunded = await repo.refund(id);
                    // Refunding a confirmed order frees the promotion use it consumed, exactly once (released_at guards a second release).
                    let promotionReleased = false;
                    if (purchase.promotion_id) {
                        await repo.promotions.lock(purchase.promotion_id);
                        promotionReleased = await repo.promotions.release(purchase.promotion_id, id);
                    }
                    await repo.audit({ actor: user.id, action: 'ORDER_REFUNDED', target: purchase.user_id, entity: { type: 'ORDER', id },
                        details: { amount: purchase.total, currency: purchase.currency, refunded_payments: refunded, simulated: true,
                            by_owner: purchase.user_id === user.id, promotion_code: purchase.promotion_code, promotion_released: promotionReleased } });
                }
            }
            return { expired: false as const, replayed: false as const, data: await this.details(repo, id) };
        });

        if ((result as { promotionExhausted?: boolean }).promotionExhausted) {
            fail(409, (result as { reason?: string }).reason ?? 'PROMOTION_EXHAUSTED', 'La promoción ya no está disponible o alcanzó su límite de usos. La reserva previa fue cancelada para liberar tus entradas; podés realizar la compra nuevamente a precio regular.');
        }
        if (result.expired) fail(409, 'RESERVATION_EXPIRED', 'La reserva venció.');
        return (result as { replayed?: boolean }).replayed ? { ...result.data, replayed: true } : result.data;
    }
    private async details(repo: CommerceRepository, id: string) {
        return { ...required(await repo.purchase(id)), items: await repo.items(id), payments: await repo.payments(id), simulated: true, notice: SIMULATED_PURCHASE_NOTICE };
    }
    tickets(user: Principal, query: PageQuery) { return this.run(false, repo => repo.tickets(user.id, query)); }
    ticket(id: string, user: Principal) { return this.run(false, async repo => required(await repo.ticket(id, ownerFilter(user)))); }
    async validate(input: ValidationInput, user: Principal) {
        const parsed = validationSchema.parse(input);
        // Rejections are committed together with their ticket_validations row, then reported.
        const outcome = await this.run(true, async repo => {
            const concert = await repo.concert(parsed.concertId);
            if (!can(user, P.ticketsValidateAll) && !await repo.assigned(parsed.concertId, user.id))
                fail(403, 'STAFF_NOT_ASSIGNED', 'Staff no asignado al concierto.');
            if (!concert) fail(404, 'INVALID', 'Entrada inválida.');
            const ticket = await repo.scan(parsed.qrToken);
            const reject = async (result: ScanResult, status: number, code: string, message: string) => {
                await repo.logScan(concert.id, ticket?.id ?? null, parsed.qrToken, result, user.id);
                return { error: new AppError(status, code, message, undefined) };
            };
            if (!ticket) return reject('NOT_FOUND', 404, 'INVALID', 'Entrada inválida.');
            if (ticket.concert_id !== parsed.concertId) return reject('WRONG_CONCERT', 409, 'WRONG_CONCERT', 'La entrada corresponde a otro concierto.');
            const purchase = required(await repo.lockPurchase(ticket.purchase_id));
            if (ticket.status === 'USED' || ticket.used_at !== null) return reject('ALREADY_USED', 409, 'ALREADY_USED', 'La entrada ya fue utilizada.');
            if (ticket.status === 'CANCELLED' || purchase.status === 'CANCELLED' || concert.status === 'CANCELLED')
                return reject('CANCELLED', 409, 'CANCELLED', 'Entrada o concierto cancelado.');
            if (ticket.status !== 'VALID' || purchase.status !== 'CONFIRMED' || concert.status !== 'PUBLISHED')
                fail(409, 'INVALID', 'Entrada inválida.');
            if (await repo.useTicket(ticket.id, user.id) !== 1) return reject('ALREADY_USED', 409, 'ALREADY_USED', 'La entrada ya no está disponible.');
            await repo.logScan(concert.id, ticket.id, parsed.qrToken, 'ACCEPTED', user.id);
            return { data: { result: 'VALID', ticket_id: ticket.id, concert_id: concert.id, status: 'USED' } };
        });
        if ('error' in outcome) throw outcome.error;
        return outcome.data;
    }
    adminListPromotions(query: PromotionQuery, _user: Principal) {
        return this.run(false, repo => repo.promotions.list(query));
    }
    async adminGetPromotion(id: string, _user: Principal) {
        const promo = await this.run(false, repo => repo.promotions.byId(id));
        if (!promo) fail(404, 'NOT_FOUND', 'Promoción no encontrada.');
        return promo;
    }
    async adminCreatePromotion(input: CreatePromotionInput, user: Principal) {
        return this.run(true, async repo => {
            const existing = await repo.promotions.byCode(input.code.trim().toUpperCase());
            if (existing) fail(409, 'PROMOTION_EXISTS', 'Ya existe una promoción con ese código.');
            if (input.concertId) {
                const concert = await repo.concert(input.concertId);
                if (!concert) fail(404, 'CONCERT_NOT_FOUND', 'El concierto asociado no existe.');
            }
            const promo = await repo.promotions.create(input);
            await repo.audit({
                actor: user.id, action: 'PROMOTION_CREATED', target: null,
                entity: { type: 'PROMOTION', id: promo.id },
                details: { code: promo.code, discount_type: promo.discount_type, discount_value: promo.discount_value },
            });
            return promo;
        });
    }
    // PASO 4 — VALIDACIÓN DE FECHAS EN ADMINISTRACIÓN:
    // Valida exhaustivamente que validUntil sea estrictamente posterior a validFrom en actualizaciones parciales o totales.
    async adminUpdatePromotion(id: string, input: UpdatePromotionInput, user: Principal) {
        return this.run(true, async repo => {
            const existing = await repo.promotions.lock(id);
            if (!existing) fail(404, 'NOT_FOUND', 'Promoción no encontrada.');
            if (input.maxUses !== undefined && input.maxUses !== null && input.maxUses < existing.current_uses) {
                fail(409, 'INVALID_MAX_USES', `El límite de usos no puede ser menor a los usos actuales (${existing.current_uses}).`);
            }

            const finalValidFrom = input.validFrom !== undefined ? new Date(input.validFrom) : new Date(existing.valid_from);
            const finalValidUntil = input.validUntil !== undefined ? new Date(input.validUntil) : new Date(existing.valid_until);

            if (isNaN(finalValidFrom.getTime()) || isNaN(finalValidUntil.getTime())) {
                fail(400, 'INVALID_DATE', 'Formato de fecha inválido.');
            }

            if (finalValidUntil.getTime() <= finalValidFrom.getTime()) {
                fail(400, 'INVALID_DATE_RANGE', 'La fecha de fin (validUntil) debe ser estrictamente posterior a la fecha de inicio (validFrom).');
            }

            const updated = await repo.promotions.update(id, input);
            await repo.audit({
                actor: user.id, action: 'PROMOTION_UPDATED', target: null,
                entity: { type: 'PROMOTION', id },
                details: { changes: input },
            });
            return updated;
        });
    }
    async adminDeletePromotion(id: string, user: Principal) {
        return this.run(true, async repo => {
            const existing = await repo.promotions.lock(id);
            if (!existing) fail(404, 'NOT_FOUND', 'Promoción no encontrada.');
            const result = await repo.promotions.delete(id);
            await repo.audit({
                actor: user.id, action: result.deleted ? 'PROMOTION_DELETED' : 'PROMOTION_DEACTIVATED', target: null,
                entity: { type: 'PROMOTION', id },
                details: { code: existing.code, result },
            });
            return result;
        });
    }
}
