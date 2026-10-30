import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { organizer: '601', buyer: '602' };
const roles = { organizer: ['ORGANIZADOR'], buyer: ['COMPRADOR'] };
const future = days => new Date(Date.now() + days * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};
// Mismos catálogos semilla que management.test.js (ciudad 1, género 1).
const input = (extra = {}) => ({ name: 'Festival Fechas', artist_name: 'Banda Dos', venue_name: 'Estadio', address_line: 'Calle 2', city_id: '1',
    start_datetime: future(30), end_datetime: future(31), genre_ids: ['1'],
    ticket_types: [{ name: 'General', price: 1000, stock_total: 50, sale_start: future(1), sale_end: future(29), max_per_purchase: 4 }], ...extra });

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, name, 'Test', `${name}@events.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
});

// EVT-02: fechas coherentes al crear y al editar.
test('EVT-02 crear concierto: fin anterior o igual al inicio se rechaza con 422 y no crea nada', async () => {
    await call('post', '/concerts', 'organizer', input({ start_datetime: future(31), end_datetime: future(30) })).expect(422);
    await call('post', '/concerts', 'organizer', input({ start_datetime: future(30), end_datetime: future(30) })).expect(422);
    const [{ total }] = await db.rows('SELECT COUNT(*) AS total FROM concerts');
    assert.equal(Number(total), 0);
});

test('EVT-02 editar concierto: no se puede dejar el fin antes del inicio', async () => {
    const created = (await call('post', '/concerts', 'organizer', input()).expect(201)).body.data;
    await call('patch', `/concerts/${created.id}`, 'organizer', { end_datetime: future(10) }).expect(422);
    await call('patch', `/concerts/${created.id}`, 'organizer', { start_datetime: future(40) }).expect(422);
    const [row] = await db.rows('SELECT starts_at, ends_at FROM concerts WHERE id = ?', [created.id]);
    assert.ok(new Date(row.ends_at) > new Date(row.starts_at), 'la base mantiene fin posterior al inicio');
});

// TKT-02 (integridad del QR): la unicidad está en el esquema (uq_tickets_qr_token), no solo en la aplicación.
test('TKT-02 el esquema garantiza QR único por entrada', async () => {
    const [index] = await db.rows("SELECT NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets' AND INDEX_NAME = 'uq_tickets_qr_token' AND COLUMN_NAME = 'qr_token'");
    assert.ok(index, 'índice uq_tickets_qr_token existe');
    assert.equal(Number(index.NON_UNIQUE), 0);
});
