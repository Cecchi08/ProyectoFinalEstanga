import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Row, Value, TicketRow, ConcertRow } from '../types/management.types.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';

export interface PurchaseRow extends Row { id: string; user_id: string; status: string; expires_at: Date | null }
export interface ItemRow extends Row { id: string; ticket_type_id: string; concert_id: string; quantity: number; unit_price: string }
export interface ScanRow extends Row { id: string; purchase_id: string; concert_id: string; status: string; used_at: Date | null }
const effectiveStatus = `CASE WHEN ps.code IN ('PENDING', 'RESERVED') AND (p.expires_at IS NULL OR p.expires_at <= NOW())
    THEN 'EXPIRED' ELSE ps.code END`;
const purchaseSelect = `SELECT p.id, p.user_id, ${effectiveStatus} AS status, p.expires_at, p.created_at,
    (SELECT COALESCE(SUM(pi.quantity * pi.unit_price), 0) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS total
    FROM purchases p JOIN purchase_statuses ps ON ps.id = p.status_id`;
const ticketJoins = `FROM tickets t JOIN ticket_statuses ts ON ts.id = t.status_id
    JOIN purchase_items pi ON pi.id = t.purchase_item_id JOIN purchases p ON p.id = pi.purchase_id
    JOIN ticket_types tt ON tt.id = pi.ticket_type_id JOIN concerts c ON c.id = tt.concert_id`;
const ticketSelect = `SELECT t.id, t.purchase_item_id, t.qr_token, ts.code AS status, t.used_at, t.created_at,
    p.id AS purchase_id, tt.id AS ticket_type_id, tt.name AS ticket_type_name,
    c.id AS concert_id, c.name AS concert_name, cs.code AS concert_status, c.start_datetime, c.end_datetime,
    v.id AS venue_id, v.name AS venue_name, v.address AS venue_address
    ${ticketJoins} JOIN concert_statuses cs ON cs.id = c.status_id JOIN venues v ON v.id = c.venue_id`;

export class CommerceRepository {
    constructor(private readonly connection: PoolConnection) {}
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
        return (await this.rows<TicketRow>(`SELECT * FROM ticket_types WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]))[0];
    }
    async concert(id: string): Promise<ConcertRow | undefined> {
        // Lock only the concert, not shared catalog rows; same parent-first order as Stage 3.
        if (!(await this.rows('SELECT id FROM concerts WHERE id = ? FOR UPDATE', [id]))[0]) return undefined;
        return (await this.rows<ConcertRow>(`SELECT c.*, cs.code AS status FROM concerts c
            JOIN concert_statuses cs ON cs.id = c.status_id WHERE c.id = ? FOR SHARE`, [id]))[0];
    }
    async committed(typeId: string): Promise<number> {
        // First consistent table read occurs AFTER concert/type locks (also safe under REPEATABLE READ).
        const row = (await this.rows(`SELECT COALESCE(SUM(pi.quantity), 0) AS quantity FROM purchase_items pi
            JOIN purchases p ON p.id = pi.purchase_id JOIN purchase_statuses ps ON ps.id = p.status_id
            WHERE pi.ticket_type_id = ? AND (ps.code = 'CONFIRMED' OR
                (ps.code IN ('PENDING', 'RESERVED') AND p.expires_at > NOW()))`, [typeId]))[0];
        return Number(row.quantity);
    }
    async reserve(userId: string, expires: Date): Promise<string> {
        await this.execute(`INSERT INTO purchases (user_id, status_id, expires_at)
            SELECT ?, id, ? FROM purchase_statuses WHERE code = 'RESERVED'`, [userId, expires]);
        return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id);
    }
    async addItem(purchaseId: string, type: TicketRow, quantity: number): Promise<void> {
        await this.execute('INSERT INTO purchase_items (purchase_id, ticket_type_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
            [purchaseId, type.id, quantity, type.price]);
    }
    async purchase(id: string, ownerId?: string): Promise<PurchaseRow | undefined> {
        return (await this.rows<PurchaseRow>(`${purchaseSelect} WHERE p.id = ?${ownerId ? ' AND p.user_id = ?' : ''}`, ownerId ? [id, ownerId] : [id]))[0];
    }
    async lockPurchase(id: string): Promise<PurchaseRow | undefined> {
        if (!(await this.rows('SELECT id FROM purchases WHERE id = ? FOR UPDATE', [id]))[0]) return undefined;
        return (await this.rows<PurchaseRow>(`SELECT p.id, p.user_id, ps.code AS status, p.expires_at FROM purchases p
            JOIN purchase_statuses ps ON ps.id = p.status_id WHERE p.id = ? FOR SHARE`, [id]))[0];
    }
    async items(id: string): Promise<ItemRow[]> {
        return this.rows<ItemRow>(`SELECT pi.id, pi.ticket_type_id, pi.quantity, pi.unit_price, tt.concert_id,
            tt.name AS ticket_type_name FROM purchase_items pi JOIN ticket_types tt ON tt.id = pi.ticket_type_id
            WHERE pi.purchase_id = ? ORDER BY pi.ticket_type_id`, [id]);
    }
    async purchases(userId: string, query: PageQuery) {
        const total = Number((await this.rows('SELECT COUNT(*) AS total FROM purchases WHERE user_id = ?', [userId]))[0].total);
        const data = await this.rows(`${purchaseSelect} WHERE p.user_id = ? ORDER BY p.id DESC LIMIT ? OFFSET ?`,
            [userId, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data, total };
    }
    async setPurchaseStatus(id: string, status: string): Promise<void> {
        await this.execute('UPDATE purchases SET status_id = (SELECT id FROM purchase_statuses WHERE code = ?) WHERE id = ?', [status, id]);
    }
    async confirm(id: string): Promise<number> {
        return this.execute(`UPDATE purchases SET status_id = (SELECT id FROM purchase_statuses WHERE code = 'CONFIRMED')
            WHERE id = ? AND status_id IN (SELECT id FROM purchase_statuses WHERE code IN ('PENDING', 'RESERVED'))
            AND expires_at > NOW()`, [id]);
    }
    async addTicket(itemId: string, token: string): Promise<void> {
        await this.execute(`INSERT INTO tickets (purchase_item_id, qr_token, status_id)
            SELECT ?, ?, id FROM ticket_statuses WHERE code = 'ACTIVE'`, [itemId, token]);
    }
    async purchaseTickets(id: string): Promise<Row[]> {
        return this.rows(`SELECT id, used_at FROM tickets WHERE purchase_item_id IN
            (SELECT id FROM purchase_items WHERE purchase_id = ?) ORDER BY id FOR UPDATE`, [id]);
    }
    async invalidateTickets(id: string, status: string): Promise<void> {
        await this.execute(`UPDATE tickets t JOIN purchase_items pi ON pi.id = t.purchase_item_id
            SET t.status_id = (SELECT id FROM ticket_statuses WHERE code = ?) WHERE pi.purchase_id = ?`, [status, id]);
    }
    async tickets(userId: string, query: PageQuery) {
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${ticketJoins} WHERE p.user_id = ?`, [userId]))[0].total);
        const data = await this.rows(`${ticketSelect} WHERE p.user_id = ? ORDER BY t.id DESC LIMIT ? OFFSET ?`,
            [userId, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data, total };
    }
    async ticket(id: string, ownerId?: string): Promise<Row | undefined> {
        return (await this.rows(`${ticketSelect} WHERE t.id = ?${ownerId ? ' AND p.user_id = ?' : ''}`, ownerId ? [id, ownerId] : [id]))[0];
    }
    async scan(token: string): Promise<ScanRow | undefined> {
        return (await this.rows<ScanRow>(`SELECT t.id, p.id AS purchase_id, c.id AS concert_id, ts.code AS status, t.used_at
            ${ticketJoins} WHERE t.qr_token = ?`, [token]))[0];
    }
    async assigned(concertId: string, userId: string): Promise<boolean> {
        return (await this.rows('SELECT user_id FROM staff_assignments WHERE concert_id = ? AND user_id = ? FOR SHARE', [concertId, userId])).length > 0;
    }
    async useTicket(id: string, userId: string): Promise<number> {
        return this.execute(`UPDATE tickets SET status_id = (SELECT id FROM ticket_statuses WHERE code = 'USED'),
            used_at = NOW(), used_by_user_id = ? WHERE id = ?
            AND status_id = (SELECT id FROM ticket_statuses WHERE code = 'ACTIVE') AND used_at IS NULL`, [userId, id]);
    }
}
