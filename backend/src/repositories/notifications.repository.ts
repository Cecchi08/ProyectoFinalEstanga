import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { ManagementRepository } from './management.repository.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';

export type NotificationType = 'RECOMMENDATION' | 'PURCHASE_CONFIRMED' | 'CONCERT_REMINDER' | 'SCHEDULE_CHANGE' | 'CONCERT_CANCELLED' | 'IMPORTANT_INFO';
export class NotificationsRepository {
    private readonly sql: ManagementRepository;
    constructor(private readonly connection: PoolConnection) { this.sql = new ManagementRepository(connection); }
    async list(userId: string, query: PageQuery) {
        const [counts] = await this.sql.rows(`SELECT COUNT(*) AS total, COALESCE(SUM(read_at IS NULL), 0) AS unread_count
            FROM notifications WHERE user_id = ?`, [userId]);
        const items = await this.sql.rows(`SELECT n.id, nt.code AS type, n.title, n.message, n.concert_id, n.purchase_id,
            n.read_at, n.created_at, cs.code AS concert_status
            FROM notifications n JOIN notification_types nt ON nt.id = n.type_id
            LEFT JOIN concerts c ON c.id = n.concert_id LEFT JOIN concert_statuses cs ON cs.id = c.status_id
            WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`,
        [userId, String(query.limit), String((query.page - 1) * query.limit)]);
        return { items, total: Number(counts.total), unread_count: Number(counts.unread_count) };
    }
    async read(userId: string, id?: string) {
        const [result] = await this.connection.execute<ResultSetHeader>(`UPDATE notifications SET read_at = COALESCE(read_at, NOW())
            WHERE user_id = ?${id ? ' AND id = ?' : ' AND read_at IS NULL'}`, id ? [userId, id] : [userId]);
        return result.affectedRows;
    }
    // Called only inside the purchase transaction, after its locked state transition.
    async purchase(userId: string, purchaseId: string, concertId: string) {
        await this.connection.execute(`INSERT INTO notifications (user_id, type_id, concert_id, purchase_id, title, message)
            SELECT ?, id, ?, ?, 'Compra confirmada', 'Tus entradas ya están disponibles en Mis entradas.'
            FROM notification_types WHERE code = 'PURCHASE_CONFIRMED'`, [userId, concertId, purchaseId]);
    }
    // Caller holds the concert lock and emits only for an actual state change. One set-based insert per event.
    async concert(concertId: string, type: NotificationType, title: string, message: string) {
        await this.connection.execute(`INSERT INTO notifications (user_id, type_id, concert_id, purchase_id, title, message)
            SELECT audience.user_id, nt.id, ?, audience.purchase_id, ?, ? FROM (
                SELECT recipients.user_id, MIN(recipients.purchase_id) AS purchase_id FROM (
                    SELECT p.user_id, p.id AS purchase_id FROM purchases p
                    JOIN purchase_statuses ps ON ps.id = p.status_id JOIN purchase_items pi ON pi.purchase_id = p.id
                    JOIN ticket_types tt ON tt.id = pi.ticket_type_id WHERE tt.concert_id = ? AND
                    (ps.code = 'CONFIRMED' OR (ps.code IN ('PENDING','RESERVED') AND p.expires_at > NOW()))
                    UNION ALL
                    SELECT f.user_id, NULL FROM favorites f LEFT JOIN user_preferences up ON up.user_id = f.user_id
                    WHERE f.concert_id = ? AND COALESCE(up.notifications_enabled, TRUE) = TRUE
                ) recipients GROUP BY recipients.user_id
            ) audience JOIN notification_types nt ON nt.code = ?`, [concertId, title.slice(0, 160), message.slice(0, 500), concertId, concertId, type]);
    }
    // Caller locks the user before establishing a read snapshot, serializing Discover and preferences.
    async recommendation(userId: string, concertId: string, message: string) {
        await this.connection.execute(`INSERT INTO notifications (user_id, type_id, concert_id, title, message)
            SELECT ?, nt.id, c.id, 'Venti Discover', ? FROM concerts c
            JOIN concert_statuses cs ON cs.id = c.status_id JOIN notification_types nt ON nt.code = 'RECOMMENDATION'
            LEFT JOIN user_preferences up ON up.user_id = ?
            WHERE c.id = ? AND cs.code = 'PUBLISHED' AND c.start_datetime > NOW()
            AND COALESCE(up.notifications_enabled, TRUE) AND COALESCE(up.recommendations_enabled, TRUE)
            AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = ? AND n.concert_id = c.id AND n.type_id = nt.id)`,
        [userId, message.slice(0, 500), userId, concertId, userId]);
    }
}
