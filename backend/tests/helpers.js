import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.config.js';
import { createPool, MysqlDatabase } from '../src/config/db.config.js';
import { AuthService } from '../src/services/auth.service.js';
import { AccessTokens } from '../src/utils/jwt.util.js';
import { SCHEMA_FILE, schemaStatements } from '../scripts/schema-statements.js';
export const password = 'Strong-password-123';
export const registration = { first_name: 'Ana', last_name: 'Pérez', email: 'ana@example.com', password };
export function testEnv() {
    return loadEnv({ NODE_ENV: 'test', DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1', DB_PORT: process.env.TEST_DB_PORT ?? '3306',
        DB_USER: process.env.TEST_DB_USER ?? 'root', DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? '', DB_NAME: 'venti_test',
        JWT_ACCESS_SECRET: 'test-only-secret-0123456789abcdef-0123456789abcdef', BCRYPT_ROUNDS: '10',
        SMTP_HOST: '127.0.0.1', SMTP_FROM: 'test@venti.example',
        GOOGLE_CLIENT_ID: 'google-test', GOOGLE_CLIENT_SECRET: 'google-secret', GOOGLE_CALLBACK_URL: 'http://localhost/auth/oauth/google/callback',
        GITHUB_CLIENT_ID: 'github-test', GITHUB_CLIENT_SECRET: 'github-secret', GITHUB_CALLBACK_URL: 'http://localhost/auth/oauth/github/callback',
        FACEBOOK_CLIENT_ID: 'facebook-test', FACEBOOK_CLIENT_SECRET: 'facebook-secret', FACEBOOK_CALLBACK_URL: 'http://localhost/auth/oauth/facebook/callback' });
}
export class Outbox {
    messages = [];
    enqueue(message) { this.messages.push(message); }
    last(kind) {
        const mail = [...this.messages].reverse().find(m => m.kind === kind);
        assert.ok(mail);
        return mail;
    }
}
export class FakeProvider {
    profile = { provider: 'google', subject: 'google-user-1', email: 'oauth@example.com', emailVerified: true, firstName: 'OAuth', lastName: 'User' };
    async identity(provider) { return { ...this.profile, provider }; }
}
export { SCHEMA_FILE, schemaStatements };
// Business tables in child-to-parent order; catalogs from the schema seed (roles, geography, genres...) stay.
const BUSINESS_TABLES = ['service_quote_items', 'service_quotes', 'ticket_validations', 'tickets', 'order_items', 'order_payments', 'notifications', 'recommendations', 'orders', 'concert_staff',
    'ticket_types', 'concert_genres', 'concerts', 'payments', 'reservations', 'quote_items', 'quotes', 'venue_blocks', 'venues',
    'establishments', 'organization_members', 'organizations', 'artist_profiles', 'admin_audit_log', 'users'];
export async function resetData(database) {
    // FK cascades do not fire triggers, so deleting reservations also removes their occupancies.
    for (const table of BUSINESS_TABLES) await database.rows(`DELETE FROM ${table}`);
}
export class TestDatabase {
    env = testEnv();
    name = `venti_test_${randomBytes(8).toString('hex')}`;
    pool;
    db;
    async open() {
        const connection = await mysql.createConnection({ host: this.env.DB_HOST, port: this.env.DB_PORT, user: this.env.DB_USER, password: this.env.DB_PASSWORD });
        try {
            const original = await readFile(SCHEMA_FILE, 'utf8');
            const schema = original.replace('CREATE DATABASE IF NOT EXISTS venti ', `CREATE DATABASE \`${this.name}\` `).replace('USE venti;', `USE \`${this.name}\`;`);
            if (schema === original) throw new Error('El esquema no tiene CREATE DATABASE/USE venti.');
            for (const statement of schemaStatements(schema)) await connection.query(statement);
        }
        finally {
            await connection.end();
        }
        this.env.DB_NAME = this.name;
        this.pool = createPool(this.env);
        this.db = new MysqlDatabase(this.pool);
    }
    async clear() { await this.pool.execute('DELETE FROM users'); }
    async close() {
        if (!this.pool)
            return;
        assert.match(this.name, /^venti_test_[a-f0-9]{16}$/);
        await this.pool.query(`DROP DATABASE \`${this.name}\``);
        await this.pool.end();
    }
    context() {
        const mailer = new Outbox();
        const provider = new FakeProvider();
        const tokens = new AccessTokens(this.env);
        const auth = new AuthService(this.db, this.env, tokens, mailer);
        const app = createApp({ env: this.env, database: this.db, mailer, oauthClient: provider });
        return { mailer, provider, tokens, auth, app };
    }
    async rows(sql, params = []) { return (await this.pool.execute(sql, params))[0]; }
}
export async function verifiedUser(auth, mailer) {
    const result = await auth.register(registration);
    await auth.verifyEmail(mailer.last('verification').token);
    return result.user;
}
