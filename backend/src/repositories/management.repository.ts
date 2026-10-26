import { randomBytes } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Catalog, ConcertRow, TicketRow, Fields, Row, Value, Principal } from '../types/management.types.ts';
import type { CatalogQuery, ConcertQuery } from '../validators/management.schemas.ts';
import { PERMISSIONS as P, can } from '../utils/access.util.js';

// SQL identifiers originate only from these application-owned allowlists: API field -> column.
const columns = {
    genres: { name: 'name', slug: 'slug' }, provinces: { code: 'code', name: 'name' },
    districts: { province_id: 'province_id', name: 'name' },
    cities: { province_id: 'province_id', district_id: 'district_id', name: 'name', postal_code: 'postal_code' },
    concerts: { organizer_id: 'organizer_user_id', venue_id: 'venue_id', reservation_id: 'reservation_id', city_id: 'city_id',
        venue_name: 'venue_name', address_line: 'address_line', name: 'title', slug: 'slug', artist_name: 'artist_name',
        description: 'description', image_url: 'image_url', start_datetime: 'starts_at', end_datetime: 'ends_at',
        status: 'status', published_at: 'published_at' },
    ticket_types: { concert_id: 'concert_id', name: 'name', price: 'price', stock_total: 'quantity_total',
        sale_start: 'sales_start_at', sale_end: 'sales_end_at', max_per_purchase: 'max_per_order' },
} as const;
type Table = keyof typeof columns;
// max_per_order is NOT NULL in the schema; the API keeps null as "no limit" using the SMALLINT maximum.
export const UNLIMITED_PER_ORDER = 65535;
export const ticketTypeSelect = `SELECT id, concert_id, name, description, price, currency, quantity_total AS stock_total, quantity_sold,
    sales_start_at AS sale_start, sales_end_at AS sale_end, NULLIF(max_per_order, ${UNLIMITED_PER_ORDER}) AS max_per_purchase,
    is_active, created_at, updated_at FROM ticket_types`;
const selects: Record<Table, string> = {
    genres: 'SELECT * FROM genres', provinces: 'SELECT * FROM provinces', districts: 'SELECT * FROM districts', cities: 'SELECT * FROM cities',
    concerts: 'SELECT id FROM concerts', ticket_types: ticketTypeSelect,
};
const placeholders = (ids: string[]) => ids.map(() => '?').join(',');
const normalize = <T extends Row>(row: T): T => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value !== null && (key === 'id' || key.endsWith('_id')) ? String(value) : value])) as T;
export const slugify = (value: string, max = 150) => `${value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'item'}-${randomBytes(3).toString('hex')}`;
export const concertSelect = `SELECT c.id, c.organizer_user_id AS organizer_id, c.organization_id, c.title AS name, c.slug, c.artist_name,
    c.description, c.image_url, c.venue_id, c.reservation_id, c.venue_name, c.address_line, c.city_id, ci.name AS city_name,
    ci.province_id, p.name AS province_name, c.doors_open_at, c.starts_at AS start_datetime, c.ends_at AS end_datetime,
    c.status, c.published_at, c.created_at, c.updated_at
    FROM concerts c LEFT JOIN cities ci ON ci.id = c.city_id LEFT JOIN provinces p ON p.id = ci.province_id`;

export class ManagementRepository {
    constructor(private readonly connection: PoolConnection) {}
    async rows<T extends Row = Row>(sql: string, params: Value[] = []): Promise<T[]> {
        const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
        return (rows as T[]).map(normalize);
    }
    private fields(table: Table, data: Fields): [string[], Value[]] {
        const map = columns[table] as Record<string, string>;
        const keys = Object.keys(map).filter(key => data[key] !== undefined);
        const value = (key: string) => table === 'ticket_types' && key === 'max_per_purchase' && data[key] === null ? UNLIMITED_PER_ORDER : data[key] ?? null;
        return [keys.map(key => map[key]), keys.map(value)];
    }
    async insert(table: Table, data: Fields): Promise<string> {
        const [keys, values] = this.fields(table, data);
        await this.connection.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, values);
        return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id);
    }
    async update(table: Table, id: string, data: Fields): Promise<void> {
        const [keys, values] = this.fields(table, data);
        if (keys.length) await this.connection.execute(`UPDATE ${table} SET ${keys.map(key => `${key} = ?`).join(',')} WHERE id = ?`, [...values, id]);
    }
    async remove(table: Table, id: string): Promise<void> { await this.connection.execute(`DELETE FROM ${table} WHERE id = ?`, [id]); }
    async find(table: Table, id: string, lock = false): Promise<Row | undefined> {
        return (await this.rows(`${selects[table]} WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]))[0];
    }
    async catalog(table: Catalog, query: CatalogQuery) {
        const where: string[] = []; const values: Value[] = [];
        if (query.q) { where.push('name LIKE ?'); values.push(`%${query.q}%`); }
        const parents = table === 'cities' ? ['province_id', 'district_id'] as const : table === 'districts' ? ['province_id'] as const : [];
        for (const parent of parents) if (query[parent]) { where.push(`${parent} = ?`); values.push(query[parent]); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const total = Number((await this.rows(`SELECT COUNT(*) AS total FROM ${table}${clause}`, values))[0].total);
        const data = await this.rows(`SELECT * FROM ${table}${clause} ORDER BY name, id LIMIT ? OFFSET ?`, [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data, total };
    }
    async replaceGenres(id: string, ids: string[]): Promise<void> {
        await this.connection.execute('DELETE FROM concert_genres WHERE concert_id = ?', [id]);
        if (ids.length) await this.connection.execute(`INSERT INTO concert_genres (concert_id, genre_id) VALUES ${ids.map(() => '(?, ?)').join(',')}`, ids.flatMap(value => [id, value]));
    }
    async genreReferenced(id: string): Promise<boolean> {
        // concert_genres cascades on delete: refuse instead of silently untagging concerts.
        return (await this.rows('SELECT genre_id FROM concert_genres WHERE genre_id = ? LIMIT 1', [id])).length > 0;
    }
    async organizerExists(id: string): Promise<boolean> {
        // An owner is any active account whose profiles grant concerts.manage.
        return (await this.rows(`SELECT u.id FROM users u WHERE u.id = ? AND u.status = 'ACTIVE' AND EXISTS
            (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id JOIN permissions p ON p.id = rp.permission_id
             WHERE ur.user_id = u.id AND p.code = ?)`, [id, P.concertsManage])).length > 0;
    }
    // Location snapshot of a marketplace venue; concerts keep their own copy so later venue edits do not rewrite history.
    async venueSnapshot(id: string): Promise<{ venue_name: string; address_line: string; city_id: string } | undefined> {
        return (await this.rows<{ venue_name: string; address_line: string; city_id: string }>(`SELECT CONCAT(e.name, ' - ', v.name) AS venue_name,
            e.address_line, e.city_id FROM venues v JOIN establishments e ON e.id = v.establishment_id WHERE v.id = ?`, [id]))[0];
    }
    async reservation(id: string): Promise<Row | undefined> {
        return (await this.rows(`SELECT id, user_id, venue_id, status_code, event_start_at, event_end_at FROM reservations WHERE id = ? FOR SHARE`, [id]))[0];
    }
    async concert(id: string, lock = false): Promise<ConcertRow | undefined> {
        // Lock the parent before reading children. Every child writer uses this lock order.
        if (lock && !(await this.find('concerts', id, true))) return undefined;
        return (await this.rows<ConcertRow>(`${concertSelect} WHERE c.id = ?`, [id]))[0];
    }
    async concertList(query: ConcertQuery, user?: Principal) {
        const where: string[] = []; const values: Value[] = [];
        if (!can(user, P.concertsManageAll)) {
            if (user && can(user, P.concertsManage)) { where.push("(c.status = 'PUBLISHED' OR c.organizer_user_id = ?)"); values.push(user.id); }
            else where.push("c.status = 'PUBLISHED'");
        }
        if (query.mine && user) { where.push('c.organizer_user_id = ?'); values.push(user.id); }
        for (const [key, column] of [['venue_id', 'c.venue_id'], ['city_id', 'c.city_id'], ['status', 'c.status']] as const) {
            if (query[key]) { where.push(`${column} = ?`); values.push(query[key]); }
        }
        if (query.genre_id) { where.push('EXISTS (SELECT 1 FROM concert_genres rel WHERE rel.concert_id = c.id AND rel.genre_id = ?)'); values.push(query.genre_id); }
        if (query.artist) { where.push('c.artist_name LIKE ?'); values.push(`%${query.artist}%`); }
        for (const key of ['q', 'name'] as const) if (query[key]) { where.push('c.title LIKE ?'); values.push(`%${query[key]}%`); }
        if (query.date_from) { where.push('c.starts_at >= ?'); values.push(query.date_from); }
        if (query.date_to) { where.push('c.starts_at <= ?'); values.push(query.date_to); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const total = Number((await this.rows(`SELECT COUNT(*) AS total FROM concerts c${clause}`, values))[0].total);
        const rows = await this.rows<ConcertRow>(`${concertSelect}${clause} ORDER BY c.starts_at, c.id LIMIT ? OFFSET ?`, [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data: await this.concertDetails(rows), total };
    }
    async tickets(id: string): Promise<TicketRow[]> { return this.rows<TicketRow>(`${ticketTypeSelect} WHERE concert_id = ? ORDER BY id`, [id]); }
    async ticket(id: string): Promise<TicketRow | undefined> { return (await this.rows<TicketRow>(`${ticketTypeSelect} WHERE id = ?`, [id]))[0]; }
    async concertDetails(rows: ConcertRow[]) {
        if (!rows.length) return [];
        const ids = rows.map(row => row.id); const marks = placeholders(ids);
        const genres = await this.rows(`SELECT cg.concert_id, g.* FROM concert_genres cg JOIN genres g ON g.id = cg.genre_id WHERE cg.concert_id IN (${marks}) ORDER BY g.name, g.id`, ids);
        const tickets = await this.rows<TicketRow>(`${ticketTypeSelect} WHERE concert_id IN (${marks}) ORDER BY id`, ids);
        return rows.map(row => ({ ...row,
            // The schema stores a single artist name; the list shape is kept for existing clients.
            artists: [{ name: row.artist_name }],
            genres: genres.filter(g => g.concert_id === row.id).map(({ concert_id: _id, ...genre }) => genre),
            ticket_types: tickets.filter(t => t.concert_id === row.id),
        }));
    }
    async ticketHistory(id: string): Promise<boolean> {
        return (await this.rows('SELECT id FROM order_items WHERE ticket_type_id = ? LIMIT 1', [id])).length > 0;
    }
    async concertHistory(id: string): Promise<boolean> {
        const rows = await this.rows(`SELECT
            EXISTS(SELECT 1 FROM order_items WHERE concert_id = ?) OR
            EXISTS(SELECT 1 FROM concert_staff WHERE concert_id = ?) OR
            EXISTS(SELECT 1 FROM notifications WHERE concert_id = ?) AS found`, [id, id, id]);
        return Number(rows[0].found) !== 0;
    }
    // An assignable account: active, registered (not a guest). Emails are stored lowercased by auth.
    async account(email: string): Promise<Row | undefined> {
        return (await this.rows("SELECT id FROM users WHERE email = ? AND status = 'ACTIVE' AND is_guest = 0", [email]))[0];
    }
    staff(concertId: string): Promise<Row[]> {
        return this.rows(`SELECT cs.user_id, u.first_name, u.last_name, u.email, cs.staff_role, cs.created_at
            FROM concert_staff cs JOIN users u ON u.id = cs.user_id WHERE cs.concert_id = ? ORDER BY cs.created_at, cs.user_id`, [concertId]);
    }
    async assignStaff(concertId: string, userId: string): Promise<void> {
        // Idempotent: the composite primary key absorbs repeated or concurrent assignments.
        await this.connection.execute(`INSERT INTO concert_staff (concert_id, user_id) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE user_id = concert_staff.user_id`, [concertId, userId]);
    }
    async unassignStaff(concertId: string, userId: string): Promise<number> {
        const [result] = await this.connection.execute<ResultSetHeader>('DELETE FROM concert_staff WHERE concert_id = ? AND user_id = ?', [concertId, userId]);
        return result.affectedRows;
    }
    async removeConcert(id: string): Promise<void> {
        // ticket_types has no ON DELETE CASCADE; concert_genres does.
        await this.connection.execute('DELETE FROM ticket_types WHERE concert_id = ?', [id]);
        await this.connection.execute('DELETE FROM concerts WHERE id = ?', [id]);
    }
}
