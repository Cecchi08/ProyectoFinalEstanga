import type { PoolConnection } from 'mysql2/promise';
import { ManagementRepository, concertSelect } from './management.repository.ts';
import type { ConcertRow, Principal, Value } from '../types/management.types.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';

export class ParticipationRepository {
    private readonly management: ManagementRepository;
    constructor(private readonly connection: PoolConnection) { this.management = new ManagementRepository(connection); }

    async favorites(user: Principal, query: PageQuery & { concert_id?: string }) {
        const where = ['EXISTS (SELECT 1 FROM favorites f WHERE f.concert_id = c.id AND f.user_id = ?)'];
        const values: Value[] = [user.id];
        // A favorite must not bypass the existing visibility rules for drafts/private concerts.
        if (!user.roles.includes('ADMIN')) {
            if (user.roles.includes('ORGANIZER')) { where.push("(s.code = 'PUBLISHED' OR c.organizer_id = ?)"); values.push(user.id); }
            else where.push("s.code = 'PUBLISHED'");
        }
        if (query.concert_id) { where.push('c.id = ?'); values.push(query.concert_id); }
        return this.concerts(where.join(' AND '), values, query);
    }

    assignments(user: Principal, query: PageQuery) {
        return this.concerts(user.roles.includes('ADMIN') ? 'TRUE' :
            'EXISTS (SELECT 1 FROM staff_assignments sa WHERE sa.concert_id = c.id AND sa.user_id = ?)',
        user.roles.includes('ADMIN') ? [] : [user.id], query);
    }

    private async concerts(where: string, values: Value[], query: PageQuery) {
        const from = concertSelect.slice(concertSelect.indexOf('FROM concerts'));
        const total = Number((await this.management.rows(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, values))[0].total);
        const rows = await this.management.rows<ConcertRow>(`${concertSelect} WHERE ${where}
            ORDER BY c.start_datetime, c.id LIMIT ? OFFSET ?`, [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data: await this.management.concertDetails(rows), total };
    }

    async addFavorite(userId: string, concertId: string): Promise<void> {
        // The existing composite PK prevents duplicates, including concurrent requests.
        await this.connection.execute(`INSERT INTO favorites (user_id, concert_id) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE user_id = favorites.user_id`, [userId, concertId]);
    }
    async removeFavorite(userId: string, concertId: string): Promise<void> {
        await this.connection.execute('DELETE FROM favorites WHERE user_id = ? AND concert_id = ?', [userId, concertId]);
    }

    async attendees(concertId: string, user: Principal, query: PageQuery) {
        // Repeat the access predicate inside the data queries so revocation between
        // the permission check and the read never discloses attendee records.
        const access: string[] = []; const values: Value[] = [concertId];
        if (user.roles.includes('ADMIN')) access.push('TRUE');
        if (user.roles.includes('ORGANIZER')) { access.push('c.organizer_id = ?'); values.push(user.id); }
        if (user.roles.includes('STAFF')) { access.push('EXISTS (SELECT 1 FROM staff_assignments sa WHERE sa.concert_id = c.id AND sa.user_id = ?)'); values.push(user.id); }
        const from = `FROM tickets t JOIN ticket_statuses ts ON ts.id = t.status_id
            JOIN purchase_items pi ON pi.id = t.purchase_item_id JOIN purchases p ON p.id = pi.purchase_id
            JOIN purchase_statuses ps ON ps.id = p.status_id JOIN users u ON u.id = p.user_id
            JOIN ticket_types tt ON tt.id = pi.ticket_type_id JOIN concerts c ON c.id = tt.concert_id
            WHERE c.id = ? AND (${access.join(' OR ') || 'FALSE'})`;
        const total = Number((await this.management.rows(`SELECT COUNT(*) AS total ${from}`, values))[0].total);
        const data = await this.management.rows(`SELECT t.id AS ticket_id, tt.name AS ticket_type_name,
            u.first_name, u.last_name, ts.code AS status, ps.code AS purchase_status, t.used_at ${from}
            ORDER BY t.id LIMIT ? OFFSET ?`, [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data, total };
    }
}
