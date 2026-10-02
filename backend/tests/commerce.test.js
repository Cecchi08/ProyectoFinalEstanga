import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase } from './helpers.js';
import { CommerceRepository } from '../src/repositories/commerce.repository.ts';
import { CommerceService } from '../src/services/commerce.service.ts';

const db = new TestDatabase();
let ctx;
const ids = { user: '101', other: '102', organizer: '103', staff: '104', unassigned: '105', admin: '106' };
const roles = { user: 'USER', other: 'USER', organizer: 'ORGANIZER', staff: 'STAFF', unassigned: 'STAFF', admin: 'ADMIN' };
const call = (method, url, role = 'user', body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], [roles[role]])}`);
    return body === undefined ? req : req.send(body);
};
const input = (quantity = 2, ticketTypeId = '1') => ({ items: [{ ticketTypeId, quantity }] });
const reserve = async (body = input(), role = 'user') => (await call('post', '/purchases', role, body).expect(201)).body.data;
const transition = (id, action, role = 'user') => call('post', `/purchases/${id}/${action}`, role);
const tickets = async (role = 'user') => (await call('get', '/tickets', role).expect(200)).body.data;
const scan = (qrToken, role = 'staff', concertId = '1') => call('post', '/tickets/validate', role, { qrToken, concertId });
async function confirmed(body = input()) {
    const purchase = await reserve(body);
    await transition(purchase.id, 'confirm').expect(200);
    return { purchase, tickets: await tickets() };
}
async function error(response, status, code) {
    const result = await response;
    assert.equal(result.status, status, JSON.stringify(result.body));
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, code);
}

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    for (const table of ['tickets', 'purchase_items', 'purchases', 'concerts', 'venues', 'cities', 'provinces', 'users']) await db.rows(`DELETE FROM ${table}`);
    ctx = db.context();
    for (const [role, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, role, 'Test', `${role}@commerce.example`]);
        await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, roles[role]]);
    }
    await db.rows("INSERT INTO organizer_profiles (user_id, display_name) VALUES (?, 'Organizador')", [ids.organizer]);
    await db.rows("INSERT INTO provinces (id, name) VALUES (1, 'Buenos Aires')");
    await db.rows("INSERT INTO cities (id, province_id, name) VALUES (1, 1, 'La Plata')");
    await db.rows("INSERT INTO venues (id, city_id, name, address) VALUES (1, 1, 'Estadio', 'Calle 1')");
    for (const id of ['1', '2']) {
        await db.rows(`INSERT INTO concerts (id, organizer_id, venue_id, concert_type_id, status_id, name, start_datetime)
            SELECT ?, ?, 1, 1, id, ?, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM concert_statuses WHERE code = 'PUBLISHED'`, [id, ids.organizer, `Concierto ${id}`]);
    }
    for (const [id, concert] of [['1', '1'], ['2', '1'], ['3', '2']]) {
        await db.rows(`INSERT INTO ticket_types (id, concert_id, name, price, stock_total, sale_start, sale_end, max_per_purchase)
            VALUES (?, ?, ?, 10.25, 5, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY), 4)`, [id, concert, `Entrada ${id}`]);
    }
    await db.rows('INSERT INTO staff_assignments (concert_id, user_id, assigned_by_user_id) VALUES (1, ?, ?)', [ids.staff, ids.organizer]);
});

test('reserva válida usa propietario autenticado, precio BD, total exacto y no emite tickets', async () => {
    const purchase = await reserve();
    assert.equal(purchase.user_id, ids.user);
    assert.equal(purchase.status, 'RESERVED');
    assert.equal(purchase.total, '20.50');
    assert.equal(purchase.items[0].unit_price, '10.25');
    assert.equal(purchase.items[0].quantity, 2);
    assert.ok(new Date(purchase.expires_at) > new Date());
    assert.ok(new Date(purchase.expires_at) <= new Date(Date.now() + 15 * 60000));
    assert.equal((await tickets()).length, 0);
});

test('reserva limita expiración al cierre de venta y admite ventanas sin límites', async () => {
    await db.rows('UPDATE ticket_types SET sale_start = NULL, sale_end = DATE_ADD(NOW(), INTERVAL 2 MINUTE) WHERE id = 1');
    const purchase = await reserve(input(1));
    const [type] = await db.rows('SELECT sale_end FROM ticket_types WHERE id = 1');
    assert.equal(new Date(purchase.expires_at).getTime(), new Date(type.sale_end).getTime());
    await db.rows('UPDATE ticket_types SET sale_start = NULL, sale_end = NULL, max_per_purchase = NULL WHERE id = 2');
    await reserve(input(5, '2'));
});

test('todos los roles pueden comprar; autenticación requerida en todas las rutas', async () => {
    await db.rows('UPDATE ticket_types SET stock_total = 100');
    for (const role of Object.keys(ids)) await reserve(input(1), role);
    for (const [method, path] of [['post', '/purchases'], ['get', '/purchases/me'], ['get', '/purchases/1'], ['post', '/purchases/1/confirm'], ['post', '/purchases/1/cancel'], ['get', '/tickets'], ['get', '/tickets/1'], ['post', '/tickets/validate']])
        await call(method, path, null, method === 'post' ? {} : undefined).expect(401);
});

test('body estricto rechaza precio, total, usuario, estado, duplicados y cantidades inválidas', async () => {
    for (const extra of [{ price: 0 }, { total: 0 }, { user_id: ids.other }, { status: 'CONFIRMED' }])
        await call('post', '/purchases', 'user', { ...input(), ...extra }).expect(422);
    for (const extra of [{ price: 0 }, { unit_price: 0 }, { user_id: ids.other }])
        await call('post', '/purchases', 'user', { items: [{ ...input().items[0], ...extra }] }).expect(422);
    for (const body of [input(0), input(-1), input(1.2), input(101), { items: [] }, { items: [...input().items, ...input().items] }])
        await call('post', '/purchases', 'user', body).expect(422);
});

test('stock insuficiente y max_per_purchase rechazan sin crear compras parciales', async () => {
    await error(call('post', '/purchases', 'user', input(5)), 409, 'MAX_PER_PURCHASE');
    await reserve(input(4));
    await error(call('post', '/purchases', 'other', input(2)), 409, 'INSUFFICIENT_STOCK');
    assert.equal((await db.rows('SELECT id FROM purchases')).length, 1);
});

test('concierto no publicado, comenzado o venta fuera de fecha se rechazan', async () => {
    await db.rows("UPDATE concerts SET status_id = (SELECT id FROM concert_statuses WHERE code = 'DRAFT') WHERE id = 1");
    await error(call('post', '/purchases', 'user', input()), 409, 'CONCERT_NOT_PUBLISHED');
    await db.rows("UPDATE concerts SET status_id = (SELECT id FROM concert_statuses WHERE code = 'PUBLISHED') WHERE id = 1");
    await db.rows('UPDATE ticket_types SET sale_start = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE id = 1');
    await error(call('post', '/purchases', 'user', input()), 409, 'SALE_CLOSED');
    await db.rows('UPDATE ticket_types SET sale_start = NULL, sale_end = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE id = 1');
    await error(call('post', '/purchases', 'user', input()), 409, 'SALE_CLOSED');
    await db.rows('UPDATE ticket_types SET sale_end = NULL WHERE id = 1');
    await db.rows('UPDATE concerts SET start_datetime = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = 1');
    await error(call('post', '/purchases', 'user', input()), 409, 'SALE_CLOSED');
});

test('un solo concierto por compra; concertId opcional debe coincidir', async () => {
    for (const body of [{ ...input(), concertId: '2' }, { items: [...input().items, ...input(1, '3').items] }])
        await error(call('post', '/purchases', 'user', body), 422, 'WRONG_CONCERT');
    await call('post', '/purchases', 'user', input(1, '999')).expect(404);
    assert.equal((await db.rows('SELECT id FROM purchases')).length, 0);
});

test('compra ajena queda oculta, listados son propios y Admin puede consultar/confirmar', async () => {
    const purchase = await reserve();
    for (const role of ['other', 'organizer', 'staff']) {
        await call('get', `/purchases/${purchase.id}`, role).expect(404);
        await transition(purchase.id, 'confirm', role).expect(404);
        await transition(purchase.id, 'cancel', role).expect(404);
    }
    assert.equal((await call('get', '/purchases/me', 'other').expect(200)).body.data.length, 0);
    const own = await call('get', '/purchases/me?limit=1').expect(200);
    assert.equal(own.body.pagination.total, 1);
    assert.equal(own.body.data[0].id, purchase.id);
    await call('get', `/purchases/${purchase.id}`, 'admin').expect(200);
    await transition(purchase.id, 'confirm', 'admin').expect(200);
});

test('reserva vencida libera stock lógico sin cron y se persiste EXPIRED al intentar confirmar', async () => {
    const purchase = await reserve(input(4));
    await db.rows('UPDATE purchases SET expires_at = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE id = ?', [purchase.id]);
    assert.equal((await call('get', `/purchases/${purchase.id}`).expect(200)).body.data.status, 'EXPIRED');
    const fresh = await reserve(input(4));
    await transition(fresh.id, 'confirm').expect(200);
    await error(transition(purchase.id, 'confirm'), 409, 'RESERVATION_EXPIRED');
    const [row] = await db.rows('SELECT ps.code FROM purchases p JOIN purchase_statuses ps ON ps.id = p.status_id WHERE p.id = ?', [purchase.id]);
    assert.equal(row.code, 'EXPIRED');
    assert.equal((await tickets()).length, 4);
});

test('PENDING vigente consume stock y puede confirmarse; sin expiración se trata como vencida', async () => {
    const purchase = await reserve(input(4));
    await db.rows("UPDATE purchases SET status_id = (SELECT id FROM purchase_statuses WHERE code = 'PENDING') WHERE id = ?", [purchase.id]);
    await error(call('post', '/purchases', 'other', input(2)), 409, 'INSUFFICIENT_STOCK');
    await transition(purchase.id, 'confirm').expect(200);
    const next = await reserve(input(1));
    await db.rows('UPDATE purchases SET expires_at = NULL WHERE id = ?', [next.id]);
    await error(transition(next.id, 'cancel'), 409, 'RESERVATION_EXPIRED');
    await reserve(input(1));
});

test('confirmación genera quantity tickets por ítem, QR únicos y conserva precio histórico', async () => {
    const purchase = await reserve({ items: [{ ticketTypeId: '2', quantity: 3 }, { ticketTypeId: '1', quantity: 2 }] });
    await db.rows('UPDATE ticket_types SET price = 999.99');
    const response = await transition(purchase.id, 'confirm').expect(200);
    assert.equal(response.body.data.status, 'CONFIRMED');
    assert.equal(response.body.data.total, '51.25');
    const rows = await tickets();
    assert.equal(rows.length, 5);
    assert.equal(new Set(rows.map(row => row.qr_token)).size, 5);
    for (const row of rows) { assert.match(row.qr_token, /^[a-f0-9]{64}$/); assert.equal(row.status, 'ACTIVE'); }
    for (const item of purchase.items) assert.equal(rows.filter(row => row.purchase_item_id === item.id).length, item.quantity);
    await error(transition(purchase.id, 'confirm'), 409, 'INVALID_STATE');
    assert.equal((await tickets()).length, 5);
});

test('confirmación rechaza concierto cancelado y no deja tickets ni estado parcial', async () => {
    const purchase = await reserve();
    await db.rows("UPDATE concerts SET status_id = (SELECT id FROM concert_statuses WHERE code = 'CANCELLED') WHERE id = 1");
    await error(transition(purchase.id, 'confirm'), 409, 'CONCERT_NOT_PUBLISHED');
    assert.equal((await tickets()).length, 0);
    assert.equal((await call('get', `/purchases/${purchase.id}`).expect(200)).body.data.status, 'RESERVED');
});

test('tickets propios incluyen concierto/fecha/venue y token; ajenos ocultos salvo Admin', async () => {
    const result = await confirmed(input(1));
    const ticket = result.tickets[0];
    const response = await call('get', `/tickets/${ticket.id}`).expect(200);
    assert.equal(response.body.data.concert_name, 'Concierto 1');
    assert.equal(response.body.data.venue_name, 'Estadio');
    assert.ok(response.body.data.start_datetime);
    assert.equal(response.body.data.user_id, undefined);
    assert.equal(response.body.data.used_by_user_id, undefined);
    assert.equal(response.headers['cache-control'], 'no-store');
    for (const role of ['other', 'organizer', 'staff']) {
        await call('get', `/tickets/${ticket.id}`, role).expect(404);
        assert.equal((await tickets(role)).length, 0);
    }
    await call('get', `/tickets/${ticket.id}`, 'admin').expect(200);
});

test('Staff asignado valida QR, persiste USED/validador/fecha y rechaza segundo escaneo', async () => {
    const { tickets: [ticket] } = await confirmed(input(1));
    const response = await scan(ticket.qr_token).expect(200);
    assert.deepEqual(response.body.data, { result: 'VALID', ticket_id: ticket.id, concert_id: '1', status: 'USED' });
    const [row] = await db.rows('SELECT t.used_at, t.used_by_user_id, ts.code FROM tickets t JOIN ticket_statuses ts ON ts.id = t.status_id WHERE t.id = ?', [ticket.id]);
    assert.equal(row.code, 'USED');
    assert.equal(String(row.used_by_user_id), ids.staff);
    assert.ok(row.used_at);
    await error(scan(ticket.qr_token), 409, 'ALREADY_USED');
});

test('Staff no asignado y Organizer/User no pueden validar; Admin tiene acceso global', async () => {
    const { tickets: [ticket] } = await confirmed(input(1));
    await error(scan(ticket.qr_token, 'unassigned'), 403, 'STAFF_NOT_ASSIGNED');
    for (const role of ['user', 'organizer']) await error(scan(ticket.qr_token, role), 403, 'FORBIDDEN');
    await db.rows('DELETE FROM staff_assignments WHERE user_id = ?', [ids.staff]);
    await error(scan(ticket.qr_token), 403, 'STAFF_NOT_ASSIGNED');
    await scan(ticket.qr_token, 'admin').expect(200);
});

test('QR inexistente, malformado o de otro concierto no consume entrada ni expone datos', async () => {
    const { tickets: [ticket] } = await confirmed(input(1));
    await error(scan('0'.repeat(64)), 404, 'INVALID');
    await scan('1').expect(422);
    await scan(ticket.qr_token.toUpperCase()).expect(422);
    await error(scan(ticket.qr_token, 'admin', '2'), 409, 'WRONG_CONCERT');
    await scan(ticket.qr_token).expect(200);
});

test('entrada cancelada y concierto cancelado rechazan QR', async () => {
    const { tickets: [ticket] } = await confirmed(input(1));
    await db.rows("UPDATE tickets SET status_id = (SELECT id FROM ticket_statuses WHERE code = 'CANCELLED') WHERE id = ?", [ticket.id]);
    await error(scan(ticket.qr_token), 409, 'CANCELLED');
    await db.rows("UPDATE tickets SET status_id = (SELECT id FROM ticket_statuses WHERE code = 'ACTIVE') WHERE id = ?", [ticket.id]);
    await db.rows("UPDATE concerts SET status_id = (SELECT id FROM concert_statuses WHERE code = 'CANCELLED') WHERE id = 1");
    await error(scan(ticket.qr_token), 409, 'CANCELLED');
});

test('cancelar reserva libera stock y conserva historial; no admite confirmación posterior', async () => {
    const purchase = await reserve(input(4));
    assert.equal((await transition(purchase.id, 'cancel').expect(200)).body.data.status, 'CANCELLED');
    await reserve(input(4));
    await error(transition(purchase.id, 'confirm'), 409, 'INVALID_STATE');
    await error(transition(purchase.id, 'cancel'), 409, 'INVALID_STATE');
    assert.equal((await db.rows('SELECT id FROM purchase_items WHERE purchase_id = ?', [purchase.id])).length, 1);
});

test('cancelar confirmada simula REFUNDED y desactiva todos sus QR dentro de la transacción', async () => {
    const { purchase, tickets: issued } = await confirmed(input(4));
    assert.equal((await transition(purchase.id, 'cancel').expect(200)).body.data.status, 'REFUNDED');
    for (const ticket of await tickets()) assert.equal(ticket.status, 'REFUNDED');
    for (const ticket of issued) await error(scan(ticket.qr_token), 409, 'CANCELLED');
    await reserve(input(4));
    await error(transition(purchase.id, 'confirm'), 409, 'INVALID_STATE');
});

test('no se cancela compra con ticket utilizado ni después de iniciar concierto', async () => {
    const { purchase, tickets: [ticket] } = await confirmed();
    await scan(ticket.qr_token).expect(200);
    await error(transition(purchase.id, 'cancel', 'admin'), 409, 'TICKET_ALREADY_USED');
    const other = await reserve(input(1)); await transition(other.id, 'confirm').expect(200);
    await db.rows('UPDATE concerts SET start_datetime = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE id = 1');
    await error(transition(other.id, 'cancel'), 409, 'CANCELLATION_CLOSED');
});

test('concurrencia MySQL: diez reservas simultáneas no sobrepasan stock', async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, () => call('post', '/purchases', 'user', input(1))));
    assert.equal(responses.filter(response => response.status === 201).length, 5);
    for (const response of responses.filter(response => response.status !== 201)) {
        assert.equal(response.status, 409, JSON.stringify(response.body));
        assert.equal(response.body.error.code, 'INSUFFICIENT_STOCK');
    }
    assert.equal(Number((await db.rows('SELECT SUM(quantity) AS quantity FROM purchase_items'))[0].quantity), 5);
});

test('concurrencia MySQL: orden inverso de tipos usa bloqueos ascendentes y no deadlock', async () => {
    await db.rows('UPDATE ticket_types SET stock_total = 1 WHERE id IN (1, 2)');
    const responses = await Promise.all([
        call('post', '/purchases', 'user', { items: [{ ticketTypeId: '2', quantity: 1 }, { ticketTypeId: '1', quantity: 1 }] }),
        call('post', '/purchases', 'other', { items: [{ ticketTypeId: '1', quantity: 1 }, { ticketTypeId: '2', quantity: 1 }] }),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
});

test('concurrencia MySQL: confirmar dos veces genera tickets una sola vez', async () => {
    const purchase = await reserve(input(3));
    const responses = await Promise.all([transition(purchase.id, 'confirm'), transition(purchase.id, 'confirm')]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal((await tickets()).length, 3);
});

test('concurrencia MySQL: dos escaneos del mismo QR solo producen un VALID', async () => {
    const { tickets: [ticket] } = await confirmed(input(1));
    const responses = await Promise.all([scan(ticket.qr_token), scan(ticket.qr_token, 'admin')]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(responses.find(response => response.status === 409).body.error.code, 'ALREADY_USED');
});

test('concurrencia MySQL: cancelación frente a escaneo preserva compra/ticket coherentes', async () => {
    const { purchase, tickets: [ticket] } = await confirmed(input(1));
    const responses = await Promise.all([transition(purchase.id, 'cancel'), scan(ticket.qr_token)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const result = (await call('get', `/purchases/${purchase.id}`).expect(200)).body.data;
    const [stored] = await tickets();
    assert.ok((result.status === 'REFUNDED' && stored.status === 'REFUNDED') || (result.status === 'CONFIRMED' && stored.status === 'USED'));
});

test('rollback real: error al insertar segundo ítem no deja compra parcial', async t => {
    const original = CommerceRepository.prototype.addItem;
    let count = 0;
    t.mock.method(CommerceRepository.prototype, 'addItem', async function (...args) {
        if (++count === 2) throw new Error('forced item failure');
        return original.apply(this, args);
    });
    const service = new CommerceService(db.db);
    await assert.rejects(service.create({ items: [...input(1, '1').items, ...input(1, '2').items] }, { id: ids.user, roles: ['USER'] }), /forced item failure/);
    assert.equal((await db.rows('SELECT id FROM purchases')).length, 0);
    assert.equal((await db.rows('SELECT id FROM purchase_items')).length, 0);
});

test('rollback real: error generando segundo ticket revierte tickets y CONFIRMED', async t => {
    const purchase = await reserve();
    const original = CommerceRepository.prototype.addTicket;
    let count = 0;
    t.mock.method(CommerceRepository.prototype, 'addTicket', async function (...args) {
        if (++count === 2) throw new Error('forced ticket failure');
        return original.apply(this, args);
    });
    const service = new CommerceService(db.db);
    await assert.rejects(service.transition(purchase.id, 'confirm', { id: ids.user, roles: ['USER'] }), /forced ticket failure/);
    assert.equal((await tickets()).length, 0);
    assert.equal((await call('get', `/purchases/${purchase.id}`).expect(200)).body.data.status, 'RESERVED');
});

test('rollback real: error al cancelar compra revierte también la invalidación de tickets', async t => {
    const { purchase } = await confirmed();
    t.mock.method(CommerceRepository.prototype, 'setPurchaseStatus', async () => { throw new Error('forced cancel failure'); });
    const service = new CommerceService(db.db);
    await assert.rejects(service.transition(purchase.id, 'cancel', { id: ids.user, roles: ['USER'] }), /forced cancel failure/);
    assert.equal((await call('get', `/purchases/${purchase.id}`).expect(200)).body.data.status, 'CONFIRMED');
    for (const ticket of await tickets()) assert.equal(ticket.status, 'ACTIVE');
});
