import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Row, Value } from '../types/management.types.ts';
import type { AuditQuery, OrganizationQuery, UserQuery } from '../validators/admin.schemas.ts';
import { audit, type AuditEntry } from './audit.repository.ts';

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
        if (query.status) { where.push('u.status = ?'); values.push(query.status); }
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
    audit(entry: AuditEntry) { return audit(this.connection, entry); }
    setStatus(userId: string, status: 'ACTIVE' | 'BLOCKED') { return this.execute('UPDATE users SET status = ? WHERE id = ?', [status, userId]); }
    // A suspended account loses its sessions at once; access tokens already stop working because every request rebuilds the principal.
    revokeSessions(userId: string) {
        return this.execute('UPDATE auth_refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
    }
    async isAdmin(userId: string): Promise<boolean> {
        return (await this.rows("SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.code = 'ADMIN'", [userId])).length > 0;
    }
    // Every organization with what it operates: venue establishments, a service provider profile, or both.
    async organizations(query: OrganizationQuery) {
        const where: string[] = []; const values: Value[] = [];
        if (query.q) { where.push('(o.name LIKE ? OR o.slug LIKE ? OR o.email LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`); }
        if (query.status) { where.push('o.status = ?'); values.push(query.status); }
        if (query.kind === 'VENUE') where.push('EXISTS (SELECT 1 FROM establishments e WHERE e.organization_id = o.id)');
        if (query.kind === 'SERVICES') where.push('sp.organization_id IS NOT NULL');
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const from = 'FROM organizations o LEFT JOIN service_providers sp ON sp.organization_id = o.id';
        const total = Number((await this.rows(`SELECT COUNT(*) AS total ${from}${clause}`, values))[0].total);
        const data = (await this.rows(`SELECT o.id, o.name, o.legal_name, o.tax_id, o.slug, o.email, o.phone, o.status, o.created_by_user_id, o.created_at,
            (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id) AS members,
            (SELECT COUNT(*) FROM establishments e WHERE e.organization_id = o.id) AS establishments,
            (SELECT GROUP_CONCAT(u.email ORDER BY u.id) FROM organization_members m JOIN users u ON u.id = m.user_id
                WHERE m.organization_id = o.id AND m.member_role = 'OWNER') AS owners,
            sp.status AS service_status, sp.is_verified AS service_verified
            ${from}${clause} ORDER BY o.name, o.id LIMIT ? OFFSET ?`, [...values, ...page(query)]))
            .map(({ service_status, service_verified, ...row }) => ({ ...row, members: Number(row.members), establishments: Number(row.establishments),
                owners: String(row.owners ?? '').split(',').filter(Boolean),
                service_provider: service_status === null ? null : { status: service_status, is_verified: Boolean(service_verified) } }));
        return { data, total };
    }
    async auditLog(query: AuditQuery) {
        const where: string[] = []; const values: Value[] = [];
        if (query.target_user_id) { where.push('a.target_user_id = ?'); values.push(query.target_user_id); }
        if (query.actor_user_id) { where.push('a.actor_user_id = ?'); values.push(query.actor_user_id); }
        if (query.action) { where.push('a.action = ?'); values.push(query.action); }
        if (query.entity_type) { where.push('a.entity_type = ?'); values.push(query.entity_type); }
        if (query.entity_id) { where.push('a.entity_id = ?'); values.push(query.entity_id); }
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const total = Number((await this.rows(`SELECT COUNT(*) AS total FROM admin_audit_log a${clause}`, values))[0].total);
        const data = await this.rows(`SELECT a.id, a.action, a.actor_user_id, a.target_user_id, r.code AS role, a.entity_type, a.entity_id, a.details, a.created_at
            FROM admin_audit_log a LEFT JOIN roles r ON r.id = a.role_id${clause} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...values, ...page(query)]);
        return { data, total };
    }
}
