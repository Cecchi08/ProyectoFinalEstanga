import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';
import { MarketplaceRepository } from '../src/repositories/marketplace.repository.ts';

const db = new TestDatabase();
let ctx, venues;
const ids = { provider: '201', customer: '203', admin: '206' };
const roles = { provider: ['VENUE', 'ORGANIZADOR'], customer: ['ARTISTA'], admin: ['ADMIN'] };
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};
const base = Math.ceil(Date.now() / 3600000) * 3600000 + 10 * 86400000;
const at = hours => new Date(base + hours * 3600000).toISOString().replace('.000Z', 'Z');
const reserve = (venue, from, to) => call('post', '/marketplace/reservations', 'customer', { venue_id: venue, event_name: 'Ensayo', event_start_at: at(from), event_end_at: at(to) });

// Mismo aprovisionamiento que marketplace.test.js: espacio publicado de un establecimiento aprobado.
async function provision() {
    const org = (await call('post', '/marketplace/organizations', 'provider', { name: 'Sala Sur SRL', tax_id: '30-71234568-9' }).expect(201)).body.data;
    const establishment = (await call('post', '/marketplace/establishments', 'provider', { organization_id: org.id, city_id: '1', name: 'Complejo Sur', address_line: 'Av. Colón 999' }).expect(201)).body.data;
    const room = (await call('post', `/marketplace/establishments/${establishment.id}/venues`, 'provider', {
        venue_type_code: 'REHEARSAL_ROOM', name: 'Sala B', capacity_standing: 40, price_per_hour: 1500.5, min_booking_minutes: 120, hold_minutes: 15,
        opening_hours: [{ day_of_week: 1, opens_at: '10:00', closes_at: '23:00' }] }).expect(201)).body.data;
    await call('post', `/marketplace/venues/${room.id}/publish`, 'provider').expect(200);
    await call('post', `/marketplace/establishments/${establishment.id}/publish`, 'provider').expect(200);
    await call('post', `/marketplace/establishments/${establishment.id}/approve`, 'admin').expect(200);
    return room.id;
}

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, name, 'Test', `${name}@rollback.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
    venues = await provision();
});

// Regresión: el HOLD se confirma en el procedimiento antes de notificar. Si la notificación falla,
// la solicitud responde error y la franja no puede quedar bloqueada por una reserva que el cliente no vio.
test('rollback de reserva: si falla la notificación tras crear el HOLD, no queda reserva activa ni franja bloqueada', async () => {
    await db.pool.query(`CREATE TRIGGER tmp_fail_notif BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo simulado'`);
    try {
        const failed = await reserve(venues, 2, 4);
        assert.ok(failed.status >= 500, `status ${failed.status}`);
    } finally {
        await db.pool.query('DROP TRIGGER tmp_fail_notif');
    }
    const active = await db.rows("SELECT id, status_code FROM reservations WHERE venue_id = ? AND status_code IN ('HOLD', 'CONFIRMED')", [venues]);
    assert.equal(active.length, 0, `reservas activas huérfanas: ${JSON.stringify(active)}`);
    const retry = await reserve(venues, 2, 4);
    assert.equal(retry.status, 201, JSON.stringify(retry.body));
});

const pay = id => call('post', `/marketplace/reservations/${id}/payments`, 'customer', { outcome: 'APPROVED' });
const approvedPayments = async id => (await db.rows("SELECT id FROM payments WHERE reservation_id = ? AND status = 'APPROVED'", [id])).length;

// Regresión: el pago simulado ya quedó registrado; un fallo posterior de la notificación no puede responder un error
// que invite a pagar de nuevo. La respuesta es éxito, el fallo queda registrado y no hay un segundo pago.
test('pago aprobado con fallo persistente de notificación: responde éxito, registra el fallo y no permite pagar dos veces', async t => {
    const errors = t.mock.method(console, 'error', () => undefined);
    const reservation = (await reserve(venues, 2, 4).expect(201)).body.data;
    await db.pool.query(`CREATE TRIGGER tmp_fail_pay_notif BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo simulado'`);
    let paid;
    try {
        paid = await pay(reservation.id);
    } finally {
        await db.pool.query('DROP TRIGGER tmp_fail_pay_notif');
    }
    assert.equal(paid.status, 201, JSON.stringify(paid.body));
    assert.equal(paid.body.data.payment.status, 'APPROVED');
    assert.equal(paid.body.data.notification_failed, true);
    assert.equal(await approvedPayments(reservation.id), 1);
    const logged = errors.mock.calls.map(call => call.arguments.join(' '));
    assert.ok(logged.some(line => line.includes('[NOTIFICATION_FAILED]') && line.includes(`Reserva ${reservation.id}`)), JSON.stringify(logged));
    const retry = await pay(reservation.id);
    assert.ok(retry.status >= 400 && retry.status < 500, `segundo pago -> ${retry.status}`);
    assert.equal(await approvedPayments(reservation.id), 1, 'no hay pago duplicado');
});

test('pago aprobado con fallo transitorio de notificación: el reintento independiente entrega un solo aviso', async t => {
    const reservation = (await reserve(venues, 2, 4).expect(201)).body.data;
    const original = MarketplaceRepository.prototype.notifyProviders;
    let calls = 0;
    t.mock.method(MarketplaceRepository.prototype, 'notifyProviders', async function (...args) {
        if (++calls === 1) throw new Error('fallo transitorio');
        return original.apply(this, args);
    });
    const paid = await pay(reservation.id).expect(201);
    assert.equal(paid.body.data.notification_failed, false);
    assert.equal(calls, 2);
    const notices = await db.rows("SELECT id FROM notifications WHERE reservation_id = ? AND title LIKE 'Reserva pagada%'", [reservation.id]);
    assert.equal(notices.length, 1);
    assert.equal(await approvedPayments(reservation.id), 1);
});
