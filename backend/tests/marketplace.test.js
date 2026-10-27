import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';

const db = new TestDatabase();
let ctx, venues;
const ids = { provider: '101', rival: '102', customer: '103', other: '104', guest: '105', admin: '106', buyer: '107' };
// Providers run spaces (VENUE) and also organize and book; 'customer'/'other' are artists booking rooms; 'buyer' only buys tickets.
const roles = { provider: ['VENUE', 'ORGANIZADOR'], rival: ['VENUE', 'ORGANIZADOR'], customer: ['ARTISTA'], other: ['ARTISTA'],
    guest: ['GUEST'], admin: ['ADMIN'], buyer: ['COMPRADOR'] };
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};
async function error(response, status, code) {
    const result = await response;
    assert.equal(result.status, status, JSON.stringify(result.body));
    assert.equal(result.body.error.code, code);
    return result.body;
}
// Slots on whole hours, ten days ahead.
const base = Math.ceil(Date.now() / 3600000) * 3600000 + 10 * 86400000;
const at = hours => new Date(base + hours * 3600000).toISOString().replace('.000Z', 'Z');
const slot = (from, to, extra = {}) => ({ event_name: 'Ensayo general', event_start_at: at(from), event_end_at: at(to), ...extra });
const reserve = (venue, from, to, extra = {}, role = 'customer') => call('post', '/marketplace/reservations', role, { venue_id: venue, ...slot(from, to), ...extra });
const held = async (...args) => { const response = await reserve(...args); assert.equal(response.status, 201, JSON.stringify(response.body)); return response.body.data; };

// Seeded catalogs: city 1 = Mar del Plata (marketplace), districts/provinces of Buenos Aires.
async function provision() {
    const org = (await call('post', '/marketplace/organizations', 'provider', { name: 'Sala Norte SRL', tax_id: '30-71234567-9' }).expect(201)).body.data;
    const establishment = (await call('post', '/marketplace/establishments', 'provider', {
        organization_id: org.id, city_id: '1', name: 'Complejo Norte', address_line: 'Av. Colón 1234' }).expect(201)).body.data;
    const room = (await call('post', `/marketplace/establishments/${establishment.id}/venues`, 'provider', {
        venue_type_code: 'REHEARSAL_ROOM', name: 'Sala A', capacity_standing: 40, price_per_hour: 1500.5, min_booking_minutes: 120, hold_minutes: 30,
        amenities: ['PA_SYSTEM', 'BACKLINE'], photos: [{ url: 'https://img.example/a.jpg', is_cover: true }],
        opening_hours: [{ day_of_week: 1, opens_at: '10:00', closes_at: '23:00' }] }).expect(201)).body.data;
    const hall = (await call('post', `/marketplace/establishments/${establishment.id}/venues`, 'provider', {
        venue_type_code: 'CONCERT_HALL', name: 'Sala Grande', capacity_standing: 400, capacity_seated: 250, price_per_hour: 20000, amenities: ['STAGE'] }).expect(201)).body.data;
    for (const venue of [room, hall]) await call('post', `/marketplace/venues/${venue.id}/publish`, 'provider').expect(200);
    await call('post', `/marketplace/establishments/${establishment.id}/publish`, 'provider').expect(200);
    return { org, establishment, room: room.id, hall: hall.id };
}

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, name, 'Test', `${name}@market.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
    venues = await provision();
});

test('catálogos públicos: ciudades del marketplace, tipos, comodidades y modalidades', async () => {
    const cities = (await call('get', '/marketplace/cities').expect(200)).body.data;
    assert.deepEqual(cities.map(city => city.name), ['Mar del Plata', 'Batan', 'Sierra de los Padres', 'Estacion Chapadmalal']);
    const catalogs = (await call('get', '/marketplace/catalogs').expect(200)).body.data;
    assert.equal(catalogs.venue_types.length, 8); assert.equal(catalogs.amenities.length, 12);
    assert.deepEqual(catalogs.occupancy_modes.map(mode => [mode.code, mode.is_exclusive]), [['VENUE', false], ['ESTABLISHMENT', true]]);
});

test('búsqueda: solo publicados y filtros por ciudad, tipo, comodidades, capacidad, precio y texto', async () => {
    const search = async query => (await call('get', `/marketplace/venues?${query}`).expect(200)).body.data.map(venue => venue.id);
    assert.deepEqual(await search(''), [venues.room, venues.hall]);
    assert.deepEqual(await search('city_id=1&venue_type=REHEARSAL_ROOM'), [venues.room]);
    assert.deepEqual(await search('amenities=PA_SYSTEM,BACKLINE'), [venues.room]);
    assert.deepEqual(await search('amenities=PA_SYSTEM,STAGE'), []);
    assert.deepEqual(await search('min_capacity=100'), [venues.hall]);
    assert.deepEqual(await search('max_price=1500.50'), [venues.room]);
    assert.deepEqual(await search('q=Grande'), [venues.hall]);
    assert.deepEqual(await search('city_id=2'), []);
    for (const query of ['available_from=2030-01-01T10:00:00Z', 'amenities=pa', 'limit=0', 'unknown=1']) await call('get', `/marketplace/venues?${query}`).expect(422);
    // Archiving the establishment hides every space, including direct links for the public.
    await call('post', `/marketplace/establishments/${venues.establishment.id}/archive`, 'provider').expect(200);
    assert.deepEqual(await search(''), []);
    await call('get', `/marketplace/venues/${venues.room}`).expect(404);
    await call('get', `/marketplace/venues/${venues.room}`, 'provider').expect(200);
    await call('get', `/marketplace/venues/${venues.room}`, 'rival').expect(404);
});

test('detalle público con comodidades, fotos y horarios; /venues sigue como alias', async () => {
    const detail = (await call('get', `/marketplace/venues/${venues.room}`).expect(200)).body.data;
    assert.deepEqual(detail.amenities.map(a => a.code).sort(), ['BACKLINE', 'PA_SYSTEM']);
    assert.equal(detail.cover_url, 'https://img.example/a.jpg'); assert.equal(detail.photos[0].is_cover, true);
    assert.deepEqual(detail.opening_hours, [{ day_of_week: 1, opens_at: '10:00', closes_at: '23:00' }]);
    assert.equal(detail.price_per_hour, '1500.50'); assert.equal(detail.city_name, 'Mar del Plata');
    assert.equal((await call('get', `/venues/${venues.room}`).expect(200)).body.data.id, venues.room);
});

test('gestión: solo organizadores miembros editan; ciudad fuera del marketplace y datos inválidos se rechazan', async () => {
    await call('post', '/marketplace/organizations', 'customer', { name: 'X' }).expect(403);
    await call('patch', `/marketplace/venues/${venues.room}`, 'rival', { price_per_hour: 1 }).expect(403);
    await call('patch', `/marketplace/venues/${venues.room}`, 'admin', { price_per_hour: 1600 }).expect(200);
    const org = (await call('post', '/marketplace/organizations', 'rival', { name: 'Rival' }).expect(201)).body.data;
    const batanOutside = (await db.rows("SELECT id FROM cities WHERE name = 'Batan'"))[0].id;
    await db.rows('UPDATE marketplace_cities SET is_active = 0 WHERE city_id = ?', [batanOutside]);
    await error(call('post', '/marketplace/establishments', 'rival', { organization_id: org.id, city_id: String(batanOutside), name: 'Otro', address_line: 'Calle 1' }), 422, 'CITY_NOT_IN_MARKETPLACE');
    await error(call('post', '/marketplace/establishments', 'rival', { organization_id: venues.org.id, city_id: '1', name: 'Ajeno', address_line: 'Calle 1' }), 403, 'FORBIDDEN');
    await error(call('patch', `/marketplace/venues/${venues.room}`, 'provider', { amenities: ['JACUZZI'] }), 422, 'UNKNOWN_AMENITY');
    await error(call('patch', `/marketplace/venues/${venues.room}`, 'provider', { venue_type_code: 'SPACESHIP' }), 422, 'UNKNOWN_VENUE_TYPE');
    await call('patch', `/marketplace/venues/${venues.room}`, 'provider', { hold_minutes: 1 }).expect(422);
    await error(call('post', `/marketplace/establishments/${venues.establishment.id}/venues`, 'provider', { venue_type_code: 'BAR_STAGE', name: 'Sala A', price_per_hour: 1 }), 409, 'DUPLICATE_RESOURCE');
    assert.equal((await call('get', '/marketplace/organizations/mine', 'provider').expect(200)).body.data[0].member_role, 'OWNER');
    await call('post', `/marketplace/venues/${venues.hall}/archive`, 'provider').expect(200);
    const own = (await call('get', `/marketplace/establishments/${venues.establishment.id}/venues`, 'provider').expect(200)).body.data;
    assert.deepEqual(own.map(v => [v.name, v.status]), [['Sala A', 'PUBLISHED'], ['Sala Grande', 'ARCHIVED']]);
    await call('get', `/marketplace/establishments/${venues.establishment.id}/venues`, 'rival').expect(403);
});

test('miembros: OWNER/ADMIN gestionan, solo un OWNER toca OWNER y siempre queda uno', async () => {
    const path = `/marketplace/organizations/${venues.org.id}/members`;
    await error(call('post', path, 'provider', { email: 'customer@market.example' }), 422, 'MEMBER_NOT_VENUE');
    await error(call('post', path, 'provider', { email: 'nadie@market.example' }), 422, 'INVALID_MEMBER');
    await call('post', path, 'rival', { email: 'rival@market.example' }).expect(403);
    const added = (await call('post', path, 'provider', { email: 'rival@market.example', member_role: 'ADMIN' }).expect(201)).body.data;
    assert.deepEqual(added.map(m => [m.user_id, m.member_role]), [[ids.provider, 'OWNER'], [ids.rival, 'ADMIN']]);
    await error(call('post', path, 'provider', { email: 'rival@market.example' }), 409, 'ALREADY_MEMBER');
    // The new ADMIN member operates the organization's spaces.
    await call('patch', `/marketplace/venues/${venues.room}`, 'rival', { price_per_hour: 1700 }).expect(200);
    await error(call('patch', `${path}/${ids.provider}`, 'rival', { member_role: 'STAFF' }), 403, 'FORBIDDEN');
    await error(call('patch', `${path}/${ids.rival}`, 'rival', { member_role: 'OWNER' }), 403, 'FORBIDDEN');
    await error(call('patch', `${path}/${ids.provider}`, 'provider', { member_role: 'ADMIN' }), 409, 'LAST_OWNER');
    await error(call('delete', `${path}/${ids.provider}`, 'provider'), 409, 'LAST_OWNER');
    await call('patch', `${path}/${ids.rival}`, 'provider', { member_role: 'OWNER' }).expect(200);
    await call('patch', `${path}/${ids.provider}`, 'provider', { member_role: 'STAFF' }).expect(200);
    // A STAFF member reads the organization but no longer manages it.
    assert.equal((await call('get', path, 'provider').expect(200)).body.data.length, 2);
    await call('patch', `/marketplace/venues/${venues.room}`, 'provider', { price_per_hour: 1 }).expect(403);
    await call('patch', `${path}/${ids.rival}`, 'rival', { member_role: 'BOSS' }).expect(422);
    await call('delete', `${path}/${ids.provider}`, 'provider').expect(204);
    await call('get', path, 'provider').expect(403);
    await call('get', path, 'customer').expect(403);
});

test('reserva directa: HOLD con total al precio de lista y tramos de armado/evento/desarme', async () => {
    const reservation = await held(venues.room, 2, 4, { setup_start_at: at(1), teardown_end_at: at(5), expected_attendance: 30, notes: 'Traemos batería' });
    assert.equal(reservation.status, 'HOLD'); assert.equal(reservation.user_id, ids.customer);
    assert.match(reservation.public_code, /^R-[0-9A-F]{12}$/);
    assert.equal(reservation.total_amount, '6002.00');
    assert.equal(reservation.notes, 'Traemos batería');
    assert.ok(new Date(reservation.hold_expires_at) > new Date() && new Date(reservation.hold_expires_at) <= new Date(Date.now() + 31 * 60000));
    assert.deepEqual(reservation.occupancies.map(o => o.phase), ['SETUP', 'EVENT', 'TEARDOWN']);
    assert.deepEqual(reservation.history.map(h => [h.from_status, h.to_status, h.changed_by_user_id]), [[null, 'HOLD', ids.customer]]);
    assert.deepEqual(reservation.payments, []);
    const notices = await db.rows("SELECT user_id FROM notifications WHERE type = 'RESERVATION_UPDATE' AND reservation_id = ?", [reservation.id]);
    assert.deepEqual(notices.map(n => String(n.user_id)), [ids.provider]);
});

test('reserva directa: validaciones de franja, capacidad, mínimo, modalidad y rol', async () => {
    await error(reserve(venues.room, 2, 3), 422, 'BELOW_MIN_BOOKING');
    await error(reserve(venues.room, 2, 4, { expected_attendance: 41 }), 422, 'OVER_CAPACITY');
    await error(reserve(venues.room, 2, 4, { occupancy_mode: 'ESTABLISHMENT' }), 422, 'QUOTE_REQUIRED');
    await error(reserve(venues.room, -300, -290), 422, 'INVALID_DATE');
    await reserve(venues.room, 4, 2).expect(422);
    await call('post', '/marketplace/reservations', 'customer', { venue_id: venues.room, ...slot(2, 4), event_start_at: at(2).replace('00:00Z', '00:30Z') }).expect(422);
    await call('post', '/marketplace/reservations', 'customer', { venue_id: venues.room, ...slot(2, 4), status_code: 'CONFIRMED' }).expect(422);
    await reserve(venues.room, 2, 4, {}, 'guest').expect(403);
    // A buyer-only profile browses spaces but cannot book or request quotes.
    await reserve(venues.room, 2, 4, {}, 'buyer').expect(403);
    await call('post', '/marketplace/quotes', 'buyer', { venue_id: venues.room, ...slot(2, 4) }).expect(403);
    await call('get', '/marketplace/venues', 'buyer').expect(200);
    await reserve(venues.room, 2, 4, {}, null).expect(401);
    await call('post', `/marketplace/venues/${venues.room}/archive`, 'provider').expect(200);
    await reserve(venues.room, 2, 4).expect(404);
});

test('choques de horario: el mismo espacio se superpone, otro espacio del establecimiento queda libre', async () => {
    await held(venues.room, 2, 5);
    await error(reserve(venues.room, 4, 6, {}, 'other'), 409, 'SLOT_CONFLICT');
    await error(reserve(venues.room, 1, 3, { setup_start_at: at(0) }, 'other'), 409, 'SLOT_CONFLICT');
    await held(venues.room, 5, 7, {}, 'other');
    await held(venues.hall, 2, 5, {}, 'other');
    const day = (await call('get', `/marketplace/venues/${venues.room}/availability?from=${at(0)}&to=${at(8)}`).expect(200)).body.data;
    assert.equal(day.available, false);
    assert.deepEqual(day.busy.map(b => [b.source, b.phase, b.scope]), [['RESERVATION', 'EVENT', 'VENUE'], ['RESERVATION', 'EVENT', 'VENUE']]);
    assert.equal(JSON.stringify(day).includes(ids.customer), false);
    assert.equal((await call('get', `/marketplace/venues/${venues.room}/availability?from=${at(8)}&to=${at(10)}`).expect(200)).body.data.available, true);
    const whole = (await call('get', `/marketplace/venues/${venues.room}/availability?from=${at(0)}&to=${at(8)}&mode=ESTABLISHMENT`).expect(200)).body.data;
    assert.equal(whole.busy.length, 3);
    const free = (await call('get', `/marketplace/venues?available_from=${at(2)}&available_to=${at(4)}`).expect(200)).body.data;
    assert.deepEqual(free, []);
    assert.deepEqual((await call('get', `/marketplace/venues?available_from=${at(8)}&available_to=${at(9)}&mode=ESTABLISHMENT`).expect(200)).body.data.map(v => v.id), [venues.room, venues.hall]);
    const date = new Date(base + 2 * 3600000).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    assert.ok((await call('get', `/marketplace/venues/${venues.room}/availability?date=${date}`).expect(200)).body.data.busy.length >= 1);
    for (const query of [`from=${at(0)}`, `date=${date}&from=${at(0)}&to=${at(1)}`, `from=${at(0)}&to=${at(24 * 40)}`]) await call('get', `/marketplace/venues/${venues.room}/availability?${query}`).expect(422);
});

test('pago simulado: no acepta datos de tarjeta; rechazado mantiene HOLD, aprobado espera al espacio, que confirma una sola vez', async () => {
    const reservation = await held(venues.room, 2, 4);
    const pay = (body, role = 'customer') => call('post', `/marketplace/reservations/${reservation.id}/payments`, role, body);
    for (const body of [{ card_number: '4111111111111111' }, { outcome: 'APPROVED', cvv: '123' }, { outcome: 'MAYBE' }, { amount: 1 }]) await pay(body).expect(422);
    await error(pay({}, 'other'), 404, 'NOT_FOUND');
    await error(pay({}, 'provider'), 403, 'FORBIDDEN');
    const rejected = (await pay({ outcome: 'REJECTED' }).expect(201)).body.data;
    assert.equal(rejected.simulated, true); assert.match(rejected.notice, /simulado/);
    assert.deepEqual([rejected.payment.status, rejected.payment.provider, rejected.payment.is_simulated], ['REJECTED', 'SIMULATED', true]);
    assert.equal(rejected.reservation.status, 'HOLD');
    const approved = (await pay({}).expect(201)).body.data;
    assert.deepEqual([approved.payment.status, approved.payment.amount], ['APPROVED', '3001.00']);
    assert.match(approved.payment.simulated_reference, /^SIM-[0-9A-F]{16}$/);
    // A direct booking (no quote) stays HOLD once paid: the venue's acceptance confirms it.
    assert.equal(approved.reservation.status, 'HOLD');
    const accepted = (await call('post', `/marketplace/reservations/${reservation.id}/accept`, 'provider').expect(200)).body.data;
    assert.equal(accepted.status, 'CONFIRMED'); assert.ok(accepted.confirmed_at);
    assert.deepEqual(accepted.history.map(h => [h.to_status, h.changed_by_user_id]), [['HOLD', ids.customer], ['CONFIRMED', ids.provider]]);
    await error(pay({}), 409, 'INVALID_STATUS');
    const stored = await db.rows('SELECT * FROM payments WHERE reservation_id = ?', [reservation.id]);
    assert.equal(stored.length, 2);
    assert.ok(stored.every(row => Number(row.is_simulated) === 1 && !Object.keys(row).some(key => /card|cvv|pan|token/i.test(key))));
});

test('HOLD vencido: libera la franja sin evento programado, no se paga y se persiste EXPIRED', async () => {
    const reservation = await held(venues.room, 2, 4);
    await db.rows('UPDATE reservations SET hold_expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE id = ?', [reservation.id]);
    assert.equal((await call('get', `/marketplace/reservations/${reservation.id}`, 'customer').expect(200)).body.data.status, 'EXPIRED');
    await held(venues.room, 2, 4, {}, 'other');
    await error(call('post', `/marketplace/reservations/${reservation.id}/payments`, 'customer', {}), 409, 'HOLD_EXPIRED');
    const [row] = await db.rows('SELECT status_code, expired_at FROM reservations WHERE id = ?', [reservation.id]);
    assert.equal(row.status_code, 'EXPIRED'); assert.ok(row.expired_at);
    assert.equal((await db.rows('SELECT id FROM payments WHERE reservation_id = ?', [reservation.id])).length, 0);
});

test('cancelar: cliente o proveedor; confirmada reembolsa el pago simulado y libera la franja', async () => {
    const own = await held(venues.room, 2, 4);
    await call('post', `/marketplace/reservations/${own.id}/payments`, 'customer', {}).expect(201);
    await call('post', `/marketplace/reservations/${own.id}/cancel`, 'other', {}).expect(404);
    await call('post', `/marketplace/reservations/${own.id}/cancel`, 'customer', { reason: 'x'.repeat(256) }).expect(422);
    const cancelled = (await call('post', `/marketplace/reservations/${own.id}/cancel`, 'customer', { reason: 'Se suspendió la banda' }).expect(200)).body.data;
    assert.deepEqual([cancelled.status, cancelled.cancelled_by_user_id, cancelled.cancellation_reason], ['CANCELLED', ids.customer, 'Se suspendió la banda']);
    assert.equal(cancelled.payments[0].status, 'REFUNDED');
    await error(call('post', `/marketplace/reservations/${own.id}/cancel`, 'customer', {}), 409, 'INVALID_STATE');
    const next = await held(venues.room, 2, 4, {}, 'other');
    const byProvider = (await call('post', `/marketplace/reservations/${next.id}/cancel`, 'provider', {}).expect(200)).body.data;
    assert.equal(byProvider.history.at(-1).changed_by_user_id, ids.provider);
    assert.equal((await db.rows("SELECT id FROM notifications WHERE user_id = ? AND type = 'RESERVATION_UPDATE'", [ids.other])).length, 1);
    const listed = (await call('get', '/marketplace/reservations?as=provider&status=CANCELLED', 'provider').expect(200)).body;
    assert.equal(listed.pagination.total, 2);
    await call('get', '/marketplace/reservations?as=provider', 'customer').expect(403);
    assert.equal((await call('get', '/marketplace/reservations?as=provider', 'rival').expect(200)).body.pagination.total, 0);
});

test('bloqueos del establecimiento: no pisan reservas activas y bloquean nuevas reservas', async () => {
    const reservation = await held(venues.room, 2, 4);
    const block = (body, role = 'provider') => call('post', `/marketplace/establishments/${venues.establishment.id}/blocks`, role, body);
    await error(block({ starts_at: at(3), ends_at: at(6) }), 409, 'SLOT_CONFLICT');
    await error(block({ venue_id: venues.room, starts_at: at(3), ends_at: at(6) }), 409, 'SLOT_CONFLICT');
    const hallOnly = (await block({ venue_id: venues.hall, reason: 'MAINTENANCE', starts_at: at(3), ends_at: at(6) }).expect(201)).body.data;
    await error(reserve(venues.hall, 4, 6), 409, 'SLOT_BLOCKED');
    await block({ starts_at: at(3), ends_at: at(6) }, 'rival').expect(403);
    await call('delete', `/marketplace/blocks/${hallOnly.id}`, 'provider').expect(204);
    await held(venues.hall, 4, 6);
    await call('post', `/marketplace/reservations/${reservation.id}/cancel`, 'customer', {}).expect(200);
    await block({ venue_id: venues.room, starts_at: at(2), ends_at: at(4) }).expect(201);
});

test('presupuesto: pedido, respuesta con ítems exactos, aceptación crea HOLD exclusivo con el total acordado', async () => {
    const quote = (await call('post', '/marketplace/quotes', 'customer', { venue_id: venues.hall, occupancy_mode: 'ESTABLISHMENT',
        ...slot(2, 6, { event_name: 'Festival', setup_start_at: at(0), teardown_end_at: at(7), expected_attendance: 300 }) }).expect(201)).body.data;
    assert.deepEqual([quote.status, quote.total_amount], ['REQUESTED', null]);
    await call('post', `/marketplace/quotes/${quote.id}/accept`, 'customer').expect(409);
    await call('post', `/marketplace/quotes/${quote.id}/respond`, 'rival', { items: [{ description: 'x', quantity: 1, unit_price: 1 }], valid_until: at(-1) }).expect(404);
    await call('post', `/marketplace/quotes/${quote.id}/respond`, 'provider', { items: [{ description: 'x', quantity: 1, unit_price: 1 }], valid_until: at(1) }).expect(422);
    const sent = (await call('post', `/marketplace/quotes/${quote.id}/respond`, 'provider', {
        items: [{ description: 'Alquiler completo', quantity: 7, unit_price: 20000.1 }, { description: 'Técnico', quantity: 1.5, unit_price: 0.33 }],
        fees: 100, discount: 50.25, valid_until: at(-24), provider_notes: 'Incluye limpieza' }).expect(200)).body.data;
    assert.deepEqual([sent.status, sent.subtotal, sent.total_amount], ['SENT', '140001.20', '140050.95']);
    assert.deepEqual(sent.items.map(item => item.line_total), ['140000.70', '0.50']);
    await call('get', `/marketplace/quotes/${quote.id}`, 'other').expect(404);
    await error(call('post', `/marketplace/quotes/${quote.id}/accept`, 'provider'), 403, 'FORBIDDEN');
    const accepted = (await call('post', `/marketplace/quotes/${quote.id}/accept`, 'customer').expect(201)).body.data;
    assert.deepEqual([accepted.quote.status, accepted.quote.reservation_id], ['ACCEPTED', accepted.reservation.id]);
    assert.deepEqual([accepted.reservation.status, accepted.reservation.occupancy_mode, accepted.reservation.total_amount, accepted.reservation.quote_id],
        ['HOLD', 'ESTABLISHMENT', '140050.95', quote.id]);
    // ESTABLISHMENT is exclusive: the other space of the establishment is busy too.
    await error(reserve(venues.room, 3, 5, {}, 'other'), 409, 'SLOT_CONFLICT');
    await error(call('post', `/marketplace/quotes/${quote.id}/accept`, 'customer'), 409, 'INVALID_STATE');
    const notified = await db.rows("SELECT CAST(user_id AS CHAR) AS user_id FROM notifications WHERE type = 'QUOTE_UPDATE' ORDER BY id");
    assert.deepEqual(notified.map(n => n.user_id), [ids.provider, ids.customer, ids.provider]);
});

test('presupuesto: rechazo, cancelación, vencimiento persistido y franja ocupada al aceptar', async () => {
    const ask = async (role = 'customer') => (await call('post', '/marketplace/quotes', role, { venue_id: venues.room, ...slot(2, 4) }).expect(201)).body.data;
    const respond = id => call('post', `/marketplace/quotes/${id}/respond`, 'provider', { items: [{ description: 'Sala', quantity: 2, unit_price: 1000 }], valid_until: at(-2) }).expect(200);
    const rejected = await ask();
    assert.equal((await call('post', `/marketplace/quotes/${rejected.id}/reject`, 'provider', { provider_notes: 'Sin disponibilidad' }).expect(200)).body.data.status, 'REJECTED');
    await error(call('post', `/marketplace/quotes/${rejected.id}/cancel`, 'customer'), 409, 'INVALID_STATE');
    const cancelled = await ask();
    await error(call('post', `/marketplace/quotes/${cancelled.id}/cancel`, 'other'), 404, 'NOT_FOUND');
    assert.equal((await call('post', `/marketplace/quotes/${cancelled.id}/cancel`, 'customer').expect(200)).body.data.status, 'CANCELLED');
    const expired = await ask(); await respond(expired.id);
    await db.rows('UPDATE quotes SET valid_until = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE id = ?', [expired.id]);
    assert.equal((await call('get', `/marketplace/quotes/${expired.id}`, 'customer').expect(200)).body.data.status, 'EXPIRED');
    await error(call('post', `/marketplace/quotes/${expired.id}/accept`, 'customer'), 409, 'QUOTE_EXPIRED');
    assert.equal((await db.rows('SELECT status FROM quotes WHERE id = ?', [expired.id]))[0].status, 'EXPIRED');
    const late = await ask(); await respond(late.id);
    await held(venues.room, 3, 5, {}, 'other');
    await error(call('post', `/marketplace/quotes/${late.id}/accept`, 'customer'), 409, 'SLOT_CONFLICT');
    assert.equal((await db.rows('SELECT status FROM quotes WHERE id = ?', [late.id]))[0].status, 'SENT');
    assert.equal((await call('get', '/marketplace/quotes?as=provider&status=SENT', 'provider').expect(200)).body.pagination.total, 1);
    assert.equal((await call('get', '/marketplace/quotes', 'customer').expect(200)).body.pagination.total, 4);
});

test('concurrencia MySQL: reservas simultáneas de la misma franja confirman exactamente una', async () => {
    const people = ['customer', 'other', 'provider', 'rival', 'admin'];
    const responses = await Promise.all(people.map(role => reserve(venues.room, 2, 4, {}, role)));
    assert.equal(responses.filter(r => r.status === 201).length, 1, JSON.stringify(responses.map(r => r.body)));
    for (const response of responses.filter(r => r.status !== 201)) assert.equal(response.body.error.code, 'SLOT_CONFLICT', JSON.stringify(response.body));
    assert.equal(Number((await db.rows("SELECT COUNT(*) AS total FROM reservation_occupancies WHERE phase = 'EVENT'"))[0].total), 1);
    // Different spaces in the same establishment serialize on its lock but both succeed.
    const parallel = await Promise.all([reserve(venues.room, 6, 8), reserve(venues.hall, 6, 8, {}, 'other')]);
    assert.deepEqual(parallel.map(r => r.status), [201, 201], JSON.stringify(parallel.map(r => r.body)));
});

test('concurrencia MySQL: dos pagos o pago y cancelación simultáneos dejan un estado coherente', async () => {
    const first = await held(venues.room, 2, 4);
    const payments = await Promise.all([1, 2].map(() => call('post', `/marketplace/reservations/${first.id}/payments`, 'customer', {})));
    assert.deepEqual(payments.map(r => r.status).sort(), [201, 409]);
    assert.equal((await db.rows("SELECT id FROM payments WHERE status = 'APPROVED'")).length, 1);
    const second = await held(venues.room, 6, 8);
    const race = await Promise.all([call('post', `/marketplace/reservations/${second.id}/payments`, 'customer', {}), call('post', `/marketplace/reservations/${second.id}/cancel`, 'provider', {})]);
    assert.ok(race.every(r => [200, 201, 409].includes(r.status)), JSON.stringify(race.map(r => r.body)));
    const [state] = await db.rows('SELECT status_code FROM reservations WHERE id = ?', [second.id]);
    const approved = await db.rows("SELECT status FROM payments WHERE reservation_id = ? AND status IN ('APPROVED','REFUNDED')", [second.id]);
    // Either cancelled first (no approved payment) or paid first and then cancelled with a refund.
    assert.equal(state.status_code, 'CANCELLED');
    assert.ok(approved.every(p => p.status === 'REFUNDED'));
});

test('concierto vinculado a una reserva confirmada del organizador toma el espacio y respeta la franja', async () => {
    const reservation = await held(venues.hall, 20, 26, {}, 'rival');
    const concert = (start, end, extra = {}) => call('post', '/concerts', 'rival', { name: 'Show en Sala Grande', artist_name: 'La Banda',
        start_datetime: at(start), end_datetime: at(end), reservation_id: reservation.id, genre_ids: ['1'], ...extra });
    await error(concert(21, 23), 409, 'RESERVATION_NOT_CONFIRMED');
    await call('post', `/marketplace/reservations/${reservation.id}/payments`, 'rival', {}).expect(201);
    // Paid but not yet accepted by the venue: still not confirmed.
    await error(concert(21, 23), 409, 'RESERVATION_NOT_CONFIRMED');
    await call('post', `/marketplace/reservations/${reservation.id}/accept`, 'provider').expect(200);
    await error(concert(19, 23), 422, 'OUTSIDE_RESERVATION');
    await error(concert(21, 23, { venue_id: venues.room }), 422, 'INVALID_RESERVATION');
    await error(call('post', '/concerts', 'provider', { name: 'Ajeno', artist_name: 'X', start_datetime: at(21), reservation_id: reservation.id }), 422, 'INVALID_RESERVATION');
    const created = (await concert(21, 23).expect(201)).body.data;
    assert.deepEqual([created.venue_id, created.reservation_id, created.venue_name, created.address_line, created.city_name],
        [venues.hall, reservation.id, 'Complejo Norte - Sala Grande', 'Av. Colón 1234', 'Mar del Plata']);
});
