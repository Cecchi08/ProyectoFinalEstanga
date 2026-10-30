import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { user: '701', other: '702', organizer: '703' };
const roles = { user: 'COMPRADOR', other: 'COMPRADOR', organizer: 'ORGANIZADOR' };
const call = (method, url, role = 'user', body, key) => {
    const req = request(ctx.app)[method](url);
    if (key !== undefined) req.set('Idempotency-Key', key);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], [roles[role]])}`);
    return body === undefined ? req : req.send(body);
};
const input = (quantity = 2, ticketTypeId = '1') => ({ items: [{ ticketTypeId, quantity }] });
const reservedStock = async (typeId = '1') => Number((await db.rows(
    "SELECT COALESCE(SUM(oi.quantity), 0) AS total FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.ticket_type_id = ? AND o.status IN ('PENDING', 'CONFIRMED')", [typeId]))[0].total);
const ordersWithKey = async key => db.rows('SELECT id, status, expires_at FROM orders WHERE idempotency_key = ?', [key]);
const payments = async purchaseId => db.rows('SELECT id FROM order_payments WHERE order_id = ?', [purchaseId]);

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    for (const table of ['ticket_validations', 'tickets', 'order_items', 'order_payments', 'orders', 'ticket_types', 'concert_staff', 'notifications', 'concerts', 'users']) await db.rows(`DELETE FROM ${table}`);
    ctx = db.context();
    for (const [role, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, role, 'Test', `${role}@idem.example`]);
        await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, roles[role]]);
    }
    await db.rows(`INSERT INTO concerts (id, organizer_user_id, title, slug, artist_name, venue_name, address_line, starts_at, status, published_at)
        VALUES ('1', ?, 'Concierto', 'concierto-idem', 'Artista', 'Estadio', 'Calle 1', DATE_ADD(NOW(), INTERVAL 30 DAY), 'PUBLISHED', NOW())`, [ids.organizer]);
    for (const id of ['1', '2']) {
        await db.rows(`INSERT INTO ticket_types (id, concert_id, name, price, quantity_total, sales_start_at, sales_end_at, max_per_order)
            VALUES (?, 1, ?, 10.25, 5, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY), 4)`, [id, `Entrada ${id}`]);
    }
});

test('primera compra con clave: 201, compra PENDING, stock reservado una vez', async () => {
    const response = await call('post', '/purchases', 'user', input(2), 'key-primera-0001').expect(201);
    assert.equal(response.headers['idempotent-replayed'], undefined);
    assert.equal(response.body.data.status, 'PENDING');
    assert.equal(response.body.data.items[0].quantity, 2);
    assert.equal(await reservedStock(), 2);
    assert.equal((await ordersWithKey('key-primera-0001')).length, 1);
});

test('reintento idéntico con la misma clave: devuelve la compra original sin reservar ni crear nada', async () => {
    const first = (await call('post', '/purchases', 'user', input(2), 'key-reintento-0001').expect(201)).body.data;
    const [before] = await ordersWithKey('key-reintento-0001');
    const retry = await call('post', '/purchases', 'user', input(2), 'key-reintento-0001').expect(200);
    assert.equal(retry.headers['idempotent-replayed'], 'true');
    assert.equal(retry.body.data.id, first.id);
    assert.equal(retry.body.data.total, first.total);
    const [after] = await ordersWithKey('key-reintento-0001');
    assert.equal(after.id, before.id);
    assert.equal(new Date(after.expires_at).getTime(), new Date(before.expires_at).getTime(), 'la vigencia original no se renueva');
    assert.equal(Number((await db.rows('SELECT COUNT(*) AS total FROM orders'))[0].total), 1);
    assert.equal(await reservedStock(), 2, 'el reintento no libera ni reserva stock otra vez');
});

test('mismo contenido con los ítems en otro orden cuenta como reintento idéntico', async () => {
    const body = { items: [{ ticketTypeId: '1', quantity: 1 }, { ticketTypeId: '2', quantity: 1 }] };
    const reversed = { items: [...body.items].reverse() };
    const first = (await call('post', '/purchases', 'user', body, 'key-orden-0001').expect(201)).body.data;
    const retry = (await call('post', '/purchases', 'user', reversed, 'key-orden-0001').expect(200)).body.data;
    assert.equal(retry.id, first.id);
});

test('misma clave con contenido distinto: 409 IDEMPOTENCY_KEY_REUSED y sin efectos', async () => {
    await call('post', '/purchases', 'user', input(2), 'key-distinto-0001').expect(201);
    const conflict = await call('post', '/purchases', 'user', input(1), 'key-distinto-0001').expect(409);
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal(Number((await db.rows('SELECT COUNT(*) AS total FROM orders'))[0].total), 1);
    assert.equal(await reservedStock(), 2);
});

test('usuarios distintos con la misma clave: cada uno obtiene su propia compra y no ve la ajena', async () => {
    const mine = (await call('post', '/purchases', 'user', input(1), 'key-compartida-01').expect(201)).body.data;
    const theirs = (await call('post', '/purchases', 'other', input(1), 'key-compartida-01').expect(201)).body.data;
    assert.notEqual(theirs.id, mine.id);
    assert.equal(theirs.user_id ?? ids.other, ids.other);
    await call('get', `/purchases/${mine.id}`, 'other').expect(404);
    await call('get', `/purchases/${theirs.id}`, 'user').expect(404);
    assert.equal((await ordersWithKey('key-compartida-01')).length, 2);
});

test('solicitudes concurrentes con la misma clave: una sola compra, una sola reserva, mismo resultado', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => call('post', '/purchases', 'user', input(2), 'key-concurrente-1')));
    for (const response of responses) assert.ok([200, 201].includes(response.status), `status ${response.status}`);
    const idsReturned = new Set(responses.map(response => response.body.data.id));
    assert.equal(idsReturned.size, 1);
    assert.equal((await ordersWithKey('key-concurrente-1')).length, 1);
    assert.equal(await reservedStock(), 2, 'el stock se reservó una sola vez');
    assert.equal(Number((await db.rows('SELECT COUNT(*) AS total FROM order_items'))[0].total), 1);
});

test('rollback: un fallo a mitad de la creación no deja compra, reserva ni clave; reintentar con la misma clave crea la compra', async () => {
    await db.pool.query(`CREATE TRIGGER tmp_fail_items BEFORE INSERT ON order_items FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo simulado'`);
    try {
        const failed = await call('post', '/purchases', 'user', input(2), 'key-rollback-0001');
        assert.ok(failed.status >= 500, `status ${failed.status}`);
        assert.doesNotMatch(JSON.stringify(failed.body), /SQL|ER_|stack/i);
    } finally {
        await db.pool.query('DROP TRIGGER tmp_fail_items');
    }
    assert.equal((await ordersWithKey('key-rollback-0001')).length, 0, 'no queda compra con esa clave');
    assert.equal(await reservedStock(), 0, 'no queda stock reservado');
    const retried = await call('post', '/purchases', 'user', input(2), 'key-rollback-0001').expect(201);
    assert.equal(retried.headers['idempotent-replayed'], undefined, 'un intento fallido no cuenta como operación exitosa');
    assert.equal(await reservedStock(), 2);
});

test('compra PENDING: el reintento devuelve la misma compra pendiente, sin duplicar stock ni pagos', async () => {
    const pending = (await call('post', '/purchases', 'user', input(2), 'key-pendiente-01').expect(201)).body.data;
    await call('post', '/purchases', 'user', input(2), 'key-pendiente-01').expect(200);
    const replayed = (await call('post', '/purchases', 'user', input(2), 'key-pendiente-01').expect(200)).body.data;
    assert.equal(replayed.id, pending.id);
    assert.equal(replayed.status, 'PENDING');
    assert.equal(await reservedStock(), 2);
    assert.equal((await payments(pending.id)).length, 0, 'crear o reintentar una compra no genera pagos');
});

test('compra confirmada: el reintento no genera un segundo pago ni más entradas', async () => {
    const purchase = (await call('post', '/purchases', 'user', input(2), 'key-pago-000001').expect(201)).body.data;
    await call('post', `/purchases/${purchase.id}/confirm`, 'user').expect(200);
    const replayed = (await call('post', '/purchases', 'user', input(2), 'key-pago-000001').expect(200)).body.data;
    assert.equal(replayed.id, purchase.id);
    assert.equal(replayed.status, 'CONFIRMED');
    await call('post', `/purchases/${purchase.id}/confirm`, 'user');
    assert.equal((await payments(purchase.id)).length, 1, 'un solo pago simulado');
    assert.equal(Number((await db.rows('SELECT COUNT(*) AS total FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id WHERE oi.order_id = ?', [purchase.id]))[0].total), 2, 'una entrada por unidad, sin duplicados');
});

test('sin clave o con clave inválida: 422 y nada se crea', async () => {
    const missing = await call('post', '/purchases', 'user', input(1)).expect(422);
    assert.equal(missing.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
    await call('post', '/purchases', 'user', input(1), 'corta').expect(422);
    await call('post', '/purchases', 'user', input(1), 'con espacios 1234').expect(422);
    await call('post', '/purchases', 'user', input(1), 'x'.repeat(129)).expect(422);
    assert.equal(Number((await db.rows('SELECT COUNT(*) AS total FROM orders'))[0].total), 0);
});

test('sin autenticación se rechaza antes de exigir la clave', async () => {
    await request(ctx.app).post('/purchases').send(input(1)).expect(401);
});
