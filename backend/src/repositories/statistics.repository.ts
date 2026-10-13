import type { PoolConnection } from 'mysql2/promise';
import type { Value } from '../types/management.types.ts';
import type { StatisticsQuery } from '../validators/statistics.schemas.ts';
import { ManagementRepository } from './management.repository.ts';
export class StatisticsRepository {
    private readonly sql: ManagementRepository;
    constructor(connection: PoolConnection) { this.sql = new ManagementRepository(connection); }
    async summary(query: StatisticsQuery, organizerId?: string) {
        const scope: string[] = ['TRUE']; const scopeValues: Value[] = [];
        if (organizerId) { scope.push('c.organizer_id = ?'); scopeValues.push(organizerId); }
        if (query.concert_id) { scope.push('c.id = ?'); scopeValues.push(query.concert_id); }
        const where = scope.join(' AND ');
        const dates: string[] = []; const dateValues: Value[] = [];
        if (query.from) { dates.push('p.created_at >= ?'); dateValues.push(query.from); }
        if (query.to) { dates.push('p.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); dateValues.push(query.to); }
        const filtered = `${where}${dates.length ? ` AND ${dates.join(' AND ')}` : ''}`;
        const values = [...scopeValues, ...dateValues];
        const salesFrom = `FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
            JOIN purchase_statuses ps ON ps.id = p.status_id JOIN ticket_types tt ON tt.id = pi.ticket_type_id
            JOIN concerts c ON c.id = tt.concert_id WHERE ${filtered} AND ps.code = 'CONFIRMED'`;
        // Aggregate items separately from tickets: joining individual tickets here would multiply amounts.
        const [sales] = await this.sql.rows(`SELECT COALESCE(SUM(pi.quantity), 0) AS tickets_sold,
            COALESCE(SUM(pi.quantity * pi.unit_price), 0) AS revenue, COUNT(DISTINCT p.id) AS confirmed_purchases ${salesFrom}`, values);
        const [tickets] = await this.sql.rows(`SELECT COALESCE(SUM(ts.code = 'USED'), 0) AS tickets_used,
            COALESCE(SUM(ts.code = 'ACTIVE'), 0) AS tickets_pending
            FROM tickets t JOIN ticket_statuses ts ON ts.id = t.status_id JOIN purchase_items pi ON pi.id = t.purchase_item_id
            JOIN purchases p ON p.id = pi.purchase_id JOIN purchase_statuses ps ON ps.id = p.status_id
            JOIN ticket_types tt ON tt.id = pi.ticket_type_id JOIN concerts c ON c.id = tt.concert_id
            WHERE ${filtered} AND ps.code = 'CONFIRMED'`, values);
        const [capacity] = await this.sql.rows(`SELECT COALESCE(SUM(tt.stock_total), 0) AS capacity
            FROM ticket_types tt JOIN concerts c ON c.id = tt.concert_id WHERE ${where}`, scopeValues);
        const [concerts] = await this.sql.rows(`SELECT COUNT(*) AS concerts,
            COALESCE(SUM(cs.code = 'PUBLISHED' AND COALESCE(c.end_datetime, c.start_datetime) >= NOW()), 0) AS active_concerts
            FROM concerts c JOIN concert_statuses cs ON cs.id = c.status_id WHERE ${where}`, scopeValues);
        const daily = await this.sql.rows(`SELECT DATE_FORMAT(p.created_at, '%Y-%m-%d') AS date,
            SUM(pi.quantity) AS tickets_sold, SUM(pi.quantity * pi.unit_price) AS revenue ${salesFrom}
            GROUP BY DATE_FORMAT(p.created_at, '%Y-%m-%d') ORDER BY date`, values);
        const activity = await this.sql.rows(`SELECT CASE WHEN ps.code IN ('PENDING','RESERVED') AND
            (p.expires_at IS NULL OR p.expires_at <= NOW()) THEN 'EXPIRED' ELSE ps.code END AS status,
            COUNT(DISTINCT p.id) AS purchases FROM purchases p JOIN purchase_statuses ps ON ps.id = p.status_id
            JOIN purchase_items pi ON pi.purchase_id = p.id JOIN ticket_types tt ON tt.id = pi.ticket_type_id
            JOIN concerts c ON c.id = tt.concert_id WHERE ${filtered} GROUP BY status ORDER BY status`, values);
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
            SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'ORGANIZER'
        )), 0) AS organizers FROM users u`);
        return { users: Number(row.users), organizers: Number(row.organizers) };
    }
}
