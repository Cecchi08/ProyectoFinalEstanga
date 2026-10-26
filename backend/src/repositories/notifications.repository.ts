import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { ManagementRepository } from './management.repository.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';

export type NotificationType = 'RECOMMENDATION' | 'PURCHASE_CONFIRMED' | 'CONCERT_REMINDER' | 'CONCERT_UPDATED' | 'CONCERT_CANCELLED' | 'POST_EVENT' | 'QUOTE_UPDATE' | 'RESERVATION_UPDATE' | 'SYSTEM';
export class NotificationsRepository {
    private readonly sql: ManagementRepository;
    constructor(private readonly connection: PoolConnection) { this.sql = new ManagementRepository(connection); }
    async list(userId: string, query: PageQuery) {
        const [counts] = await this.sql.rows(`SELECT COUNT(*) AS total, COALESCE(SUM(read_at IS NULL), 0) AS unread_count
            FROM notifications WHERE user_id = ?`, [userId]);
        const items = await this.sql.rows(`SELECT n.id, n.type, n.title, n.body AS message, n.concert_id, n.order_id AS purchase_id,
            n.reservation_id, n.quote_id, n.read_at, n.created_at, c.status AS concert_status
            FROM notifications n LEFT JOIN concerts c ON c.id = n.concert_id
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
        await this.connection.execute(`INSERT INTO notifications (user_id, type, concert_id, order_id, title, body)
            VALUES (?, 'PURCHASE_CONFIRMED', ?, ?, 'Compra confirmada', 'Tus entradas ya están disponibles en Mis entradas.')`, [userId, concertId, purchaseId]);
    }
    // Caller holds the concert lock and emits only for an actual state change. One set-based insert per event.
    async concert(concertId: string, type: NotificationType, title: string, message: string) {
        await this.connection.execute(`INSERT INTO notifications (user_id, type, concert_id, order_id, title, body)
            SELECT o.user_id, ?, ?, MIN(o.id), ?, ? FROM orders o JOIN order_items oi ON oi.order_id = o.id
            WHERE oi.concert_id = ? AND (o.status = 'CONFIRMED' OR (o.status = 'PENDING' AND o.expires_at > NOW()))
            GROUP BY o.user_id`, [type, concertId, title.slice(0, 200), message.slice(0, 1000), concertId]);
    }
    // Marketplace events; the caller already decided the recipient.
    async marketplace(userId: string, type: 'QUOTE_UPDATE' | 'RESERVATION_UPDATE', ref: { quote_id?: string | null; reservation_id?: string | null }, title: string, message: string) {
        await this.connection.execute(`INSERT INTO notifications (user_id, type, quote_id, reservation_id, title, body) VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, type, ref.quote_id ?? null, ref.reservation_id ?? null, title.slice(0, 200), message.slice(0, 1000)]);
    }
    // Caller locks the user before establishing a read snapshot, serializing Discover and preferences.
    async recommendation(userId: string, concertId: string, message: string) {
        await this.connection.execute(`INSERT INTO notifications (user_id, type, concert_id, title, body)
            SELECT ?, 'RECOMMENDATION', c.id, 'Venti Discover', ? FROM concerts c
            LEFT JOIN user_preferences up ON up.user_id = ?
            WHERE c.id = ? AND c.status = 'PUBLISHED' AND c.starts_at > NOW()
            AND COALESCE(up.notifications_enabled, TRUE) AND COALESCE(up.recommendations_enabled, TRUE)
            AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = ? AND n.concert_id = c.id AND n.type = 'RECOMMENDATION')`,
        [userId, message.slice(0, 1000), userId, concertId, userId]);
    }
}
