import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Row, Value } from '../types/management.types.ts';
import type { AuditQuery, UserQuery } from '../validators/admin.schemas.ts';

const normalize = <T extends Row>(row: T): T => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value !== null && (key === 'id' || key.endsWith('_id')) ? String(value) : value])) as T;
const page = (query: { page: number; limit: number }) => [String(query.limit), String((query.page - 1) * query.limit)];
const userSelect = `SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.is_guest, u.email_verified_at, u.last_login_at, u.created_at,
    COALESCE((SELECT GROUP_CONCAT(r.code ORDER BY r.id) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '') AS roles
    FROM users u`;
const shape = (row: Row) => ({ ...row, is_guest: Boolean(row.is_guest), roles: String(row.roles ?? '').split(',').filter(Boolean) });

export class AdminRepository {
    constructor(readonly connection: PoolConnection) {}
    async rows<T extends Row = Row>(sql: string, params: Value[] = []): Promise<T[]> {
        const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
        return (rows as T[]).map(normalize);
    }
    async execute(sql: string, params: Value[] = []): Promise<number> {
        return (await this.connection.execute<ResultSetHeader>(sql, params))[0].affectedRows;
    }
    async users(query: UserQuery) {
        const where: string[] = []; const values: Value[] = [];
        if (query.q) { where.push("(u.email LIKE ? OR CONCAT_WS(' ', u.first_name, u.last_name) LIKE ?)"); values.push(`%${query.q}%`, `%${query.q}%`); }
        if (query.role) { where.push('EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = ?)'); values.push(query.role); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const total = Number((await this.rows(`SELECT COUNT(*) AS total FROM users u${clause}`, values))[0].total);
        const data = (await this.rows(`${userSelect}${clause} ORDER BY u.id LIMIT ? OFFSET ?`, [...values, ...page(query)])).map(shape);
        return { data, total };
    }
    async user(id: string) {
        const row = (await this.rows(`${userSelect} WHERE u.id = ?`, [id]))[0];
        return row ? shape(row) : undefined;
    }
    // Lock order for every role change: role row first, then the target user. The role lock also
    // serializes "last active ADMIN" checks between concurrent revocations.
    async lockRole(code: string): Promise<{ id: string; code: string } | undefined> {
        return (await this.rows<{ id: string; code: string }>('SELECT id, code FROM roles WHERE code = ? FOR UPDATE', [code]))[0];
    }
    async lockUser(id: string): Promise<{ id: string; email: string | null; status: string; is_guest: number } | undefined> {
        return (await this.rows<{ id: string; email: string | null; status: string; is_guest: number }>(
            'SELECT id, email, status, is_guest FROM users WHERE id = ? FOR UPDATE', [id]))[0];
    }
    grant(userId: string, roleId: string) { return this.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]); }
    revoke(userId: string, roleId: string) { return this.execute('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?', [userId, roleId]); }
    roleCatalog(codes: string[]) {
        return this.rows(`SELECT code, name, description FROM roles WHERE code IN (${codes.map(() => '?').join(',')}) ORDER BY id`, codes);
    }
    async hasRole(userId: string, roleId: string): Promise<boolean> {
        return (await this.rows('SELECT role_id FROM user_roles WHERE user_id = ? AND role_id = ?', [userId, roleId])).length > 0;
    }
    async roleCount(userId: string): Promise<number> {
        return Number((await this.rows('SELECT COUNT(*) AS total FROM user_roles WHERE user_id = ?', [userId]))[0].total);
    }
    async activeHolders(roleId: string): Promise<number> {
        return Number((await this.rows(`SELECT COUNT(*) AS total FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role_id = ? AND u.status = 'ACTIVE'`, [roleId]))[0].total);
    }
    async audit(entry: { actor: string; action: 'ROLE_GRANTED' | 'ROLE_REVOKED' | 'ROLE_SELF_ACTIVATED'; target: string; roleId: string; details: Record<string, unknown> }) {
        await this.execute('INSERT INTO admin_audit_log (actor_user_id, action, target_user_id, role_id, details) VALUES (?, ?, ?, ?, ?)',
            [entry.actor, entry.action, entry.target, entry.roleId, JSON.stringify(entry.details)]);
    }
    async auditLog(query: AuditQuery) {
        const where: string[] = []; const values: Value[] = [];
        if (query.target_user_id) { where.push('a.target_user_id = ?'); values.push(query.target_user_id); }
        if (query.actor_user_id) { where.push('a.actor_user_id = ?'); values.push(query.actor_user_id); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const total = Number((await this.rows(`SELECT COUNT(*) AS total FROM admin_audit_log a${clause}`, values))[0].total);
        const data = await this.rows(`SELECT a.id, a.action, a.actor_user_id, a.target_user_id, r.code AS role, a.details, a.created_at
            FROM admin_audit_log a LEFT JOIN roles r ON r.id = a.role_id${clause} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...values, ...page(query)]);
        return { data, total };
    }
}
