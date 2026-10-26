import { randomBytes } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Fields, Row, Value } from '../types/management.types.ts';
import type { OfferingQuery, ProviderQuery, ServiceQuoteList } from '../validators/services.schemas.ts';

const normalize = <T extends Row>(row: T): T => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value !== null && (key === 'id' || key.endsWith('_id')) ? String(value) : value])) as T;
const limit = (query: { page: number; limit: number }) => [String(query.limit), String((query.page - 1) * query.limit)];
// Column allowlists: API field -> column. SQL identifiers never come from the request.
const organizationColumns = ['name', 'legal_name', 'tax_id', 'slug', 'email', 'phone', 'created_by_user_id'] as const;
const providerColumns = ['description', 'city_id', 'coverage_area', 'status', 'published_at', 'is_verified', 'verified_at', 'verified_by_user_id'] as const;
const offeringColumns = ['organization_id', 'category_id', 'name', 'slug', 'description', 'equipment', 'conditions', 'pricing_unit', 'base_price',
    'status', 'published_at'] as const;
const quoteColumns = ['public_code', 'offering_id', 'organization_id', 'requester_user_id', 'concert_id', 'reservation_id', 'event_name', 'event_start_at',
    'event_end_at', 'location_text', 'requester_notes', 'status', 'subtotal', 'fees', 'discount', 'total_amount', 'currency', 'valid_until', 'provider_notes',
    'responded_by_user_id', 'responded_at', 'accepted_at'] as const;
const pick = (columns: readonly string[], data: Fields) => columns.filter(key => data[key] !== undefined);

// Public: published company of an active organization; a public offering is also published.
const publicProvider = "sp.status = 'PUBLISHED' AND o.status = 'ACTIVE'";
const providerSelect = `SELECT o.id, o.name, o.legal_name, o.slug, o.email, o.phone, o.status AS organization_status, sp.description, sp.city_id,
    ci.name AS city_name, sp.coverage_area, sp.status, sp.published_at, sp.is_verified, sp.verified_at, sp.created_at, sp.updated_at,
    (SELECT COUNT(*) FROM service_offerings so WHERE so.organization_id = o.id AND so.status = 'PUBLISHED') AS published_offerings
    FROM service_providers sp JOIN organizations o ON o.id = sp.organization_id LEFT JOIN cities ci ON ci.id = sp.city_id`;
const offeringSelect = `SELECT so.id, so.organization_id AS provider_id, o.name AS provider_name, sp.is_verified AS provider_verified, sp.city_id,
    ci.name AS city_name, sp.coverage_area, sc.code AS category_code, sc.name AS category_name, so.name, so.slug, so.description, so.equipment,
    so.conditions, so.pricing_unit, so.base_price, so.currency, so.status, so.published_at, so.created_at, so.updated_at
    FROM service_offerings so JOIN service_providers sp ON sp.organization_id = so.organization_id JOIN organizations o ON o.id = so.organization_id
    JOIN service_categories sc ON sc.id = so.category_id LEFT JOIN cities ci ON ci.id = sp.city_id`;
const quoteStatus = "CASE WHEN q.status = 'SENT' AND q.valid_until <= UTC_TIMESTAMP() THEN 'EXPIRED' ELSE q.status END";
// The provider sees only what it needs to serve the request: the requester's name and email, and the event it is for.
const quoteSelect = `SELECT q.id, q.public_code, q.offering_id, so.name AS offering_name, sc.code AS category_code, sc.name AS category_name,
    q.organization_id AS provider_id, o.name AS provider_name, q.requester_user_id,
    NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS requester_name, u.email AS requester_email,
    q.concert_id, c.title AS concert_name, q.reservation_id, r.public_code AS reservation_code,
    q.event_name, q.event_start_at, q.event_end_at, q.location_text, q.requester_notes, ${quoteStatus} AS status,
    q.subtotal, q.fees, q.discount, q.total_amount, q.currency, q.valid_until, q.provider_notes, q.responded_by_user_id, q.responded_at,
    q.accepted_at, q.created_at, q.updated_at
    FROM service_quotes q JOIN service_offerings so ON so.id = q.offering_id JOIN service_categories sc ON sc.id = so.category_id
    JOIN organizations o ON o.id = q.organization_id JOIN users u ON u.id = q.requester_user_id
    LEFT JOIN concerts c ON c.id = q.concert_id LEFT JOIN reservations r ON r.id = q.reservation_id`;
const fromOf = (select: string, table: string) => select.slice(select.indexOf(`FROM ${table}`));
// Booleans and counts for the API; the Row type keeps the repository signatures uniform.
const flagged = (row: Row): Row => ({ ...row, ...('is_verified' in row ? { is_verified: Boolean(row.is_verified) } : {}),
    ...('provider_verified' in row ? { provider_verified: Boolean(row.provider_verified) } : {}),
    ...('published_offerings' in row ? { published_offerings: Number(row.published_offerings) } : {}) }) as unknown as Row;

export class ServicesRepository {
    constructor(readonly connection: PoolConnection) {}
    async rows<T extends Row = Row>(sql: string, params: Value[] = []): Promise<T[]> {
        const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
        return (rows as T[]).map(normalize);
    }
    async execute(sql: string, params: Value[] = []): Promise<number> {
        return (await this.connection.execute<ResultSetHeader>(sql, params))[0].affectedRows;
    }
    private async lastId(): Promise<string> { return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id); }
    private async insert(table: string, columns: readonly string[], data: Fields): Promise<string> {
        const keys = pick(columns, data);
        await this.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(key => data[key] ?? null));
        return this.lastId();
    }
    private async patch(table: string, key: string, columns: readonly string[], id: string, data: Fields): Promise<void> {
        const keys = pick(columns, data);
        if (keys.length) await this.execute(`UPDATE ${table} SET ${keys.map(column => `${column} = ?`).join(',')} WHERE ${key} = ?`, [...keys.map(column => data[column] ?? null), id]);
    }

    categories() { return this.rows('SELECT id, code, name FROM service_categories ORDER BY name'); }
    async category(code: string): Promise<string | undefined> {
        return (await this.rows<{ id: string }>('SELECT id FROM service_categories WHERE code = ?', [code]))[0]?.id;
    }
    async cityExists(id: string): Promise<boolean> { return (await this.rows('SELECT id FROM cities WHERE id = ?', [id])).length > 0; }

    // ---- Companies ----
    async memberRole(organizationId: string, userId: string): Promise<string | undefined> {
        return (await this.rows<{ member_role: string }>('SELECT member_role FROM organization_members WHERE organization_id = ? AND user_id = ?', [organizationId, userId]))[0]?.member_role;
    }
    async createProvider(organization: Fields, provider: Fields, userId: string): Promise<string> {
        const id = await this.insert('organizations', organizationColumns, { ...organization, created_by_user_id: userId });
        await this.execute("INSERT INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, 'OWNER')", [id, userId]);
        await this.execute('INSERT INTO service_providers (organization_id) VALUES (?)', [id]);
        await this.patch('service_providers', 'organization_id', providerColumns, id, provider);
        return id;
    }
    updateOrganization(id: string, data: Fields) { return this.patch('organizations', 'id', organizationColumns, id, data); }
    updateProvider(id: string, data: Fields) { return this.patch('service_providers', 'organization_id', providerColumns, id, data); }
    async lockProvider(id: string): Promise<Row | undefined> {
        return (await this.rows('SELECT organization_id AS id, status, published_at, is_verified FROM service_providers WHERE organization_id = ? FOR UPDATE', [id]))[0];
    }
    async provider(id: string) { return (await this.rows(`${providerSelect} WHERE o.id = ?`, [id])).map(flagged)[0]; }
    async isPublicProvider(id: string): Promise<boolean> {
        return (await this.rows(`SELECT o.id ${fromOf(providerSelect, 'service_providers')} WHERE o.id = ? AND ${publicProvider}`, [id])).length > 0;
    }
    async providers(query: ProviderQuery) {
        const where = [publicProvider]; const values: Value[] = [];
        if (query.q) { where.push('(o.name LIKE ? OR sp.description LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`); }
        if (query.city_id) { where.push('sp.city_id = ?'); values.push(query.city_id); }
        if (query.verified !== undefined) { where.push('sp.is_verified = ?'); values.push(query.verified ? 1 : 0); }
        if (query.category) {
            where.push(`EXISTS (SELECT 1 FROM service_offerings so JOIN service_categories sc ON sc.id = so.category_id
                WHERE so.organization_id = o.id AND so.status = 'PUBLISHED' AND sc.code = ?)`);
            values.push(query.category);
        }
        const clause = where.join(' AND ');
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${fromOf(providerSelect, 'service_providers')} WHERE ${clause}`, values))[0].total);
        const data = await this.rows(`${providerSelect} WHERE ${clause} ORDER BY sp.is_verified DESC, o.name, o.id LIMIT ? OFFSET ?`, [...values, ...limit(query)]);
        return { data: data.map(flagged), total };
    }
    async mine(userId: string) {
        return (await this.rows(`${providerSelect} JOIN organization_members m ON m.organization_id = o.id AND m.user_id = ?
            ORDER BY o.name, o.id`, [userId])).map(flagged);
    }

    // ---- Offerings ----
    createOffering(data: Fields) { return this.insert('service_offerings', offeringColumns, data); }
    updateOffering(id: string, data: Fields) { return this.patch('service_offerings', 'id', offeringColumns, id, data); }
    async offering(id: string, lock = false) {
        if (lock) await this.rows('SELECT id FROM service_offerings WHERE id = ? FOR UPDATE', [id]);
        return (await this.rows(`${offeringSelect} WHERE so.id = ?`, [id])).map(flagged)[0];
    }
    async providerOfferings(providerId: string, all: boolean) {
        return (await this.rows(`${offeringSelect} WHERE so.organization_id = ?${all ? '' : " AND so.status = 'PUBLISHED'"} ORDER BY sc.name, so.name, so.id`,
            [providerId])).map(flagged);
    }
    async offerings(query: OfferingQuery) {
        const where = [publicProvider, "so.status = 'PUBLISHED'"]; const values: Value[] = [];
        if (query.q) { where.push('(so.name LIKE ? OR so.description LIKE ? OR o.name LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`); }
        if (query.city_id) { where.push('sp.city_id = ?'); values.push(query.city_id); }
        if (query.category) { where.push('sc.code = ?'); values.push(query.category); }
        if (query.provider_id) { where.push('so.organization_id = ?'); values.push(query.provider_id); }
        if (query.max_price !== undefined) { where.push('so.base_price IS NOT NULL AND so.base_price <= ?'); values.push(query.max_price); }
        const clause = where.join(' AND ');
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${fromOf(offeringSelect, 'service_offerings')} WHERE ${clause}`, values))[0].total);
        const data = await this.rows(`${offeringSelect} WHERE ${clause} ORDER BY sp.is_verified DESC, so.base_price IS NULL, so.base_price, so.id LIMIT ? OFFSET ?`,
            [...values, ...limit(query)]);
        return { data: data.map(flagged), total };
    }

    // ---- Quotes ----
    async createQuote(data: Fields): Promise<string> {
        return this.insert('service_quotes', quoteColumns, { ...data, public_code: `S-${randomBytes(6).toString('hex').toUpperCase()}` });
    }
    updateQuote(id: string, data: Fields) { return this.patch('service_quotes', 'id', quoteColumns, id, data); }
    async quote(id: string): Promise<Row | undefined> { return (await this.rows(`${quoteSelect} WHERE q.id = ?`, [id]))[0]; }
    async lockQuote(id: string): Promise<Row | undefined> {
        return (await this.rows('SELECT id, organization_id, requester_user_id, status, valid_until, event_start_at FROM service_quotes WHERE id = ? FOR UPDATE', [id]))[0];
    }
    quoteItems(id: string) {
        return this.rows('SELECT id, description, quantity, unit_price, line_total, sort_order FROM service_quote_items WHERE service_quote_id = ? ORDER BY sort_order, id', [id]);
    }
    async replaceQuoteItems(id: string, items: { description: string; quantity: number; unit_price: number; line_total: string }[]): Promise<void> {
        await this.execute('DELETE FROM service_quote_items WHERE service_quote_id = ?', [id]);
        for (const [index, item] of items.entries())
            await this.execute('INSERT INTO service_quote_items (service_quote_id, description, quantity, unit_price, line_total, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                [id, item.description, item.quantity, item.unit_price, item.line_total, index]);
    }
    async quotes(userId: string, query: ServiceQuoteList, admin: boolean) {
        const where: string[] = []; const values: Value[] = [];
        if (query.as === 'requester') { where.push('q.requester_user_id = ?'); values.push(userId); }
        else if (!admin) { where.push('EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = q.organization_id AND m.user_id = ?)'); values.push(userId); }
        if (query.status) { where.push(`${quoteStatus} = ?`); values.push(query.status); }
        if (query.concert_id) { where.push('q.concert_id = ?'); values.push(query.concert_id); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${fromOf(quoteSelect, 'service_quotes')}${clause}`, values))[0].total);
        return { data: await this.rows(`${quoteSelect}${clause} ORDER BY q.event_start_at DESC, q.id DESC LIMIT ? OFFSET ?`, [...values, ...limit(query)]), total };
    }
    async concertOwner(concertId: string): Promise<string | undefined> {
        return (await this.rows<{ organizer_user_id: string }>('SELECT organizer_user_id FROM concerts WHERE id = ?', [concertId]))[0]?.organizer_user_id;
    }
    async reservationParties(reservationId: string): Promise<{ user_id: string; organization_id: string } | undefined> {
        return (await this.rows<{ user_id: string; organization_id: string }>(`SELECT r.user_id, e.organization_id FROM reservations r
            JOIN establishments e ON e.id = r.establishment_id WHERE r.id = ?`, [reservationId]))[0];
    }

    // ---- Notifications: QUOTE_UPDATE with the service quote id in data (notifications.quote_id points to venue quotes) ----
    async notifyUser(userId: string, quoteId: string, title: string, body: string): Promise<void> {
        await this.execute(`INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, 'QUOTE_UPDATE', ?, ?, ?)`,
            [userId, title.slice(0, 200), body.slice(0, 1000), JSON.stringify({ service_quote_id: quoteId })]);
    }
    async notifyProvider(organizationId: string, quoteId: string, title: string, body: string): Promise<void> {
        await this.execute(`INSERT INTO notifications (user_id, type, title, body, data)
            SELECT m.user_id, 'QUOTE_UPDATE', ?, ?, ? FROM organization_members m WHERE m.organization_id = ?`,
        [title.slice(0, 200), body.slice(0, 1000), JSON.stringify({ service_quote_id: quoteId }), organizationId]);
    }
}
