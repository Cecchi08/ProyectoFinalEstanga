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
    // Ejecuta una unidad de trabajo contra MySQL en modo lectura o transacción ACID.
    private run<T>(transaction: boolean, work: (repo: CommerceRepository) => Promise<T>): Promise<T> {
        const callback = (repo: { connection: ConstructorParameters<typeof CommerceRepository>[0] }) => work(new CommerceRepository(repo.connection));
        return transaction ? this.database.transaction(callback) : this.database.read(callback);
    }
    // Crea una orden PENDING reservando stock por 15 minutos con soporte de idempotencia y cupones.
    async create(input: PurchaseInput, user: Principal, idempotencyKey: string): Promise<{ purchase: unknown; replayed: boolean }> {
        const parsed = purchaseSchema.parse(input);
        const items = [...parsed.items].sort((a, b) => ascending(a.ticketTypeId, b.ticketTypeId));
        // Mismo contenido = mismo hash, sin importar el orden de los ítems del cliente.
        // El código de promoción se suma al hash solo si existe para conservar compatibilidad histórica.
        const promotionCode = parsed.promotionCode ? normalizePromotionCode(parsed.promotionCode) : undefined;
        const requestHash = createHash('sha256').update(JSON.stringify({ concertId: parsed.concertId ?? null, items: items.map(item => [item.ticketTypeId, item.quantity]),
            ...(promotionCode ? { promotionCode } : {}) })).digest('hex');
        // Resuelve el concierto padre fuera de la transacción para no fijar un snapshot viejo antes de tomar locks.
        const first = await this.run(false, async repo => required(await repo.type(items[0].ticketTypeId)));
        const concertId = parsed.concertId ?? first.concert_id;
        try {
            return await this.run(true, async repo => {
                const concert = required(await repo.concert(concertId));
                // Lectura con bloqueo tras bloquear el concierto: si un reintento llega tarde, devuelve la orden original.
                const original = await repo.byIdempotencyKey(user.id, idempotencyKey, true);
                if (original) return this.replay(repo, original, requestHash);
                const types: TicketRow[] = [];
                for (const item of items) {
                    const type = required(await repo.type(item.ticketTypeId, true));
                    if (type.concert_id !== concert.id) fail(422, 'WRONG_CONCERT', 'Todas las entradas deben pertenecer al concierto seleccionado.');
                    types.push(type);
                }
                const now = await repo.now();
                // La reserva dura hasta 15 minutos o hasta el inicio del concierto (lo que ocurra primero).
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
                // El servidor calcula el descuento con los precios bloqueados; nunca confía en montos del cliente.
                // El cupón NO se consume aquí: recién se descuenta cuando la compra se confirma (ver transition).
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
            // Si otra petición concurrente con la misma Idempotency-Key ganó el insert, devuelve la compra original.
            if (!isIdempotencyCollision(error)) throw error;
            return this.run(false, async repo => this.replay(repo, required(await repo.byIdempotencyKey(user.id, idempotencyKey)), requestHash));
        }
    }
    // Vista previa para el checkout: aplica exactamente las mismas reglas que POST /purchases sin reservar ni consumir cupos.
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
    // confirm = pago simulado: APPROVED confirma la compra y emite las entradas con sus QR; REJECTED registra el rechazo y deja la orden PENDING.
    // cancel sobre una compra CONFIRMED equivale a un reembolso: anula las entradas/QR, devuelve el stock y marca el pago como REFUNDED.
    async transition(id: string, action: 'confirm' | 'cancel', user: Principal, outcome: PaymentOutcome = 'APPROVED') {
        const initial = await this.purchase(id, user);
        const result = await this.run(true, async repo => {
            // Orden estricto de bloqueos para evitar deadlocks: conciertos -> tipos de entrada (orden numérico ascendente) -> compra -> tickets.
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

                // Consume el uso del cupón recién ahora que la compra pasa realmente a CONFIRMED.
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

                // Emisión de entradas individuales: por cada unidad comprada se genera un token QR único
                // con createQrToken() y se guarda en la tabla `tickets` con estado inicial 'VALID'.
                for (const item of initial.items) {
                    await repo.sold(item, 1);
                    for (let index = 0; index < item.quantity; index++) await repo.addTicket(item, purchase.user_id, createQrToken());
                }
                // Registra el pago aprobado, deja traza en auditoría y envía notificación de compra al usuario.
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
                // Al cancelar una orden confirmada se libera el stock, se anulan sus tickets/QR y se reembolsa el pago simulado.
                if (purchase.status === 'CONFIRMED') for (const item of initial.items) await repo.sold(item, -1);
                await repo.invalidateTickets(id);
                await repo.setPurchaseStatus(id, 'CANCELLED');
                if (purchase.status === 'CONFIRMED') {
                    const refunded = await repo.refund(id);
                    // Al reembolsar una compra confirmada se libera una única vez el uso de la promoción (protegido por released_at).
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
    // Valida un código QR escaneado en puerta: verifica permisos del staff, estado del ticket/orden/concierto
    // y marca la entrada como USED de forma atómica registrando cada intento en `ticket_validations`.
    async validate(input: ValidationInput, user: Principal) {
        const parsed = validationSchema.parse(input);
        // Los rechazos también se guardan en `ticket_validations` dentro de la transacción antes de devolver el error.
        const outcome = await this.run(true, async repo => {
            const concert = await repo.concert(parsed.concertId);
            // Comprueba que el usuario tenga permiso global o asignación explícita al concierto.
            if (!can(user, P.ticketsValidateAll) && !await repo.assigned(parsed.concertId, user.id))
                fail(403, 'STAFF_NOT_ASSIGNED', 'Staff no asignado al concierto.');
            if (!concert) fail(404, 'INVALID', 'Entrada inválida.');
            // Busca el ticket por su qr_token único.
            const ticket = await repo.scan(parsed.qrToken);
            // Helper local para registrar el intento fallido en auditoría de escaneos y retornar error estructurado.
            const reject = async (result: ScanResult, status: number, code: string, message: string) => {
                await repo.logScan(concert.id, ticket?.id ?? null, parsed.qrToken, result, user.id);
                return { error: new AppError(status, code, message, undefined) };
            };
            if (!ticket) return reject('NOT_FOUND', 404, 'INVALID', 'Entrada inválida.');
            if (ticket.concert_id !== parsed.concertId) return reject('WRONG_CONCERT', 409, 'WRONG_CONCERT', 'La entrada corresponde a otro concierto.');
            // Bloquea la orden padre para evitar carreras con reembolsos o escaneos simultáneos.
            const purchase = required(await repo.lockPurchase(ticket.purchase_id));
            if (ticket.status === 'USED' || ticket.used_at !== null) return reject('ALREADY_USED', 409, 'ALREADY_USED', 'La entrada ya fue utilizada.');
            if (ticket.status === 'CANCELLED' || purchase.status === 'CANCELLED' || concert.status === 'CANCELLED')
                return reject('CANCELLED', 409, 'CANCELLED', 'Entrada o concierto cancelado.');
            if (ticket.status !== 'VALID' || purchase.status !== 'CONFIRMED' || concert.status !== 'PUBLISHED')
                fail(409, 'INVALID', 'Entrada inválida.');
            // Actualización condicional (status = 'VALID' AND used_at IS NULL) para impedir doble ingreso concurrente.
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
