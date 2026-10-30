import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import { testEnv } from './helpers.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, demoPassword, demoTarget, ensureDatabase, remoteDemoTarget, seedDemo } from '../scripts/demo-seed.mjs';
import { demoFootprint, unseedDemo } from '../scripts/demo-unseed.mjs';

// Same isolated MySQL as the rest of the suite (testEnv enforces 127.0.0.1:33316), in databases of its own.
const env = testEnv();
const server = { host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD };
const ownDatabase = () => ({ ...server, database: `venti_demo_test_${randomBytes(6).toString('hex')}` });
const target = ownDatabase();
const shared = ownDatabase();
let connection;
after(async () => {
    const admin = await mysql.createConnection(server);
    for (const { database } of [target, shared]) {
        assert.match(database, /^venti_demo_test_[a-f0-9]{12}$/);
        await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    }
    await admin.end();
    await connection?.end();
});

test('seed demo: rechaza bases remotas, la XAMPP y cualquier base que no sea venti_demo*', () => {
    assert.throws(() => demoTarget({ DEMO_DB_HOST: 'sakura.proxy.rlwy.net' }), /local/);
    assert.throws(() => demoTarget({ DEMO_DB_HOST: 'mysql.railway.internal' }), /local/);
    assert.throws(() => demoTarget({ DEMO_DB_PORT: '3306' }), /3306/);
    assert.throws(() => demoTarget({ DEMO_DB_NAME: 'venti' }), /venti_demo/);
    assert.equal(demoTarget({}).database, 'venti_demo');
});

test('seed demo remoto: exige confirmar host y base exactos y una contraseña propia, nunca la pública', () => {
    const source = { MYSQL_PUBLIC_URL: 'mysql://user:secret@sakura.proxy.rlwy.net:51148/railway', MYSQLDATABASE: 'venti' };
    assert.throws(() => remoteDemoTarget(source), /DEMO_CONFIRM_HOST/);
    assert.throws(() => remoteDemoTarget({ ...source, DEMO_CONFIRM_HOST: 'sakura.proxy.rlwy.net', DEMO_CONFIRM_DATABASE: 'railway' }), /DEMO_CONFIRM_HOST/);
    const remote = remoteDemoTarget({ ...source, DEMO_CONFIRM_HOST: 'sakura.proxy.rlwy.net', DEMO_CONFIRM_DATABASE: 'venti' });
    assert.deepEqual([remote.host, remote.port, remote.database, remote.remote], ['sakura.proxy.rlwy.net', 51148, 'venti', true]);
    assert.throws(() => demoPassword(remote, {}), /DEMO_SEED_PASSWORD/);
    assert.throws(() => demoPassword(remote, { DEMO_SEED_PASSWORD: 'corta' }), /DEMO_SEED_PASSWORD/);
    assert.equal(demoPassword(remote, { DEMO_SEED_PASSWORD: 'x'.repeat(24) }), 'x'.repeat(24));
    assert.equal(demoPassword(demoTarget({}), {}), DEMO_PASSWORD);
});

test('seed demo: idempotente, contraseñas por bcrypt real, relaciones y estados coherentes', { timeout: 300000 }, async () => {
    const quiet = () => {};
    const first = await seedDemo(target, quiet);
    const second = await seedDemo(target, quiet);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.deepEqual(second.counts, first.counts, 'la segunda ejecución no duplica ninguna fila');
    for (const [table, total] of Object.entries(first.counts)) if (!['recommendations'].includes(table)) assert.ok(total > 0, `${table} poblada`);

    connection = await mysql.createConnection({ ...target });
    const rows = async (sql, params = []) => (await connection.query(sql, params))[0];
    assert.equal((await rows('SELECT COUNT(*) AS n FROM users'))[0].n, DEMO_ACCOUNTS.length);
    for (const { email } of DEMO_ACCOUNTS) {
        const [user] = await rows('SELECT password_hash, email_verified_at, status FROM users WHERE email = ?', [email]);
        assert.ok(await bcrypt.compare(DEMO_PASSWORD, user.password_hash), `${email}: hash bcrypt de la contraseña demo`);
        assert.ok(user.email_verified_at && user.status === 'ACTIVE');
    }
    const roles = await rows('SELECT u.email, GROUP_CONCAT(r.code ORDER BY r.code) AS codes FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id GROUP BY u.email');
    const byEmail = Object.fromEntries(roles.map(row => [row.email, row.codes]));
    for (const role of ['ADMIN', 'ORGANIZADOR', 'VENUE', 'EMPRESA_SERVICIOS', 'ARTISTA', 'COMPRADOR']) assert.ok(Object.values(byEmail).some(codes => codes.split(',').includes(role)), `rol ${role}`);
    // Sin sesiones ni tokens inventados.
    assert.equal((await rows('SELECT COUNT(*) AS n FROM auth_refresh_tokens'))[0].n, 0);
    assert.equal((await rows('SELECT COUNT(*) AS n FROM password_reset_tokens'))[0].n, 0);
    // Todo lo visible lleva el prefijo [DEMO].
    for (const [table, column] of [['concerts', 'title'], ['organizations', 'name'], ['establishments', 'name'], ['venues', 'name'], ['artist_profiles', 'stage_name'],
        ['service_offerings', 'name'], ['reservations', 'event_name'], ['quotes', 'event_name'], ['service_quotes', 'event_name']])
        assert.equal(Number((await rows(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} NOT LIKE '[DEMO] %'`))[0].n), 0, `${table}.${column} identificable`);
    // Estados de negocio y relaciones.
    const orderStates = (await rows('SELECT status, refund_status FROM orders')).map(row => `${row.status}/${row.refund_status}`).sort();
    assert.ok(orderStates.includes('CONFIRMED/NONE') && orderStates.includes('CANCELLED/REFUNDED'), orderStates.join(','));
    const [mismatch] = await rows(`SELECT COUNT(*) AS n FROM order_items oi WHERE oi.quantity <> (SELECT COUNT(*) FROM tickets t WHERE t.order_item_id = oi.id)
        AND oi.order_id IN (SELECT id FROM orders WHERE confirmed_at IS NOT NULL)`);
    assert.equal(mismatch.n, 0, 'una entrada por unidad confirmada');
    const [used] = await rows("SELECT COUNT(*) AS n FROM tickets t JOIN ticket_validations v ON v.ticket_id = t.id AND v.result = 'ACCEPTED' WHERE t.status = 'USED'");
    assert.equal(used.n, 1, 'la entrada validada por QR quedó USED con su validación');
    const [reservation] = await rows("SELECT r.status_code, p.status AS payment, p.is_simulated FROM reservations r JOIN payments p ON p.reservation_id = r.id");
    assert.deepEqual([reservation.status_code, reservation.payment, Number(reservation.is_simulated)], ['CONFIRMED', 'APPROVED', 1]);
    const [linked] = await rows("SELECT c.status, c.venue_id = r.venue_id AS same_venue FROM concerts c JOIN reservations r ON r.id = c.reservation_id");
    assert.deepEqual([linked.status, Number(linked.same_venue)], ['PUBLISHED', 1]);
    assert.equal((await rows("SELECT status FROM service_quotes"))[0].status, 'ACCEPTED');
    assert.equal((await rows("SELECT status FROM establishments"))[0].status, 'PUBLISHED');
    assert.equal(Number((await rows("SELECT COUNT(*) AS n FROM order_payments WHERE is_simulated = 0"))[0].n), 0, 'pagos exclusivamente simulados');
});

test('retiro de la demo: deja la base exactamente como antes del seed y se detiene si hay datos reales ligados', { timeout: 300000 }, async () => {
    // A "shared" database with real data that predates the demo.
    await ensureDatabase(shared);
    const db = await mysql.createConnection({ ...shared });
    try {
        const rows = async (sql, params = []) => (await db.query(sql, params))[0];
        await rows("INSERT INTO users (email, first_name, last_name, email_verified_at) VALUES ('cliente@real.example', 'Cliente', 'Real', NOW())");
        const [real] = await rows("SELECT id FROM users WHERE email = 'cliente@real.example'");
        await rows(`INSERT INTO concerts (organizer_user_id, title, slug, artist_name, venue_name, address_line, starts_at, status, published_at)
            VALUES (?, 'Show real', 'show-real', 'Banda real', 'Teatro', 'Calle 2', DATE_ADD(NOW(), INTERVAL 40 DAY), 'PUBLISHED', NOW())`, [real.id]);
        const tables = (await rows("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY 1")).map(row => row.name);
        const snapshot = async () => {
            const state = {};
            for (const table of tables) {
                const [[{ n }], [checksum]] = await Promise.all([rows(`SELECT COUNT(*) AS n FROM \`${table}\``), rows(`CHECKSUM TABLE \`${table}\``)]);
                state[table] = `${n}:${checksum.Checksum}`;
            }
            return state;
        };
        const before = await snapshot();

        await seedDemo(shared, () => {});
        const seeded = await demoFootprint(shared);
        assert.ok(seeded.counts.users === DEMO_ACCOUNTS.length && seeded.counts.concerts === 3 && seeded.counts.orders === 3, JSON.stringify(seeded.counts));
        assert.ok(Object.values(seeded.related).every(value => value === 0), 'la demo sola no toca datos reales');

        const dryRun = await unseedDemo(shared);
        assert.equal(dryRun.applied, false);
        assert.deepEqual((await demoFootprint(shared)).counts, seeded.counts, 'la simulación no borra nada');

        // A real person tied to demo data (member of the demo organization) blocks the removal.
        const [org] = await rows("SELECT id FROM organizations WHERE name = '[DEMO] Puerto Sonoro SRL'");
        await rows("INSERT INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, 'STAFF')", [org.id, real.id]);
        const blocked = await unseedDemo(shared, { apply: true });
        assert.deepEqual([blocked.applied, blocked.blockedByRelated, blocked.related.organization_members], [false, true, 1]);
        assert.deepEqual((await demoFootprint(shared)).counts, seeded.counts, 'bloqueado: no se borró nada');
        await rows('DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?', [org.id, real.id]);

        const removed = await unseedDemo(shared, { apply: true });
        assert.equal(removed.applied, true);
        assert.ok(Object.values((await demoFootprint(shared)).counts).every(value => value === 0));
        assert.deepEqual(await snapshot(), before, 'cada tabla vuelve a sus filas exactas previas al seed');
        const again = await unseedDemo(shared, { apply: true });
        assert.ok(again.applied && Object.values(again.counts).every(value => value === 0), 'repetir el retiro no hace nada');
    } finally {
        await db.end();
    }
});
