import { createHash } from 'node:crypto';
import { AppError } from '../utils/app-error.util.js';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
import { createQrToken } from '../utils/qr.util.ts';
import { CommerceRepository, type OrderKeyRow, type PurchaseRow, type ScanResult } from '../repositories/commerce.repository.ts';
import type { Database, Principal, ConcertRow, TicketRow } from '../types/management.types.ts';
import { purchaseSchema, validationSchema, type PurchaseInput, type PageQuery, type ValidationInput } from '../validators/commerce.schemas.ts';

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
        const requestHash = createHash('sha256').update(JSON.stringify({ concertId: parsed.concertId ?? null, items: items.map(item => [item.ticketTypeId, item.quantity]) })).digest('hex');
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
                const id = await repo.reserve(user.id, new Date(expires), idempotencyKey, requestHash);
                for (const [index, type] of types.entries()) await repo.addItem(id, type, items[index].quantity);
                await repo.total(id);
                return { purchase: { ...required(await repo.purchase(id)), items: await repo.items(id) }, replayed: false };
            });
        } catch (error) {
            // A concurrent request with the same key committed first and the unique index rejected this insert:
            // this attempt rolled back completely (no stock, reservation or payment), so return the original.
            if (!isIdempotencyCollision(error)) throw error;
            return this.run(false, async repo => this.replay(repo, required(await repo.byIdempotencyKey(user.id, idempotencyKey)), requestHash));
        }
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
            if (purchase.status === 'PENDING' && (!purchase.expires_at || purchase.expires_at <= now)) {
                await repo.setPurchaseStatus(id, 'EXPIRED');
                return { expired: true as const };
            }
            if (purchase.status === 'EXPIRED') return { expired: true as const };
            if (action === 'confirm') {
                if (purchase.status !== 'PENDING') fail(409, 'INVALID_STATE', 'La compra no puede confirmarse.');
                for (const type of types.values()) sale(required(concerts.get(type.concert_id)), type, now);
                if ((await repo.purchaseTickets(id)).length) fail(409, 'INVALID_STATE', 'La compra ya tiene entradas.');
                if (outcome === 'REJECTED') {
                    const paymentId = await repo.addPayment(purchase, user.id, 'REJECTED');
                    await repo.audit({ actor: user.id, action: 'ORDER_PAYMENT_REJECTED', target: purchase.user_id, entity: { type: 'ORDER', id },
                        details: { payment_id: paymentId, amount: purchase.total, currency: purchase.currency, simulated: true } });
                    return { expired: false as const, data: await this.details(repo, id) };
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
                    await repo.audit({ actor: user.id, action: 'ORDER_REFUNDED', target: purchase.user_id, entity: { type: 'ORDER', id },
                        details: { amount: purchase.total, currency: purchase.currency, refunded_payments: refunded, simulated: true,
                            by_owner: purchase.user_id === user.id } });
                }
            }
            return { expired: false as const, data: await this.details(repo, id) };
        });
        // Persist EXPIRED before returning the conflict; every other failure rolls back the transaction.
        if (result.expired) fail(409, 'RESERVATION_EXPIRED', 'La reserva venció.');
        return result.data;
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
}
