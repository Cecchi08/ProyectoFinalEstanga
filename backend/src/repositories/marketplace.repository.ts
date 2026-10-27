import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Row, Value, Fields } from '../types/management.types.ts';
import type { ListQuery, VenueQuery } from '../validators/marketplace.schemas.ts';
import { PERMISSIONS as P } from '../utils/access.util.js';

const normalize = <T extends Row>(row: T): T => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value !== null && (key === 'id' || key.endsWith('_id')) ? String(value) : value])) as T;
const limit = (query: { page: number; limit: number }) => [String(query.limit), String((query.page - 1) * query.limit)];
// Same overlap rule as sp_assert_slot_free: an exclusive request, an exclusive occupant/block or the same venue conflict.
const conflict = (venue: string) => `SELECT 1 FROM v_blocked_slots b WHERE b.establishment_id = ${venue}.establishment_id
    AND b.starts_at < ? AND b.ends_at > ? AND (? = 1 OR b.is_exclusive = 1 OR b.venue_id = ${venue}.id)`;
// Public: published venue in a published establishment of an active marketplace city.
const visible = "v.status = 'PUBLISHED' AND e.status = 'PUBLISHED' AND mc.is_active = 1";
const venueSelect = `SELECT v.id, v.establishment_id, e.organization_id, v.name, v.slug, v.description, vt.code AS venue_type, vt.name AS venue_type_name,
    v.capacity_standing, v.capacity_seated, v.area_m2, v.price_per_hour, v.currency, v.min_booking_minutes, v.hold_minutes,
    v.status, v.published_at, e.name AS establishment_name, e.status AS establishment_status, e.address_line, e.city_id, ci.name AS city_name,
    e.latitude, e.longitude, (SELECT p.url FROM venue_photos p WHERE p.venue_id = v.id ORDER BY p.is_cover DESC, p.sort_order, p.id LIMIT 1) AS cover_url
    FROM venues v JOIN venue_types vt ON vt.id = v.venue_type_id JOIN establishments e ON e.id = v.establishment_id
    JOIN cities ci ON ci.id = e.city_id LEFT JOIN marketplace_cities mc ON mc.city_id = e.city_id`;
// Effective status: the maintenance event may be disabled, so expired holds and finished bookings are derived on read.
const reservationStatus = `CASE WHEN r.status_code = 'HOLD' AND r.hold_expires_at <= UTC_TIMESTAMP() THEN 'EXPIRED'
    WHEN r.status_code = 'CONFIRMED' AND r.teardown_end_at <= UTC_TIMESTAMP() THEN 'COMPLETED' ELSE r.status_code END`;
// A direct booking (no quote) is confirmed by the venue, not by the payment: once paid it waits for the venue's answer.
const paid = "EXISTS (SELECT 1 FROM payments p WHERE p.reservation_id = r.id AND p.status = 'APPROVED')";
const reservationSelect = `SELECT r.id, r.public_code, r.venue_id, v.name AS venue_name, r.establishment_id, e.name AS establishment_name,
    e.organization_id, r.user_id, r.quote_id, ${reservationStatus} AS status, r.occupancy_mode_code AS occupancy_mode, r.event_name,
    (r.quote_id IS NULL) AS requires_venue_acceptance, ${paid} AS paid,
    (${reservationStatus} = 'HOLD' AND r.quote_id IS NULL AND ${paid}) AS awaiting_venue,
    r.expected_attendance, r.setup_start_at, r.event_start_at, r.event_end_at, r.teardown_end_at, r.hold_expires_at, r.total_amount, r.currency,
    r.notes, r.confirmed_at, r.completed_at, r.cancelled_at, r.cancelled_by_user_id, r.cancellation_reason, r.expired_at, r.created_at
    FROM reservations r JOIN venues v ON v.id = r.venue_id JOIN establishments e ON e.id = r.establishment_id`;
const quoteStatus = "CASE WHEN q.status = 'SENT' AND q.valid_until <= UTC_TIMESTAMP() THEN 'EXPIRED' ELSE q.status END";
const quoteSelect = `SELECT q.id, q.public_code, q.venue_id, v.name AS venue_name, v.establishment_id, e.organization_id, q.requester_user_id,
    q.requester_organization_id, q.occupancy_mode_code AS occupancy_mode, q.event_name, q.event_description, q.expected_attendance,
    q.setup_start_at, q.event_start_at, q.event_end_at, q.teardown_end_at, ${quoteStatus} AS status, q.subtotal, q.fees, q.discount,
    q.total_amount, q.currency, q.valid_until, q.requester_notes, q.provider_notes, q.responded_by_user_id, q.responded_at, q.accepted_at,
    q.created_at, (SELECT r.id FROM reservations r WHERE r.quote_id = q.id ORDER BY r.id DESC LIMIT 1) AS reservation_id
    FROM quotes q JOIN venues v ON v.id = q.venue_id JOIN establishments e ON e.id = v.establishment_id`;
const flags = (row: Row) => ({ ...row, requires_venue_acceptance: Boolean(Number(row.requires_venue_acceptance)), paid: Boolean(Number(row.paid)),
    awaiting_venue: Boolean(Number(row.awaiting_venue)) });
const member = (organization: string) => `EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = ${organization} AND m.user_id = ?)`;

export class MarketplaceRepository {
    constructor(readonly connection: PoolConnection) {}
    async rows<T extends Row = Row>(sql: string, params: Value[] = []): Promise<T[]> {
        const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
        return (rows as T[]).map(normalize);
    }
    async execute(sql: string, params: Value[] = []): Promise<number> {
        return (await this.connection.execute<ResultSetHeader>(sql, params))[0].affectedRows;
    }
    async lastId(): Promise<string> { return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id); }
    private async insert(table: string, data: Fields): Promise<string> {
        const keys = Object.keys(data).filter(key => data[key] !== undefined);
        await this.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(key => data[key] ?? null));
        return this.lastId();
    }
    private async patch(table: string, id: string, data: Fields): Promise<void> {
        const keys = Object.keys(data).filter(key => data[key] !== undefined);
        if (keys.length) await this.execute(`UPDATE ${table} SET ${keys.map(key => `${key} = ?`).join(',')} WHERE id = ?`, [...keys.map(key => data[key] ?? null), id]);
    }

    // ---- Catalogs and search ----
    cities() {
        return this.rows(`SELECT c.id, c.name, c.postal_code, c.latitude, c.longitude, d.name AS district_name, p.id AS province_id, p.name AS province_name
            FROM marketplace_cities mc JOIN cities c ON c.id = mc.city_id JOIN districts d ON d.id = c.district_id JOIN provinces p ON p.id = c.province_id
            WHERE mc.is_active = 1 ORDER BY mc.sort_order, c.name`);
    }
    async catalogs() {
        return {
            venue_types: await this.rows('SELECT id, code, name FROM venue_types ORDER BY name'),
            amenities: await this.rows('SELECT id, code, name FROM amenities ORDER BY name'),
            occupancy_modes: (await this.rows('SELECT code, name, is_exclusive, description FROM occupancy_modes ORDER BY is_exclusive, code'))
                .map(mode => ({ ...mode, is_exclusive: Boolean(mode.is_exclusive) })),
        };
    }
    async venues(query: VenueQuery) {
        const where = [visible]; const values: Value[] = [];
        if (query.q) { where.push('(v.name LIKE ? OR e.name LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`); }
        if (query.city_id) { where.push('e.city_id = ?'); values.push(query.city_id); }
        if (query.venue_type) { where.push('vt.code = ?'); values.push(query.venue_type); }
        if (query.min_capacity) { where.push('GREATEST(COALESCE(v.capacity_standing, 0), COALESCE(v.capacity_seated, 0)) >= ?'); values.push(query.min_capacity); }
        if (query.max_price !== undefined) { where.push('v.price_per_hour <= ?'); values.push(query.max_price); }
        for (const code of query.amenities ?? []) {
            where.push('EXISTS (SELECT 1 FROM venue_amenities va JOIN amenities a ON a.id = va.amenity_id WHERE va.venue_id = v.id AND a.code = ?)'); values.push(code);
        }
        if (query.available_from && query.available_to) {
            where.push(`NOT EXISTS (${conflict('v')})`);
            values.push(query.available_to, query.available_from, query.mode === 'ESTABLISHMENT' ? 1 : 0);
        }
        const clause = where.join(' AND ');
        const from = venueSelect.slice(venueSelect.indexOf('FROM venues'));
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${from} WHERE ${clause}`, values))[0].total);
        const data = await this.rows(`${venueSelect} WHERE ${clause} ORDER BY v.price_per_hour, v.id LIMIT ? OFFSET ?`, [...values, ...limit(query)]);
        return { data, total };
    }
    async venue(id: string, lock = false): Promise<Row | undefined> {
        if (lock) await this.rows('SELECT id FROM venues WHERE id = ? FOR UPDATE', [id]);
        return (await this.rows(`${venueSelect} WHERE v.id = ?`, [id]))[0];
    }
    // Provider view: every space of the establishment, drafts and archived included.
    establishmentVenues(establishmentId: string) {
        return this.rows(`${venueSelect} WHERE v.establishment_id = ? ORDER BY v.name, v.id`, [establishmentId]);
    }
    async isPublic(venueId: string): Promise<boolean> {
        return (await this.rows(`SELECT v.id ${venueSelect.slice(venueSelect.indexOf('FROM venues'))} WHERE v.id = ? AND ${visible}`, [venueId])).length > 0;
    }
    async venueDetails(venue: Row) {
        return { ...venue,
            amenities: await this.rows('SELECT a.code, a.name FROM venue_amenities va JOIN amenities a ON a.id = va.amenity_id WHERE va.venue_id = ? ORDER BY a.name', [String(venue.id)]),
            photos: (await this.rows('SELECT id, url, sort_order, is_cover FROM venue_photos WHERE venue_id = ? ORDER BY sort_order, id', [String(venue.id)]))
                .map(photo => ({ ...photo, is_cover: Boolean(photo.is_cover) })),
            opening_hours: await this.openingHours(String(venue.id)) };
    }
    openingHours(venueId: string) {
        return this.rows(`SELECT day_of_week, TIME_FORMAT(opens_at, '%H:%i') AS opens_at, TIME_FORMAT(closes_at, '%H:%i') AS closes_at
            FROM venue_opening_hours WHERE venue_id = ? ORDER BY day_of_week, opens_at`, [venueId]);
    }
    // Only times and the kind of occupation are public: never who booked or why.
    busy(venue: Row, from: Date, to: Date, exclusive: boolean) {
        return this.rows(`SELECT b.source, b.phase, b.starts_at, b.ends_at, b.is_exclusive, b.venue_id
            FROM v_blocked_slots b WHERE b.establishment_id = ? AND b.starts_at < ? AND b.ends_at > ? AND (? = 1 OR b.is_exclusive = 1 OR b.venue_id = ?)
            ORDER BY b.starts_at, b.ends_at`, [String(venue.establishment_id), to, from, exclusive ? 1 : 0, String(venue.id)]);
    }

    // ---- Provider management ----
    async memberRole(organizationId: string, userId: string): Promise<string | undefined> {
        return (await this.rows<{ member_role: string }>('SELECT member_role FROM organization_members WHERE organization_id = ? AND user_id = ?', [organizationId, userId]))[0]?.member_role;
    }
    async createOrganization(data: Fields, userId: string): Promise<string> {
        const id = await this.insert('organizations', { ...data, created_by_user_id: userId });
        await this.execute("INSERT INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, 'OWNER')", [id, userId]);
        return id;
    }
    organization(id: string) { return this.rows('SELECT * FROM organizations WHERE id = ?', [id]).then(rows => rows[0]); }
    organizations(userId: string) {
        return this.rows(`SELECT o.*, m.member_role FROM organizations o JOIN organization_members m ON m.organization_id = o.id
            WHERE m.user_id = ? ORDER BY o.name, o.id`, [userId]);
    }
    // Serializes membership changes so the "at least one OWNER" rule holds under concurrency.
    async lockOrganization(id: string): Promise<boolean> {
        return (await this.rows('SELECT id FROM organizations WHERE id = ? FOR UPDATE', [id])).length > 0;
    }
    members(organizationId: string) {
        return this.rows(`SELECT m.user_id, u.first_name, u.last_name, u.email, m.member_role, m.created_at
            FROM organization_members m JOIN users u ON u.id = m.user_id WHERE m.organization_id = ?
            ORDER BY FIELD(m.member_role, 'OWNER', 'ADMIN', 'STAFF'), m.created_at, m.user_id`, [organizationId]);
    }
    // Membership never grants a profile: the account must already hold marketplace.establishments.manage (VENUE or ADMIN).
    async memberCandidate(email: string): Promise<{ id: string; provider: boolean } | undefined> {
        const row = (await this.rows(`SELECT u.id, EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id = u.id AND p.code = ?) AS provider
            FROM users u WHERE u.email = ? AND u.status = 'ACTIVE' AND u.is_guest = 0`, [P.establishmentsManage, email]))[0];
        return row ? { id: String(row.id), provider: Number(row.provider) === 1 } : undefined;
    }
    addMember(organizationId: string, userId: string, role: string) {
        return this.execute('INSERT INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, ?)', [organizationId, userId, role]);
    }
    setMemberRole(organizationId: string, userId: string, role: string) {
        return this.execute('UPDATE organization_members SET member_role = ? WHERE organization_id = ? AND user_id = ?', [role, organizationId, userId]);
    }
    removeMember(organizationId: string, userId: string) {
        return this.execute('DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?', [organizationId, userId]);
    }
    async owners(organizationId: string): Promise<number> {
        return Number((await this.rows("SELECT COUNT(*) AS total FROM organization_members WHERE organization_id = ? AND member_role = 'OWNER'", [organizationId]))[0].total);
    }
    async marketplaceCity(cityId: string): Promise<boolean> {
        return (await this.rows('SELECT city_id FROM marketplace_cities WHERE city_id = ? AND is_active = 1', [cityId])).length > 0;
    }
    createEstablishment(data: Fields) { return this.insert('establishments', data); }
    updateEstablishment(id: string, data: Fields) { return this.patch('establishments', id, data); }
    async establishment(id: string, lock = false): Promise<Row | undefined> {
        return (await this.rows(`SELECT * FROM establishments WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]))[0];
    }
    // Review queue for marketplace.admin, oldest request first.
    pendingEstablishments() {
        return this.rows(`SELECT e.*, o.name AS organization_name, c.name AS city_name,
            (SELECT COUNT(*) FROM venues v WHERE v.establishment_id = e.id) AS venues
            FROM establishments e JOIN organizations o ON o.id = e.organization_id JOIN cities c ON c.id = e.city_id
            WHERE e.status = 'PENDING_REVIEW' ORDER BY e.updated_at, e.id`);
    }
    establishments(userId: string, admin: boolean) {
        return this.rows(`SELECT e.*, (SELECT COUNT(*) FROM venues v WHERE v.establishment_id = e.id) AS venues FROM establishments e
            ${admin ? '' : `WHERE ${member('e.organization_id')}`} ORDER BY e.name, e.id`, admin ? [] : [userId]);
    }
    async venueType(code: string): Promise<string | undefined> {
        return (await this.rows<{ id: string }>('SELECT id FROM venue_types WHERE code = ?', [code]))[0]?.id;
    }
    createVenue(data: Fields) { return this.insert('venues', data); }
    updateVenue(id: string, data: Fields) { return this.patch('venues', id, data); }
    async replaceAmenities(venueId: string, codes: string[]): Promise<number> {
        await this.execute('DELETE FROM venue_amenities WHERE venue_id = ?', [venueId]);
        if (!codes.length) return 0;
        return this.execute(`INSERT INTO venue_amenities (venue_id, amenity_id) SELECT ?, id FROM amenities WHERE code IN (${codes.map(() => '?').join(',')})`, [venueId, ...codes]);
    }
    async replacePhotos(venueId: string, photos: { url: string; is_cover: boolean }[]): Promise<void> {
        await this.execute('DELETE FROM venue_photos WHERE venue_id = ?', [venueId]);
        for (const [index, photo] of photos.entries())
            await this.execute('INSERT INTO venue_photos (venue_id, url, sort_order, is_cover) VALUES (?, ?, ?, ?)', [venueId, photo.url, index, photo.is_cover ? 1 : 0]);
    }
    async replaceHours(venueId: string, hours: { day_of_week: number; opens_at: string; closes_at: string }[]): Promise<void> {
        await this.execute('DELETE FROM venue_opening_hours WHERE venue_id = ?', [venueId]);
        for (const hour of hours)
            await this.execute('INSERT INTO venue_opening_hours (venue_id, day_of_week, opens_at, closes_at) VALUES (?, ?, ?, ?)', [venueId, hour.day_of_week, hour.opens_at, hour.closes_at]);
    }
    // The BEFORE INSERT trigger runs sp_assert_slot_free, which locks the establishment row.
    createBlock(data: Fields) { return this.insert('venue_blocks', data); }
    async block(id: string): Promise<Row | undefined> { return (await this.rows('SELECT * FROM venue_blocks WHERE id = ? FOR UPDATE', [id]))[0]; }
    async removeBlock(id: string): Promise<void> { await this.execute('DELETE FROM venue_blocks WHERE id = ?', [id]); }
    blocks(establishmentId: string) {
        return this.rows('SELECT * FROM venue_blocks WHERE establishment_id = ? AND ends_at > UTC_TIMESTAMP() ORDER BY starts_at', [establishmentId]);
    }

    // ---- Quotes ----
    async createQuote(data: Fields): Promise<string> {
        return this.insert('quotes', { ...data, public_code: `Q-${(await this.rows('SELECT UPPER(HEX(RANDOM_BYTES(6))) AS code'))[0].code}` });
    }
    async quote(id: string): Promise<Row | undefined> { return (await this.rows(`${quoteSelect} WHERE q.id = ?`, [id]))[0]; }
    async lockQuote(id: string): Promise<Row | undefined> {
        return (await this.rows(`SELECT id, venue_id, requester_user_id, status, valid_until, total_amount FROM quotes WHERE id = ? FOR UPDATE`, [id]))[0];
    }
    quoteItems(id: string) { return this.rows('SELECT id, description, quantity, unit_price, line_total, sort_order FROM quote_items WHERE quote_id = ? ORDER BY sort_order, id', [id]); }
    async replaceQuoteItems(id: string, items: { description: string; quantity: number; unit_price: number; line_total: string }[]): Promise<void> {
        await this.execute('DELETE FROM quote_items WHERE quote_id = ?', [id]);
        for (const [index, item] of items.entries())
            await this.execute('INSERT INTO quote_items (quote_id, description, quantity, unit_price, line_total, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                [id, item.description, item.quantity, item.unit_price, item.line_total, index]);
    }
    updateQuote(id: string, data: Fields) { return this.patch('quotes', id, data); }
    async quotes(userId: string, query: ListQuery, admin: boolean) {
        const where: string[] = []; const values: Value[] = [];
        if (query.as === 'requester') { where.push('q.requester_user_id = ?'); values.push(userId); }
        else if (!admin) { where.push(member('e.organization_id')); values.push(userId); }
        if (query.status) { where.push(`${quoteStatus} = ?`); values.push(query.status); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const from = quoteSelect.slice(quoteSelect.indexOf('FROM quotes'));
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${from}${clause}`, values))[0].total);
        return { data: await this.rows(`${quoteSelect}${clause} ORDER BY q.id DESC LIMIT ? OFFSET ?`, [...values, ...limit(query)]), total };
    }

    // ---- Reservations ----
    // The procedure opens and commits its own transaction: call it only on a connection without an open one.
    async createHold(input: { venue_id: string; user_id: string; quote_id: string | null; mode: string; event_name: string; expected_attendance: number | null;
        setup_start_at: Date; event_start_at: Date; event_end_at: Date; teardown_end_at: Date; total: string }): Promise<string> {
        await this.connection.query('SET @venti_user_id = ?, @venti_reservation_id = NULL', [input.user_id]);
        try {
            await this.connection.query('CALL sp_create_reservation_hold(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @venti_reservation_id)',
                [input.venue_id, input.user_id, input.quote_id, input.mode, input.event_name, input.expected_attendance,
                    input.setup_start_at, input.event_start_at, input.event_end_at, input.teardown_end_at, input.total]);
            return String((await this.rows('SELECT CAST(@venti_reservation_id AS CHAR) AS id'))[0].id);
        } finally {
            await this.connection.query('SET @venti_user_id = NULL');
        }
    }
    async simulatePayment(reservationId: string, payerId: string, approve: boolean): Promise<string> {
        await this.connection.query('SET @venti_payment_id = NULL');
        await this.connection.query('CALL sp_simulate_payment(?, ?, ?, @venti_payment_id)', [reservationId, payerId, approve ? 1 : 0]);
        return String((await this.rows('SELECT CAST(@venti_payment_id AS CHAR) AS id'))[0].id);
    }
    async reservation(id: string): Promise<Row | undefined> { return (await this.rows(`${reservationSelect} WHERE r.id = ?`, [id]))[0]; }
    async lockReservation(id: string): Promise<Row | undefined> {
        return (await this.rows(`SELECT r.id, r.user_id, r.quote_id, r.status_code, r.hold_expires_at, r.event_start_at, ${reservationStatus} AS status
            FROM reservations r WHERE r.id = ? FOR UPDATE`, [id]))[0];
    }
    // Concerts still billed on a reservation (any status but CANCELLED), locked so a concurrent link or cancel waits.
    linkedConcerts(reservationId: string) {
        return this.rows("SELECT id, title AS name, status FROM concerts WHERE reservation_id = ? AND status <> 'CANCELLED' ORDER BY id FOR SHARE", [reservationId]);
    }
    async approvedPayments(reservationId: string): Promise<number> {
        return Number((await this.rows("SELECT COUNT(*) AS total FROM payments WHERE reservation_id = ? AND status = 'APPROVED'", [reservationId]))[0].total);
    }
    // The venue accepts a direct booking: HOLD -> CONFIRMED through the trigger (it rejects an expired HOLD).
    async confirmReservation(id: string, actorId: string): Promise<void> {
        await this.connection.query('SET @venti_user_id = ?', [actorId]);
        try { await this.execute("UPDATE reservations SET status_code = 'CONFIRMED' WHERE id = ?", [id]); }
        finally { await this.connection.query('SET @venti_user_id = NULL'); }
    }
    // Status changes go through the triggers; @venti_user_id attributes the history row to the actor.
    async setReservationStatus(id: string, actorId: string, status: 'CANCELLED' | 'EXPIRED', reason?: string | null): Promise<void> {
        await this.connection.query('SET @venti_user_id = ?', [actorId]);
        try {
            if (status === 'CANCELLED')
                await this.execute("UPDATE reservations SET status_code = 'CANCELLED', cancelled_by_user_id = ?, cancellation_reason = ? WHERE id = ?", [actorId, reason ?? null, id]);
            else await this.execute("UPDATE reservations SET status_code = 'EXPIRED' WHERE id = ?", [id]);
        } finally {
            await this.connection.query('SET @venti_user_id = NULL');
        }
    }
    setNotes(id: string, notes: string) { return this.execute('UPDATE reservations SET notes = ? WHERE id = ?', [notes, id]); }
    refundPayments(reservationId: string) {
        return this.execute("UPDATE payments SET status = 'REFUNDED' WHERE reservation_id = ? AND status = 'APPROVED'", [reservationId]);
    }
    async reservationDetails(reservation: Row) {
        const id = String(reservation.id);
        return { ...flags(reservation),
            occupancies: await this.rows('SELECT phase, starts_at, ends_at FROM reservation_occupancies WHERE reservation_id = ? ORDER BY starts_at', [id]),
            history: await this.rows('SELECT from_status, to_status, changed_by_user_id, changed_at FROM reservation_status_history WHERE reservation_id = ? ORDER BY changed_at, id', [id]),
            payments: (await this.payments(id)) };
    }
    async payments(reservationId: string) {
        return (await this.rows(`SELECT id, amount, currency, status, provider, is_simulated, simulated_reference, created_at, processed_at
            FROM payments WHERE reservation_id = ? ORDER BY id`, [reservationId])).map(payment => ({ ...payment, is_simulated: Boolean(payment.is_simulated) }));
    }
    async payment(id: string) { return (await this.rows(`SELECT id, reservation_id, amount, currency, status, provider, is_simulated, simulated_reference,
        created_at, processed_at FROM payments WHERE id = ?`, [id])).map(payment => ({ ...payment, is_simulated: Boolean(payment.is_simulated) }))[0]; }
    async reservations(userId: string, query: ListQuery, admin: boolean) {
        const where: string[] = []; const values: Value[] = [];
        if (query.as === 'requester') { where.push('r.user_id = ?'); values.push(userId); }
        else if (!admin) { where.push(member('e.organization_id')); values.push(userId); }
        if (query.status) { where.push(`${reservationStatus} = ?`); values.push(query.status); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const from = reservationSelect.slice(reservationSelect.indexOf('FROM reservations'));
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${from}${clause}`, values))[0].total);
        return { data: (await this.rows(`${reservationSelect}${clause} ORDER BY r.event_start_at DESC, r.id DESC LIMIT ? OFFSET ?`, [...values, ...limit(query)])).map(flags), total };
    }

    // ---- Notifications to the provider side (every member of the venue's organization) ----
    async notifyProviders(venueId: string, type: 'QUOTE_UPDATE' | 'RESERVATION_UPDATE', ref: { quote_id?: string; reservation_id?: string }, title: string, body: string) {
        await this.execute(`INSERT INTO notifications (user_id, type, quote_id, reservation_id, title, body)
            SELECT m.user_id, ?, ?, ?, ?, ? FROM venues v JOIN establishments e ON e.id = v.establishment_id
            JOIN organization_members m ON m.organization_id = e.organization_id WHERE v.id = ?`,
        [type, ref.quote_id ?? null, ref.reservation_id ?? null, title.slice(0, 200), body.slice(0, 1000), venueId]);
    }
}
