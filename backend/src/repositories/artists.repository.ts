import { randomBytes } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Fields, Row, Value } from '../types/management.types.ts';
import type { ArtistQuery, ProposalQuery } from '../validators/artists.schemas.ts';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { ManagementRepository, concertSelect } from './management.repository.ts';
import type { ConcertRow } from '../types/management.types.ts';

const normalize = <T extends Row>(row: T): T => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value !== null && (key === 'id' || key.endsWith('_id')) ? String(value) : value])) as T;
const columns = ['stage_name', 'slug', 'bio', 'city_id', 'image_url', 'website', 'phone', 'contact_email', 'status', 'published_at', 'created_by_user_id'] as const;
const proposalColumns = ['public_code', 'flow_type', 'artist_profile_id', 'venue_id', 'establishment_id', 'concert_id', 'sender_user_id',
    'event_title', 'event_description', 'genre_or_format', 'proposed_date', 'proposed_end_date', 'expected_attendance', 'offered_amount',
    'currency', 'economic_terms', 'space_conditions', 'technical_requirements', 'message', 'status', 'rejection_reason',
    'responded_by_user_id', 'responded_at'] as const;
const profileSelect = `SELECT a.id, a.stage_name, a.slug, a.bio, a.city_id, ci.name AS city_name, a.image_url, a.website, a.phone, a.contact_email, a.status,
    a.published_at, a.created_at, a.updated_at FROM artist_profiles a LEFT JOIN cities ci ON ci.id = a.city_id`;
// A PENDING proposal whose proposed date already passed can no longer be answered: it is reported as EXPIRED
// (computed, like service quotes) without rewriting the stored status.
const proposalStatus = "CASE WHEN p.status = 'PENDING' AND p.proposed_date <= UTC_TIMESTAMP() THEN 'EXPIRED' ELSE p.status END";
const proposalSelect = `SELECT p.id, p.public_code, p.flow_type, p.artist_profile_id, a.stage_name AS artist_name, a.image_url AS artist_image_url, a.phone AS artist_phone, a.contact_email AS artist_contact_email,
    p.venue_id, v.name AS venue_name, v.capacity_standing AS venue_capacity,
    p.establishment_id, e.name AS establishment_name, e.address_line AS establishment_address, ci.name AS city_name,
    p.concert_id, c.title AS concert_name,
    p.sender_user_id, NULLIF(TRIM(CONCAT_WS(' ', su.first_name, su.last_name)), '') AS sender_name, su.email AS sender_email,
    p.event_title, p.event_description, p.genre_or_format, p.proposed_date, p.proposed_end_date, p.expected_attendance,
    p.offered_amount, p.currency, p.economic_terms, p.space_conditions, p.technical_requirements, p.message,
    ${proposalStatus} AS status, p.rejection_reason, p.responded_by_user_id, p.responded_at, p.created_at, p.updated_at
    FROM artist_proposals p
    JOIN artist_profiles a ON a.id = p.artist_profile_id
    JOIN users su ON su.id = p.sender_user_id
    LEFT JOIN venues v ON v.id = p.venue_id
    LEFT JOIN establishments e ON e.id = COALESCE(p.establishment_id, v.establishment_id)
    LEFT JOIN cities ci ON ci.id = COALESCE(e.city_id, a.city_id)
    LEFT JOIN concerts c ON c.id = p.concert_id`;

export class ArtistsRepository {
    constructor(private readonly connection: PoolConnection) {}
    async rows<T extends Row = Row>(sql: string, params: Value[] = []): Promise<T[]> {
        const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
        return (rows as T[]).map(normalize);
    }
    async execute(sql: string, params: Value[] = []): Promise<number> {
        return (await this.connection.execute<ResultSetHeader>(sql, params))[0].affectedRows;
    }
    async insert(data: Fields): Promise<string> {
        const keys = columns.filter(key => data[key] !== undefined);
        await this.execute(`INSERT INTO artist_profiles (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(key => data[key] ?? null));
        return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id);
    }
    async update(id: string, data: Fields): Promise<void> {
        const keys = columns.filter(key => data[key] !== undefined);
        if (keys.length) await this.execute(`UPDATE artist_profiles SET ${keys.map(key => `${key} = ?`).join(',')} WHERE id = ?`, [...keys.map(key => data[key] ?? null), id]);
    }
    // Parent lock for every write on a profile and its members/genres.
    async lock(id: string): Promise<Row | undefined> {
        return (await this.rows('SELECT id, status, published_at FROM artist_profiles WHERE id = ? FOR UPDATE', [id]))[0];
    }
    async profile(id: string): Promise<Row | undefined> { return (await this.rows(`${profileSelect} WHERE a.id = ?`, [id]))[0]; }
    async list(query: ArtistQuery) {
        const where = ["a.status = 'PUBLISHED'"]; const values: Value[] = [];
        if (query.q) { where.push('a.stage_name LIKE ?'); values.push(`%${query.q}%`); }
        if (query.city_id) { where.push('a.city_id = ?'); values.push(query.city_id); }
        if (query.genre_id) { where.push('EXISTS (SELECT 1 FROM artist_profile_genres g WHERE g.artist_profile_id = a.id AND g.genre_id = ?)'); values.push(query.genre_id); }
        const clause = ` WHERE ${where.join(' AND ')}`;
        const total = Number((await this.rows(`SELECT COUNT(*) AS total FROM artist_profiles a${clause}`, values))[0].total);
        const data = await this.rows(`${profileSelect}${clause} ORDER BY a.stage_name, a.id LIMIT ? OFFSET ?`,
            [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data: await this.withGenres(data), total };
    }
    mine(userId: string) {
        return this.rows(`${profileSelect} JOIN artist_members m ON m.artist_profile_id = a.id AND m.user_id = ?
            ORDER BY a.stage_name, a.id`, [userId]).then(rows => this.withGenres(rows));
    }
    async withGenres(rows: Row[]) {
        if (!rows.length) return [];
        const ids = rows.map(row => String(row.id));
        const genres = await this.rows(`SELECT g.artist_profile_id, ge.id, ge.name, ge.slug FROM artist_profile_genres g JOIN genres ge ON ge.id = g.genre_id
            WHERE g.artist_profile_id IN (${ids.map(() => '?').join(',')}) ORDER BY ge.name`, ids);
        return rows.map(row => ({ ...row, genres: genres.filter(g => g.artist_profile_id === row.id).map(({ artist_profile_id: _id, ...genre }) => genre) }));
    }
    async replaceGenres(id: string, genreIds: string[]): Promise<void> {
        await this.execute('DELETE FROM artist_profile_genres WHERE artist_profile_id = ?', [id]);
        if (genreIds.length) await this.execute(`INSERT INTO artist_profile_genres (artist_profile_id, genre_id) VALUES ${genreIds.map(() => '(?, ?)').join(',')}`,
            genreIds.flatMap(genre => [id, genre]));
    }
    async memberRole(id: string, userId: string): Promise<string | undefined> {
        return (await this.rows<{ member_role: string }>('SELECT member_role FROM artist_members WHERE artist_profile_id = ? AND user_id = ?', [id, userId]))[0]?.member_role;
    }
    // Public view shows names only; members (and admins) also see emails.
    members(id: string, withEmail: boolean) {
        return this.rows(`SELECT m.user_id, u.first_name, u.last_name, ${withEmail ? 'u.email,' : ''} m.member_role, m.created_at
            FROM artist_members m JOIN users u ON u.id = m.user_id WHERE m.artist_profile_id = ?
            ORDER BY FIELD(m.member_role, 'OWNER', 'MEMBER'), m.created_at, m.user_id`, [id]);
    }
    // Membership never grants a profile: the account must already hold artist.profile.manage (ARTISTA or ADMIN).
    async candidate(email: string): Promise<{ id: string; artist: boolean } | undefined> {
        const row = (await this.rows(`SELECT u.id, EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id = u.id AND p.code = ?) AS artist
            FROM users u WHERE u.email = ? AND u.status = 'ACTIVE' AND u.is_guest = 0`, [P.artistProfileManage, email]))[0];
        return row ? { id: String(row.id), artist: Number(row.artist) === 1 } : undefined;
    }
    addMember(id: string, userId: string, role: string) {
        return this.execute('INSERT INTO artist_members (artist_profile_id, user_id, member_role) VALUES (?, ?, ?)', [id, userId, role]);
    }
    setMemberRole(id: string, userId: string, role: string) {
        return this.execute('UPDATE artist_members SET member_role = ? WHERE artist_profile_id = ? AND user_id = ?', [role, id, userId]);
    }
    removeMember(id: string, userId: string) { return this.execute('DELETE FROM artist_members WHERE artist_profile_id = ? AND user_id = ?', [id, userId]); }
    // Performances: concerts that bill this profile. Drafts stay private to their organizer.
    async concerts(id: string) {
        const management = new ManagementRepository(this.connection);
        const rows = await management.rows<ConcertRow>(`${concertSelect} JOIN concert_artists ca ON ca.concert_id = c.id
            WHERE ca.artist_profile_id = ? AND c.status <> 'DRAFT' ORDER BY c.starts_at DESC, c.id DESC LIMIT 200`, [id]);
        return management.concertDetails(rows);
    }
    async owners(id: string): Promise<number> {
        return Number((await this.rows("SELECT COUNT(*) AS total FROM artist_members WHERE artist_profile_id = ? AND member_role = 'OWNER'", [id]))[0].total);
    }

    // ---- Bidirectional Proposals & Hirings (Espacios <-> Artistas, Organizadores -> Artistas) ----
    async venueContext(venueId: string): Promise<{ id: string; name: string; establishment_id: string; establishment_name: string; organization_id: string } | undefined> {
        return (await this.rows<{ id: string; name: string; establishment_id: string; establishment_name: string; organization_id: string }>(
            `SELECT v.id, v.name, v.establishment_id, e.name AS establishment_name, e.organization_id
             FROM venues v JOIN establishments e ON e.id = v.establishment_id WHERE v.id = ?`, [venueId]))[0];
    }
    async establishmentContext(establishmentId: string): Promise<{ id: string; name: string; organization_id: string } | undefined> {
        return (await this.rows<{ id: string; name: string; organization_id: string }>(
            'SELECT id, name, organization_id FROM establishments WHERE id = ?', [establishmentId]))[0];
    }
    async isEstablishmentMember(establishmentId: string, userId: string): Promise<boolean> {
        return (await this.rows(`SELECT 1 FROM establishments e JOIN organization_members m ON m.organization_id = e.organization_id
            WHERE e.id = ? AND m.user_id = ?`, [establishmentId, userId])).length > 0;
    }
    async concertContext(concertId: string): Promise<{ id: string; organizer_user_id: string; title: string; venue_id: string | null } | undefined> {
        return (await this.rows<{ id: string; organizer_user_id: string; title: string; venue_id: string | null }>(
            'SELECT id, organizer_user_id, title, venue_id FROM concerts WHERE id = ?', [concertId]))[0];
    }
    async duplicatePendingProposal(flowType: string, artistProfileId: string, venueId: string | null | undefined, proposedDate: Date): Promise<boolean> {
        return (await this.rows(`SELECT id FROM artist_proposals
            WHERE flow_type = ? AND artist_profile_id = ? AND COALESCE(venue_id, 0) = COALESCE(?, 0)
              AND DATE(proposed_date) = DATE(?) AND status = 'PENDING'`,
        [flowType, artistProfileId, venueId ?? null, proposedDate])).length > 0;
    }
    async createProposal(data: Fields): Promise<string> {
        const payload: Fields = { ...data, public_code: `C-${randomBytes(4).toString('hex').toUpperCase()}` };
        const keys = proposalColumns.filter(key => payload[key] !== undefined);
        await this.execute(`INSERT INTO artist_proposals (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(key => payload[key] ?? null));
        return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id);
    }
    async updateProposal(id: string, data: Fields): Promise<void> {
        const keys = proposalColumns.filter(key => data[key] !== undefined);
        if (keys.length) await this.execute(`UPDATE artist_proposals SET ${keys.map(key => `${key} = ?`).join(',')} WHERE id = ?`, [...keys.map(key => data[key] ?? null), id]);
    }
    async lockProposal(id: string): Promise<Row | undefined> {
        return (await this.rows('SELECT id, flow_type, artist_profile_id, venue_id, establishment_id, concert_id, sender_user_id, event_title, status, proposed_date, proposed_end_date FROM artist_proposals WHERE id = ? FOR UPDATE', [id]))[0];
    }
    async proposal(id: string): Promise<Row | undefined> {
        return (await this.rows(`${proposalSelect} WHERE p.id = ?`, [id]))[0];
    }
    async proposals(userId: string, query: ProposalQuery, isAdmin: boolean) {
        const where: string[] = []; const values: Value[] = [];
        const isArtistRecipient = `(p.flow_type IN ('VENUE_TO_ARTIST', 'ORGANIZER_TO_ARTIST') AND EXISTS (SELECT 1 FROM artist_members am WHERE am.artist_profile_id = p.artist_profile_id AND am.user_id = ?))`;
        const isVenueRecipient = `(p.flow_type = 'ARTIST_TO_VENUE' AND EXISTS (SELECT 1 FROM establishments est JOIN organization_members om ON om.organization_id = est.organization_id WHERE est.id = COALESCE(p.establishment_id, v.establishment_id) AND om.user_id = ?))`;
        const isArtistMember = `EXISTS (SELECT 1 FROM artist_members am WHERE am.artist_profile_id = p.artist_profile_id AND am.user_id = ?)`;
        const isVenueMember = `EXISTS (SELECT 1 FROM establishments est JOIN organization_members om ON om.organization_id = est.organization_id WHERE est.id = COALESCE(p.establishment_id, v.establishment_id) AND om.user_id = ?)`;

        if (query.direction === 'received') {
            where.push(`(${isArtistRecipient} OR ${isVenueRecipient})`);
            values.push(userId, userId);
        } else if (query.direction === 'sent') {
            where.push(`(p.sender_user_id = ? OR (p.flow_type = 'ARTIST_TO_VENUE' AND ${isArtistMember}) OR (p.flow_type = 'VENUE_TO_ARTIST' AND ${isVenueMember}))`);
            values.push(userId, userId, userId);
        } else if (!isAdmin) {
            where.push(`(p.sender_user_id = ? OR ${isArtistMember} OR ${isVenueMember})`);
            values.push(userId, userId, userId);
        }
        if (query.flow_type) { where.push('p.flow_type = ?'); values.push(query.flow_type); }
        if (query.status) { where.push(`${proposalStatus} = ?`); values.push(query.status); }
        if (query.artist_profile_id) { where.push('p.artist_profile_id = ?'); values.push(query.artist_profile_id); }
        if (query.venue_id) { where.push('p.venue_id = ?'); values.push(query.venue_id); }
        if (query.establishment_id) { where.push('COALESCE(p.establishment_id, v.establishment_id) = ?'); values.push(query.establishment_id); }

        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const fromClause = proposalSelect.slice(proposalSelect.indexOf('FROM artist_proposals p'));
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${fromClause}${clause}`, values))[0].total);
        const rows = await this.rows(`${proposalSelect}${clause} ORDER BY p.proposed_date ASC, p.id DESC LIMIT ? OFFSET ?`,
            [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data: rows, total };
    }
    // Confirmed engagements of the artist that overlap [start, end). A proposal without an end lasts 3 hours.
    async acceptedConflict(artistProfileId: string, start: Date, end: Date | null, excludeId?: string): Promise<Row | undefined> {
        const until = end ?? new Date(start.getTime() + 3 * 3600000);
        return (await this.rows(`SELECT id, event_title, proposed_date FROM artist_proposals
            WHERE artist_profile_id = ? AND status = 'ACCEPTED' AND id <> ?
              AND proposed_date < ? AND COALESCE(proposed_end_date, DATE_ADD(proposed_date, INTERVAL 3 HOUR)) > ?
            ORDER BY proposed_date LIMIT 1`, [artistProfileId, excludeId ?? '0', until, start]))[0];
    }
    async linkArtistToConcert(concertId: string, artistProfileId: string): Promise<void> {
        await this.execute('INSERT IGNORE INTO concert_artists (concert_id, artist_profile_id, billing_order) VALUES (?, ?, 0)', [concertId, artistProfileId]);
    }
    async notifyArtistMembers(artistProfileId: string, proposalId: string, title: string, body: string, meta: Record<string, unknown>): Promise<void> {
        await this.execute(`INSERT INTO notifications (user_id, type, title, body, data)
            SELECT am.user_id, 'SYSTEM', ?, ?, ? FROM artist_members am WHERE am.artist_profile_id = ?`,
        [title.slice(0, 200), body.slice(0, 1000), JSON.stringify({ proposal_id: proposalId, ...meta }), artistProfileId]);
    }
    async notifyEstablishmentMembers(establishmentId: string, proposalId: string, title: string, body: string, meta: Record<string, unknown>): Promise<void> {
        await this.execute(`INSERT INTO notifications (user_id, type, title, body, data)
            SELECT om.user_id, 'SYSTEM', ?, ?, ? FROM establishments e JOIN organization_members om ON om.organization_id = e.organization_id WHERE e.id = ?`,
        [title.slice(0, 200), body.slice(0, 1000), JSON.stringify({ proposal_id: proposalId, ...meta }), establishmentId]);
    }
    async notifyProposalUser(userId: string, proposalId: string, title: string, body: string, meta: Record<string, unknown>): Promise<void> {
        await this.execute(`INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, 'SYSTEM', ?, ?, ?)`,
            [userId, title.slice(0, 200), body.slice(0, 1000), JSON.stringify({ proposal_id: proposalId, ...meta })]);
    }
    async venueSummary(establishmentId: string) {
        const proposals = await this.rows(`${proposalSelect} WHERE COALESCE(p.establishment_id, v.establishment_id) = ? ORDER BY p.proposed_date ASC, p.id DESC LIMIT 100`, [establishmentId]);
        const relatedOrganizers = await this.rows(`SELECT r.public_code AS reservation_code, r.status_code AS reservation_status,
            r.event_name, r.event_start_at, r.event_end_at, r.expected_attendance,
            v.name AS venue_name,
            NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS organizer_name, u.email AS organizer_email, u.phone AS organizer_phone,
            org.name AS organization_name,
            c.id AS concert_id, c.title AS concert_name, c.artist_name AS concert_artist, c.status AS concert_status
            FROM reservations r
            JOIN venues v ON v.id = r.venue_id
            JOIN users u ON u.id = r.user_id
            LEFT JOIN concerts c ON c.reservation_id = r.id LEFT JOIN organizations org ON org.id = c.organization_id
            /* reservation_id linked */
            WHERE r.establishment_id = ?
            ORDER BY r.event_start_at DESC, r.id DESC LIMIT 100`, [establishmentId]);
        const venueConcerts = await this.rows(`SELECT c.id, c.title AS name, c.artist_name, c.starts_at AS start_datetime, c.ends_at AS end_datetime,
            c.status, v.name AS venue_name,
            NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS organizer_name, u.email AS organizer_email
            FROM concerts c
            JOIN venues v ON v.id = c.venue_id
            JOIN users u ON u.id = c.organizer_user_id
            WHERE v.establishment_id = ?
            ORDER BY c.starts_at DESC, c.id DESC LIMIT 100`, [establishmentId]);
        return { proposals, related_organizers: relatedOrganizers, concerts: venueConcerts };
    }
}
