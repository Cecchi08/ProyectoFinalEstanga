import { ROLES } from '../types/auth.types.js';
const tokenTables = { refresh: 'refresh_tokens', verification: 'email_verification_tokens', reset: 'password_reset_tokens' };
const tokenColumn = (kind) => kind === 'refresh' ? 'revoked_at' : 'used_at';
export class MysqlAuthRepository {
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    async rows(sql, params = []) {
        const [rows] = await this.connection.execute(sql, params);
        return rows;
    }
    mapUser(row) {
        if (!row)
            return null;
        return { id: String(row.id), first_name: row.first_name, last_name: row.last_name,
            email: row.email, password_hash: row.password_hash,
            avatar_url: row.avatar_url, email_verified_at: row.email_verified_at,
            is_active: Boolean(row.is_active), created_at: row.created_at, updated_at: row.updated_at };
    }
    async findUserByEmail(email, lock = false) {
        return this.mapUser((await this.rows(`SELECT * FROM users WHERE email = ?${lock ? ' FOR UPDATE' : ''}`, [email]))[0]);
    }
    async findUserById(id, lock = false) {
        return this.mapUser((await this.rows(`SELECT * FROM users WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]))[0]);
    }
    async createUser(input) {
        await this.connection.execute('INSERT INTO users (first_name, last_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?, ?)', [input.first_name, input.last_name, input.email, input.password_hash, input.email_verified_at]);
        // Read LAST_INSERT_ID as text: BIGINT identifiers must never lose precision in JS.
        const row = (await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0];
        const user = await this.findUserById(String(row?.id));
        if (!user)
            throw new Error('No se pudo recuperar el usuario creado.');
        return user;
    }
    async initializeUser(id) {
        const [result] = await this.connection.execute("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [id]);
        if (result.affectedRows !== 1)
            throw new Error('Falta el catálogo USER. Importar schema.sql.');
        await this.connection.execute('INSERT INTO user_preferences (user_id) VALUES (?)', [id]);
    }
    async roles(id) {
        const rows = await this.rows('SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? ORDER BY r.id', [id]);
        return rows.map(row => {
            if (!ROLES.includes(row.code))
                throw new Error('Rol desconocido en la base de datos.');
            return row.code;
        });
    }
    async preferences(id) {
        const row = (await this.rows('SELECT recommendations_enabled, notifications_enabled FROM user_preferences WHERE user_id = ?', [id]))[0];
        return row ? { recommendations_enabled: Boolean(row.recommendations_enabled), notifications_enabled: Boolean(row.notifications_enabled) } : null;
    }
    async markVerified(id) { await this.connection.execute('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?', [id]); }
    async setPassword(id, hash) { await this.connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]); }
    async insertToken(kind, userId, hash, expires) {
        await this.connection.execute(`INSERT INTO ${tokenTables[kind]} (user_id, token_hash, expires_at) VALUES (?, ?, ?)`, [userId, hash, expires]);
    }
    async findToken(kind, hash, lock = false) {
        const row = (await this.rows(`SELECT * FROM ${tokenTables[kind]} WHERE token_hash = ?${lock ? ' FOR UPDATE' : ''}`, [hash]))[0];
        return row ? { id: String(row.id), user_id: String(row.user_id), token_hash: row.token_hash,
            expires_at: row.expires_at, revoked_at: row.revoked_at ?? null, used_at: row.used_at ?? null } : null;
    }
    async invalidateToken(kind, id) {
        await this.connection.execute(`UPDATE ${tokenTables[kind]} SET ${tokenColumn(kind)} = COALESCE(${tokenColumn(kind)}, UTC_TIMESTAMP()) WHERE id = ?`, [id]);
    }
    async invalidateUserTokens(kind, userId) {
        await this.connection.execute(`UPDATE ${tokenTables[kind]} SET ${tokenColumn(kind)} = UTC_TIMESTAMP() WHERE user_id = ? AND ${tokenColumn(kind)} IS NULL`, [userId]);
    }
    async oauthUser(provider, subject) {
        const row = (await this.rows('SELECT a.user_id FROM oauth_accounts a JOIN oauth_providers p ON p.id = a.provider_id WHERE p.code = ? AND a.provider_user_id = ?', [provider.toUpperCase(), subject]))[0];
        return row ? String(row.user_id) : null;
    }
    async linkOAuth(userId, provider, subject) {
        const [result] = await this.connection.execute('INSERT INTO oauth_accounts (user_id, provider_id, provider_user_id) SELECT ?, id, ? FROM oauth_providers WHERE code = ?', [userId, subject, provider.toUpperCase()]);
        if (result.affectedRows !== 1)
            throw new Error('Falta el catálogo de proveedores OAuth.');
    }
    async concertOwner(concertId) {
        const row = (await this.rows('SELECT organizer_id FROM concerts WHERE id = ?', [concertId]))[0];
        return row ? String(row.organizer_id) : null;
    }
    async staffAssigned(concertId, userId) {
        return (await this.rows('SELECT 1 FROM staff_assignments WHERE concert_id = ? AND user_id = ?', [concertId, userId])).length > 0;
    }
}
