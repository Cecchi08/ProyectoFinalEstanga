import type { PoolConnection } from 'mysql2/promise';
import type { Value } from '../types/management.types.ts';
import type { StatisticsQuery } from '../validators/statistics.schemas.ts';
import { ManagementRepository } from './management.repository.ts';
export class StatisticsRepository {
    private readonly sql: ManagementRepository;
    constructor(connection: PoolConnection) { this.sql = new ManagementRepository(connection); }
    async summary(query: StatisticsQuery, organizerId?: string) {
        const scope: string[] = ['TRUE']; const scopeValues: Value[] = [];
        if (organizerId) { scope.push('c.organizer_user_id = ?'); scopeValues.push(organizerId); }
        if (query.concert_id) { scope.push('c.id = ?'); scopeValues.push(query.concert_id); }
        const where = scope.join(' AND ');
        const dates: string[] = []; const dateValues: Value[] = [];
        if (query.from) { dates.push('o.created_at >= ?'); dateValues.push(query.from); }
        if (query.to) { dates.push('o.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); dateValues.push(query.to); }
        const filtered = `${where}${dates.length ? ` AND ${dates.join(' AND ')}` : ''}`;
        const values = [...scopeValues, ...dateValues];
        const salesFrom = `FROM order_items oi JOIN orders o ON o.id = oi.order_id
            JOIN concerts c ON c.id = oi.concert_id WHERE ${filtered} AND o.status = 'CONFIRMED'`;
        // Aggregate items separately from tickets: joining individual tickets here would multiply amounts.
        const [sales] = await this.sql.rows(`SELECT COALESCE(SUM(oi.quantity), 0) AS tickets_sold,
            COALESCE(SUM(oi.line_total), 0) AS revenue, COUNT(DISTINCT o.id) AS confirmed_purchases ${salesFrom}`, values);
        const [tickets] = await this.sql.rows(`SELECT COALESCE(SUM(t.status = 'USED'), 0) AS tickets_used,
            COALESCE(SUM(t.status = 'VALID'), 0) AS tickets_pending
            FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id JOIN orders o ON o.id = oi.order_id
            JOIN concerts c ON c.id = t.concert_id WHERE ${filtered} AND o.status = 'CONFIRMED'`, values);
        const [capacity] = await this.sql.rows(`SELECT COALESCE(SUM(tt.quantity_total), 0) AS capacity
            FROM ticket_types tt JOIN concerts c ON c.id = tt.concert_id WHERE ${where}`, scopeValues);
        const [concerts] = await this.sql.rows(`SELECT COUNT(*) AS concerts,
            COALESCE(SUM(c.status = 'PUBLISHED' AND COALESCE(c.ends_at, c.starts_at) >= NOW()), 0) AS active_concerts
            FROM concerts c WHERE ${where}`, scopeValues);
        const daily = await this.sql.rows(`SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d') AS date,
            SUM(oi.quantity) AS tickets_sold, SUM(oi.line_total) AS revenue ${salesFrom}
            GROUP BY DATE_FORMAT(o.created_at, '%Y-%m-%d') ORDER BY date`, values);
        const activity = await this.sql.rows(`SELECT CASE WHEN o.status = 'PENDING' AND
            (o.expires_at IS NULL OR o.expires_at <= NOW()) THEN 'EXPIRED' ELSE o.status END AS status,
            COUNT(DISTINCT o.id) AS purchases FROM orders o JOIN order_items oi ON oi.order_id = o.id
            JOIN concerts c ON c.id = oi.concert_id WHERE ${filtered} GROUP BY status ORDER BY status`, values);
        const sold = Number(sales.tickets_sold), totalCapacity = Number(capacity.capacity);
        return { tickets_sold: sold, revenue: String(sales.revenue), confirmed_purchases: Number(sales.confirmed_purchases),
            attendees: Number(tickets.tickets_used), tickets_used: Number(tickets.tickets_used), tickets_pending: Number(tickets.tickets_pending),
            capacity: totalCapacity, occupancy_percent: totalCapacity ? Math.round(sold / totalCapacity * 10000) / 100 : 0,
            concerts: Number(concerts.concerts), active_concerts: Number(concerts.active_concerts),
            sales_by_day: daily.map(row => ({ date: String(row.date), tickets_sold: Number(row.tickets_sold), revenue: String(row.revenue) })),
            activity: activity.map(row => ({ status: String(row.status), purchases: Number(row.purchases) })) };
    }
    async users() {
        const [row] = await this.sql.rows(`SELECT COUNT(*) AS users, COALESCE(SUM(EXISTS (
            SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'ORGANIZADOR'
        )), 0) AS organizers FROM users u`);
        return { users: Number(row.users), organizers: Number(row.organizers) };
    }
}
