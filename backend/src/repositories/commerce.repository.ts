import { randomBytes } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Row, Value, TicketRow, ConcertRow } from '../types/management.types.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';
import { NotificationsRepository } from './notifications.repository.ts';
import { ticketTypeSelect } from './management.repository.ts';
import { audit, type AuditEntry } from './audit.repository.ts';

export interface OrderKeyRow extends Row { id: string; request_hash: string | null }
export interface PurchaseRow extends Row { id: string; user_id: string; status: string; expires_at: Date | null; total: string; currency: string }
export interface ItemRow extends Row { id: string; ticket_type_id: string; concert_id: string; quantity: number; unit_price: string }
export interface ScanRow extends Row { id: string; purchase_id: string; concert_id: string; status: string; used_at: Date | null }
export type ScanResult = 'ACCEPTED' | 'ALREADY_USED' | 'CANCELLED' | 'WRONG_CONCERT' | 'NOT_FOUND';
// The API keeps the "purchase" vocabulary; the schema stores orders.
const effectiveStatus = `CASE WHEN o.status = 'PENDING' AND (o.expires_at IS NULL OR o.expires_at <= NOW())
    THEN 'EXPIRED' ELSE o.status END`;
const purchaseSelect = `SELECT o.id, o.public_code, o.user_id, ${effectiveStatus} AS status, o.expires_at, o.confirmed_at, o.cancelled_at,
    o.refund_status, o.refunded_at, o.created_at, o.total_amount AS total, o.currency FROM orders o`;
const ticketJoins = `FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id JOIN orders o ON o.id = oi.order_id
    JOIN ticket_types tt ON tt.id = t.ticket_type_id JOIN concerts c ON c.id = t.concert_id`;
const ticketSelect = `SELECT t.id, t.order_item_id AS purchase_item_id, t.qr_token, t.status, t.used_at, t.created_at,
    o.id AS purchase_id, tt.id AS ticket_type_id, tt.name AS ticket_type_name,
    c.id AS concert_id, c.title AS concert_name, c.status AS concert_status, c.starts_at AS start_datetime, c.ends_at AS end_datetime,
    c.venue_id, c.venue_name, c.address_line AS venue_address
    ${ticketJoins}`;

export class CommerceRepository {
    readonly notifications: NotificationsRepository;
    constructor(private readonly connection: PoolConnection) { this.notifications = new NotificationsRepository(connection); }
    async rows<T extends Row = Row>(sql: string, params: Value[] = []): Promise<T[]> {
        const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
        return (rows as T[]).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
            [key, value !== null && (key === 'id' || key.endsWith('_id')) ? String(value) : value])) as T);
    }
    async execute(sql: string, params: Value[] = []): Promise<number> {
        return (await this.connection.execute<ResultSetHeader>(sql, params))[0].affectedRows;
    }
    async now(): Promise<Date> { return (await this.rows('SELECT NOW() AS now'))[0].now as Date; }
    async type(id: string, lock = false): Promise<TicketRow | undefined> {
        return (await this.rows<TicketRow>(`${ticketTypeSelect} WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]))[0];
    }
    async concert(id: string): Promise<ConcertRow | undefined> {
        // Lock only the concert, not shared catalog rows; same parent-first order as Stage 3.
        return (await this.rows<ConcertRow>(`SELECT id, organizer_user_id AS organizer_id, title AS name, status,
            starts_at AS start_datetime, ends_at AS end_datetime FROM concerts WHERE id = ? FOR UPDATE`, [id]))[0];
    }
    async committed(typeId: string): Promise<number> {
        // First consistent table read occurs AFTER concert/type locks (also safe under REPEATABLE READ).
        const row = (await this.rows(`SELECT COALESCE(SUM(oi.quantity), 0) AS quantity FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.ticket_type_id = ? AND (o.status = 'CONFIRMED' OR (o.status = 'PENDING' AND o.expires_at > NOW()))`, [typeId]))[0];
        return Number(row.quantity);
    }
    async reserve(userId: string, expires: Date, idempotencyKey: string, requestHash: string): Promise<string> {
        await this.execute(`INSERT INTO orders (public_code, user_id, buyer_email, buyer_name, status, expires_at, idempotency_key, request_hash)
            SELECT ?, id, email, NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'PENDING', ?, ?, ? FROM users WHERE id = ?`,
        [`O-${randomBytes(6).toString('hex').toUpperCase()}`, expires, idempotencyKey, requestHash, userId]);
        return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id);
    }
    // Scoped to the owner: another user's key never reaches this row.
    async byIdempotencyKey(userId: string, idempotencyKey: string, lock = false): Promise<OrderKeyRow | undefined> {
        return (await this.rows<OrderKeyRow>(`SELECT id, request_hash FROM orders WHERE user_id = ? AND idempotency_key = ?${lock ? ' FOR UPDATE' : ''}`, [userId, idempotencyKey]))[0];
    }
    async addItem(purchaseId: string, type: TicketRow, quantity: number): Promise<void> {
        await this.execute(`INSERT INTO order_items (order_id, ticket_type_id, concert_id, quantity, unit_price, line_total)
            VALUES (?, ?, ?, ?, ?, ? * ?)`, [purchaseId, type.id, type.concert_id, quantity, type.price, quantity, type.price]);
    }
    async total(purchaseId: string): Promise<void> {
        await this.execute(`UPDATE orders o SET o.total_amount = (SELECT COALESCE(SUM(oi.line_total), 0) FROM order_items oi WHERE oi.order_id = o.id)
            WHERE o.id = ?`, [purchaseId]);
    }
    async purchase(id: string, ownerId?: string): Promise<PurchaseRow | undefined> {
        return (await this.rows<PurchaseRow>(`${purchaseSelect} WHERE o.id = ?${ownerId ? ' AND o.user_id = ?' : ''}`, ownerId ? [id, ownerId] : [id]))[0];
    }
    async lockPurchase(id: string): Promise<PurchaseRow | undefined> {
        return (await this.rows<PurchaseRow>(`SELECT id, user_id, status, expires_at, total_amount AS total, currency
            FROM orders WHERE id = ? FOR UPDATE`, [id]))[0];
    }
    // Simulated payments only: an outcome and a reference, never card or bank data.
    async addPayment(purchase: PurchaseRow, payerId: string, status: 'APPROVED' | 'REJECTED'): Promise<string> {
        await this.execute(`INSERT INTO order_payments (order_id, payer_user_id, amount, currency, status, simulated_reference, processed_at)
            VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`, [purchase.id, payerId, purchase.total, purchase.currency, status,
            `SIM-${randomBytes(8).toString('hex').toUpperCase()}`]);
        return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id);
    }
    async payments(purchaseId: string) {
        return (await this.rows(`SELECT id, amount, currency, status, provider, is_simulated, simulated_reference, processed_at, refunded_at, created_at
            FROM order_payments WHERE order_id = ? ORDER BY id`, [purchaseId])).map(payment => ({ ...payment, is_simulated: Boolean(payment.is_simulated) }));
    }
    // Cancelling a confirmed purchase returns its approved simulated payment. The order must already be CANCELLED (chk_orders_refunded).
    async refund(purchaseId: string): Promise<number> {
        const payments = await this.execute(`UPDATE order_payments SET status = 'REFUNDED', refunded_at = UTC_TIMESTAMP()
            WHERE order_id = ? AND status = 'APPROVED'`, [purchaseId]);
        await this.execute(`UPDATE orders SET refund_status = 'REFUNDED', refunded_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'CANCELLED'`, [purchaseId]);
        return payments;
    }
    audit(entry: AuditEntry) { return audit(this.connection, entry); }
    async items(id: string): Promise<ItemRow[]> {
        return this.rows<ItemRow>(`SELECT oi.id, oi.ticket_type_id, oi.quantity, oi.unit_price, oi.line_total, oi.concert_id,
            tt.name AS ticket_type_name FROM order_items oi JOIN ticket_types tt ON tt.id = oi.ticket_type_id
            WHERE oi.order_id = ? ORDER BY oi.ticket_type_id`, [id]);
    }
    async purchases(userId: string, query: PageQuery) {
        const total = Number((await this.rows('SELECT COUNT(*) AS total FROM orders WHERE user_id = ?', [userId]))[0].total);
        const data = await this.rows(`${purchaseSelect} WHERE o.user_id = ? ORDER BY o.id DESC LIMIT ? OFFSET ?`,
            [userId, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data, total };
    }
    async setPurchaseStatus(id: string, status: 'EXPIRED' | 'CANCELLED'): Promise<void> {
        // chk_orders_cancelled requires cancelled_at for CANCELLED.
        await this.execute(`UPDATE orders SET status = ?, cancelled_at = IF(? = 'CANCELLED', COALESCE(cancelled_at, NOW()), cancelled_at)
            WHERE id = ?`, [status, status, id]);
    }
    async confirm(id: string): Promise<number> {
        return this.execute(`UPDATE orders SET status = 'CONFIRMED', confirmed_at = NOW()
            WHERE id = ? AND status = 'PENDING' AND expires_at > NOW()`, [id]);
    }
    // Keeps ticket_types.quantity_sold in step with confirmed orders; the caller holds the ticket type locks.
    async sold(item: ItemRow, sign: 1 | -1): Promise<void> {
        await this.execute('UPDATE ticket_types SET quantity_sold = quantity_sold + ? WHERE id = ?', [sign * item.quantity, item.ticket_type_id]);
    }
    async addTicket(item: ItemRow, ownerId: string, token: string): Promise<void> {
        await this.execute(`INSERT INTO tickets (order_item_id, concert_id, ticket_type_id, owner_user_id, qr_token, status)
            VALUES (?, ?, ?, ?, ?, 'VALID')`, [item.id, item.concert_id, item.ticket_type_id, ownerId, token]);
    }
    async purchaseTickets(id: string): Promise<Row[]> {
        return this.rows(`SELECT id, used_at FROM tickets WHERE order_item_id IN
            (SELECT id FROM order_items WHERE order_id = ?) ORDER BY id FOR UPDATE`, [id]);
    }
    async invalidateTickets(id: string): Promise<void> {
        await this.execute(`UPDATE tickets t JOIN order_items oi ON oi.id = t.order_item_id
            SET t.status = 'CANCELLED' WHERE oi.order_id = ?`, [id]);
    }
    async tickets(userId: string, query: PageQuery) {
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${ticketJoins} WHERE o.user_id = ?`, [userId]))[0].total);
        const data = await this.rows(`${ticketSelect} WHERE o.user_id = ? ORDER BY t.id DESC LIMIT ? OFFSET ?`,
            [userId, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data, total };
    }
    async ticket(id: string, ownerId?: string): Promise<Row | undefined> {
        return (await this.rows(`${ticketSelect} WHERE t.id = ?${ownerId ? ' AND o.user_id = ?' : ''}`, ownerId ? [id, ownerId] : [id]))[0];
    }
    async scan(token: string): Promise<ScanRow | undefined> {
        return (await this.rows<ScanRow>(`SELECT t.id, oi.order_id AS purchase_id, t.concert_id, t.status, t.used_at
            FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id WHERE t.qr_token = ?`, [token]))[0];
    }
    async assigned(concertId: string, userId: string): Promise<boolean> {
        return (await this.rows('SELECT user_id FROM concert_staff WHERE concert_id = ? AND user_id = ? FOR SHARE', [concertId, userId])).length > 0;
    }
    async useTicket(id: string, userId: string): Promise<number> {
        return this.execute(`UPDATE tickets SET status = 'USED', used_at = NOW(), validated_by_user_id = ?
            WHERE id = ? AND status = 'VALID' AND used_at IS NULL`, [userId, id]);
    }
    // Audit trail of every scan, including rejected ones; never stores more than the scanned token.
    async logScan(concertId: string, ticketId: string | null, token: string, result: ScanResult, userId: string): Promise<void> {
        await this.execute(`INSERT INTO ticket_validations (ticket_id, concert_id, scanned_token, result, validated_by_user_id)
            SELECT ?, id, ?, ?, ? FROM concerts WHERE id = ?`, [ticketId, token.slice(0, 255), result, userId, concertId]);
    }
}
