import { AppError } from '../utils/app-error.util.js';
import { createQrToken } from '../utils/qr.util.ts';
import { CommerceRepository, type PurchaseRow } from '../repositories/commerce.repository.ts';
import type { Database, Principal, ConcertRow, TicketRow } from '../types/management.types.ts';
import { purchaseSchema, validationSchema, type PurchaseInput, type PageQuery, type ValidationInput } from '../validators/commerce.schemas.ts';

function fail(status: number, code: string, message: string): never { throw new AppError(status, code, message, undefined); }
const required = <T>(value: T | undefined): T => value ?? fail(404, 'NOT_FOUND', 'Recurso inexistente.');
const ownerFilter = (user: Principal) => user.roles.includes('ADMIN') ? undefined : user.id;
const ascending = (a: string, b: string) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
function owner(purchase: PurchaseRow, user: Principal): void {
    if (purchase.user_id !== user.id && !user.roles.includes('ADMIN')) fail(404, 'NOT_FOUND', 'Recurso inexistente.');
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
    async create(input: PurchaseInput, user: Principal) {
        const parsed = purchaseSchema.parse(input);
        const items = [...parsed.items].sort((a, b) => ascending(a.ticketTypeId, b.ticketTypeId));
        // Resolve the immutable parent outside the transaction: never establish a stale RR snapshot before locks.
        const first = await this.run(false, async repo => required(await repo.type(items[0].ticketTypeId)));
        const concertId = parsed.concertId ?? first.concert_id;
        return this.run(true, async repo => {
            const concert = required(await repo.concert(concertId));
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
            const id = await repo.reserve(user.id, new Date(expires));
            for (const [index, type] of types.entries()) await repo.addItem(id, type, items[index].quantity);
            return { ...required(await repo.purchase(id)), items: await repo.items(id) };
        });
    }
    purchases(user: Principal, query: PageQuery) { return this.run(false, repo => repo.purchases(user.id, query)); }
    async purchase(id: string, user: Principal) {
        return this.run(false, async repo => ({ ...required(await repo.purchase(id, ownerFilter(user))), items: await repo.items(id) }));
    }
    async transition(id: string, action: 'confirm' | 'cancel', user: Principal) {
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
            if (['PENDING', 'RESERVED'].includes(purchase.status) && (!purchase.expires_at || purchase.expires_at <= now)) {
                await repo.setPurchaseStatus(id, 'EXPIRED');
                return { expired: true as const };
            }
            if (purchase.status === 'EXPIRED') return { expired: true as const };
            if (action === 'confirm') {
                if (!['PENDING', 'RESERVED'].includes(purchase.status)) fail(409, 'INVALID_STATE', 'La compra no puede confirmarse.');
                for (const type of types.values()) sale(required(concerts.get(type.concert_id)), type, now);
                if ((await repo.purchaseTickets(id)).length) fail(409, 'INVALID_STATE', 'La compra ya tiene entradas.');
                if (await repo.confirm(id) !== 1) {
                    await repo.setPurchaseStatus(id, 'EXPIRED');
                    return { expired: true as const };
                }
                for (const item of initial.items)
                    for (let index = 0; index < item.quantity; index++) await repo.addTicket(item.id, createQrToken());
            } else {
                if (!['PENDING', 'RESERVED', 'CONFIRMED'].includes(purchase.status)) fail(409, 'INVALID_STATE', 'La compra no puede cancelarse.');
                const tickets = await repo.purchaseTickets(id);
                if (tickets.some(ticket => ticket.used_at !== null)) fail(409, 'TICKET_ALREADY_USED', 'La compra contiene entradas utilizadas.');
                if (purchase.status === 'CONFIRMED' && [...concerts.values()].some(concert => concert.status !== 'CANCELLED' && concert.start_datetime <= now))
                    fail(409, 'CANCELLATION_CLOSED', 'El concierto ya comenzó.');
                const status = purchase.status === 'CONFIRMED' ? 'REFUNDED' : 'CANCELLED';
                await repo.invalidateTickets(id, status);
                await repo.setPurchaseStatus(id, status);
            }
            return { expired: false as const, data: { ...required(await repo.purchase(id)), items: await repo.items(id) } };
        });
        // Persist EXPIRED before returning the conflict; every other failure rolls back the transaction.
        if (result.expired) fail(409, 'RESERVATION_EXPIRED', 'La reserva venció.');
        return result.data;
    }
    tickets(user: Principal, query: PageQuery) { return this.run(false, repo => repo.tickets(user.id, query)); }
    ticket(id: string, user: Principal) { return this.run(false, async repo => required(await repo.ticket(id, ownerFilter(user)))); }
    async validate(input: ValidationInput, user: Principal) {
        if (!user.roles.some(role => ['STAFF', 'ADMIN'].includes(role))) fail(403, 'FORBIDDEN', 'Permisos insuficientes.');
        const parsed = validationSchema.parse(input);
        return this.run(true, async repo => {
            const concert = await repo.concert(parsed.concertId);
            if (!user.roles.includes('ADMIN') && !await repo.assigned(parsed.concertId, user.id))
                fail(403, 'STAFF_NOT_ASSIGNED', 'Staff no asignado al concierto.');
            if (!concert) fail(404, 'INVALID', 'Entrada inválida.');
            const ticket = await repo.scan(parsed.qrToken);
            if (!ticket) fail(404, 'INVALID', 'Entrada inválida.');
            if (ticket.concert_id !== parsed.concertId) fail(409, 'WRONG_CONCERT', 'La entrada corresponde a otro concierto.');
            const purchase = required(await repo.lockPurchase(ticket.purchase_id));
            if (ticket.status === 'USED' || ticket.used_at !== null) fail(409, 'ALREADY_USED', 'La entrada ya fue utilizada.');
            if (['CANCELLED', 'REFUNDED'].includes(ticket.status) || ['CANCELLED', 'REFUNDED'].includes(purchase.status) || concert.status === 'CANCELLED')
                fail(409, 'CANCELLED', 'Entrada o concierto cancelado.');
            if (ticket.status !== 'ACTIVE' || purchase.status !== 'CONFIRMED' || concert.status !== 'PUBLISHED')
                fail(409, 'INVALID', 'Entrada inválida.');
            if (await repo.useTicket(ticket.id, user.id) !== 1) fail(409, 'ALREADY_USED', 'La entrada ya no está disponible.');
            return { result: 'VALID', ticket_id: ticket.id, concert_id: concert.id, status: 'USED' };
        });
    }
}
