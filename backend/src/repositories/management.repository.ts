import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { Catalog, ConcertRow, TicketRow, Fields, Row, Value, Principal } from '../types/management.types.ts';
import type { CatalogQuery, ConcertQuery } from '../validators/management.schemas.ts';

// SQL identifiers originate only from these application-owned allowlists.
const columns = {
    artists: ['name', 'description', 'image_url'], genres: ['name'], provinces: ['name'],
    cities: ['province_id', 'name'], venues: ['city_id', 'name', 'address', 'capacity'],
    concerts: ['organizer_id', 'venue_id', 'concert_type_id', 'status_id', 'name', 'description', 'image_url', 'start_datetime', 'end_datetime', 'published_at'],
    ticket_types: ['concert_id', 'name', 'price', 'stock_total', 'sale_start', 'sale_end', 'max_per_purchase'],
} as const;
type Table = keyof typeof columns;
const placeholders = (ids: string[]) => ids.map(() => '?').join(',');
const normalize = <T extends Row>(row: T): T => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value !== null && (key === 'id' || key.endsWith('_id')) ? String(value) : value])) as T;
const concertSelect = `SELECT c.*, s.code AS status, ct.code AS type,
    v.name AS venue_name, v.city_id, ci.name AS city_name, ci.province_id, p.name AS province_name
    FROM concerts c JOIN concert_statuses s ON s.id = c.status_id
    JOIN concert_types ct ON ct.id = c.concert_type_id JOIN venues v ON v.id = c.venue_id
    JOIN cities ci ON ci.id = v.city_id JOIN provinces p ON p.id = ci.province_id`;

export class ManagementRepository {
    constructor(private readonly connection: PoolConnection) {}
    async rows<T extends Row = Row>(sql: string, params: Value[] = []): Promise<T[]> {
        const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
        return (rows as T[]).map(normalize);
    }
    async insert(table: Table, data: Fields): Promise<string> {
        const keys = columns[table].filter(key => data[key] !== undefined);
        await this.connection.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(key => data[key] ?? null));
        return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id);
    }
    async update(table: Table, id: string, data: Fields): Promise<void> {
        const keys = columns[table].filter(key => data[key] !== undefined);
        if (keys.length) await this.connection.execute(`UPDATE ${table} SET ${keys.map(key => `${key} = ?`).join(',')} WHERE id = ?`, [...keys.map(key => data[key] ?? null), id]);
    }
    async remove(table: Table, id: string): Promise<void> { await this.connection.execute(`DELETE FROM ${table} WHERE id = ?`, [id]); }
    async find(table: Table, id: string, lock = false): Promise<Row | undefined> {
        return (await this.rows(`SELECT * FROM ${table} WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]))[0];
    }
    async catalog(table: Catalog, query: CatalogQuery) {
        const where: string[] = []; const values: Value[] = [];
        if (query.q) { where.push('name LIKE ?'); values.push(`%${query.q}%`); }
        const parent = table === 'cities' ? 'province_id' : table === 'venues' ? 'city_id' : null;
        if (parent && query[parent]) { where.push(`${parent} = ?`); values.push(query[parent]); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const total = Number((await this.rows(`SELECT COUNT(*) AS total FROM ${table}${clause}`, values))[0].total);
        const data = await this.rows(`SELECT * FROM ${table}${clause} ORDER BY name, id LIMIT ? OFFSET ?`, [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data: table === 'artists' ? await this.artistDetails(data) : data, total };
    }
    async artistDetails(rows: Row[]) {
        if (!rows.length) return [];
        const ids = rows.map(row => String(row.id));
        const genres = await this.rows(`SELECT ag.artist_id, g.* FROM artist_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.artist_id IN (${placeholders(ids)}) ORDER BY g.name, g.id`, ids);
        return rows.map(row => ({ ...row, genres: genres.filter(g => g.artist_id === row.id).map(({ artist_id: _id, ...genre }) => genre) }));
    }
    async replaceRelations(kind: 'concert_artists' | 'concert_genres' | 'artist_genres', id: string, ids: string[]): Promise<void> {
        const owner = kind === 'artist_genres' ? 'artist_id' : 'concert_id';
        const target = kind === 'concert_artists' ? 'artist_id' : 'genre_id';
        await this.connection.execute(`DELETE FROM ${kind} WHERE ${owner} = ?`, [id]);
        if (ids.length) {
            const billing = kind === 'concert_artists';
            const values = ids.flatMap((value, index) => billing ? [id, value, index + 1] : [id, value]);
            await this.connection.execute(`INSERT INTO ${kind} (${owner}, ${target}${billing ? ', billing_order' : ''}) VALUES ${ids.map(() => billing ? '(?, ?, ?)' : '(?, ?)').join(',')}`, values);
        }
    }
    async genreReferenced(id: string): Promise<boolean> {
        return (await this.rows('SELECT genre_id FROM artist_genres WHERE genre_id = ? LIMIT 1', [id])).length > 0;
    }
    async organizerExists(id: string): Promise<boolean> {
        return (await this.rows(`SELECT op.user_id FROM organizer_profiles op JOIN users u ON u.id = op.user_id
            WHERE op.user_id = ? AND u.is_active = TRUE AND EXISTS
            (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code IN ('ORGANIZER', 'ADMIN'))`, [id])).length > 0;
    }
    async statusId(code: string): Promise<string> {
        const row = (await this.rows('SELECT id FROM concert_statuses WHERE code = ?', [code]))[0];
        if (!row) throw new Error('Falta catálogo de estados de conciertos.');
        return String(row.id);
    }
    async concert(id: string, lock = false): Promise<ConcertRow | undefined> {
        // Lock the parent before reading children. Every child writer uses this lock order.
        if (lock && !(await this.find('concerts', id, true))) return undefined;
        return (await this.rows<ConcertRow>(`${concertSelect} WHERE c.id = ?`, [id]))[0];
    }
    async concertList(query: ConcertQuery, user?: Principal) {
        const where: string[] = []; const values: Value[] = [];
        if (!user?.roles.includes('ADMIN')) {
            if (user?.roles.includes('ORGANIZER')) { where.push("(s.code = 'PUBLISHED' OR c.organizer_id = ?)"); values.push(user.id); }
            else where.push("s.code = 'PUBLISHED'");
        }
        if (query.mine && user) { where.push('c.organizer_id = ?'); values.push(user.id); }
        for (const key of ['venue_id', 'concert_type_id'] as const) if (query[key]) { where.push(`c.${key} = ?`); values.push(query[key]); }
        for (const [key, column] of [['city_id', 'v.city_id'], ['status', 's.code'], ['type', 'ct.code']] as const) {
            if (query[key]) { where.push(`${column} = ?`); values.push(query[key]); }
        }
        for (const [key, table, column] of [['artist_id', 'concert_artists', 'artist_id'], ['genre_id', 'concert_genres', 'genre_id']] as const) {
            if (query[key]) { where.push(`EXISTS (SELECT 1 FROM ${table} rel WHERE rel.concert_id = c.id AND rel.${column} = ?)`); values.push(query[key]); }
        }
        for (const key of ['q', 'name'] as const) if (query[key]) { where.push('c.name LIKE ?'); values.push(`%${query[key]}%`); }
        if (query.date_from) { where.push('c.start_datetime >= ?'); values.push(query.date_from); }
        if (query.date_to) { where.push('c.start_datetime <= ?'); values.push(query.date_to); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const from = concertSelect.slice(concertSelect.indexOf('FROM concerts'));
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${from}${clause}`, values))[0].total);
        const rows = await this.rows<ConcertRow>(`${concertSelect}${clause} ORDER BY c.start_datetime, c.id LIMIT ? OFFSET ?`, [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data: await this.concertDetails(rows), total };
    }
    async tickets(id: string): Promise<TicketRow[]> { return this.rows<TicketRow>('SELECT * FROM ticket_types WHERE concert_id = ? ORDER BY id', [id]); }
    async ticket(id: string): Promise<TicketRow | undefined> { return (await this.rows<TicketRow>('SELECT * FROM ticket_types WHERE id = ?', [id]))[0]; }
    async concertDetails(rows: ConcertRow[]) {
        if (!rows.length) return [];
        const ids = rows.map(row => row.id); const marks = placeholders(ids);
        const artists = await this.rows(`SELECT ca.concert_id, ca.billing_order, a.* FROM concert_artists ca JOIN artists a ON a.id = ca.artist_id WHERE ca.concert_id IN (${marks}) ORDER BY ca.billing_order, a.id`, ids);
        const genres = await this.rows(`SELECT cg.concert_id, g.* FROM concert_genres cg JOIN genres g ON g.id = cg.genre_id WHERE cg.concert_id IN (${marks}) ORDER BY g.name, g.id`, ids);
        const tickets = await this.rows<TicketRow>(`SELECT * FROM ticket_types WHERE concert_id IN (${marks}) ORDER BY id`, ids);
        return rows.map(row => ({ ...row,
            artists: artists.filter(a => a.concert_id === row.id).map(({ concert_id: _id, ...artist }) => artist),
            genres: genres.filter(g => g.concert_id === row.id).map(({ concert_id: _id, ...genre }) => genre),
            ticket_types: tickets.filter(t => t.concert_id === row.id),
        }));
    }
    async ticketHistory(id: string): Promise<boolean> {
        return (await this.rows('SELECT id FROM purchase_items WHERE ticket_type_id = ? LIMIT 1', [id])).length > 0;
    }
    async concertHistory(id: string): Promise<boolean> {
        const rows = await this.rows(`SELECT
            EXISTS(SELECT 1 FROM purchase_items pi JOIN ticket_types tt ON tt.id = pi.ticket_type_id WHERE tt.concert_id = ?) OR
            EXISTS(SELECT 1 FROM favorites WHERE concert_id = ?) OR
            EXISTS(SELECT 1 FROM staff_assignments WHERE concert_id = ?) OR
            EXISTS(SELECT 1 FROM notifications WHERE concert_id = ?) AS found`, [id, id, id, id]);
        return Number(rows[0].found) !== 0;
    }
    async concertTypes(): Promise<Row[]> { return this.rows('SELECT * FROM concert_types ORDER BY id'); }
}
