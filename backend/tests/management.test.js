import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase } from './helpers.js';
import { ManagementRepository } from '../src/repositories/management.repository.ts';

const db = new TestDatabase();
let ctx;
const roles = { admin: ['ADMIN'], owner: ['ORGANIZER'], other: ['ORGANIZER'], user: ['USER'], staff: ['STAFF'] };
const ids = { admin: '101', owner: '102', other: '103', user: '104', staff: '105' };
const future = days => new Date(Date.now() + days * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const bearer = role => `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`;
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', bearer(role));
    return body === undefined ? req : req.send(body);
};
const input = (extra = {}) => ({ name: 'Festival VENTI', venue_id: '1', concert_type_id: '1', start_datetime: future(30),
    end_datetime: future(31), artist_ids: ['1'], genre_ids: ['1'],
    ticket_types: [{ name: 'General', price: 1500.25, stock_total: 100, sale_start: future(1), sale_end: future(29), max_per_purchase: 4 }], ...extra });
const create = async (extra = {}, role = 'owner') => (await call('post', '/concerts', role, input(extra)).expect(201)).body.data;
const publish = async id => (await call('post', `/concerts/${id}/publish`, 'owner').expect(200)).body.data;

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    for (const table of ['tickets', 'purchase_items', 'purchases', 'concerts', 'artists', 'genres', 'venues', 'cities', 'provinces', 'users']) await db.rows(`DELETE FROM ${table}`);
    ctx = db.context();
    for (const [role, userId] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [userId, role, 'Test', `${role}@test.example`]);
        await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [userId, roles[role][0]]);
    }
    for (const role of ['owner', 'other']) await db.rows('INSERT INTO organizer_profiles (user_id, display_name) VALUES (?, ?)', [ids[role], role]);
    await db.rows("INSERT INTO provinces (id, name) VALUES (1, 'Buenos Aires'), (2, 'Córdoba')");
    await db.rows("INSERT INTO cities (id, province_id, name) VALUES (1, 1, 'La Plata'), (2, 2, 'Córdoba')");
    await db.rows("INSERT INTO venues (id, city_id, name, address, capacity) VALUES (1, 1, 'Estadio', 'Calle 1', 1000), (2, 2, 'Teatro', 'Calle 2', 500)");
    await db.rows("INSERT INTO genres (id, name) VALUES (1, 'Rock'), (2, 'Jazz')");
    await db.rows("INSERT INTO artists (id, name) VALUES (1, 'Banda Uno'), (2, 'Banda Dos')");
});

test('Organizer crea borrador propio con relaciones, fechas, entradas y precios exactos', async () => {
    const concert = await create();
    assert.equal(concert.organizer_id, ids.owner);
    assert.equal(concert.status, 'DRAFT');
    assert.equal(concert.artists[0].id, '1');
    assert.equal(concert.artists[0].billing_order, 1);
    assert.equal(concert.genres[0].id, '1');
    assert.equal(concert.ticket_types[0].price, '1500.25');
    assert.equal(concert.city_id, '1');
    assert.equal(concert.province_id, '1');
});

test('crear exige autenticación y rol vigente; USER/STAFF reciben 403', async () => {
    await call('post', '/concerts', undefined, input()).expect(401);
    for (const role of ['user', 'staff']) await call('post', '/concerts', role, input()).expect(403);
    await db.rows('DELETE FROM user_roles WHERE user_id = ?', [ids.owner]);
    await db.rows("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [ids.owner]);
    await call('post', '/concerts', 'owner', input()).expect(403);
});

test('ownership nunca se acepta del Organizer; Admin puede elegir organizador válido', async () => {
    await call('post', '/concerts', 'owner', input({ organizer_id: ids.other })).expect(403);
    const concert = await create({ organizer_id: ids.other }, 'admin');
    assert.equal(concert.organizer_id, ids.other);
    await call('post', '/concerts', 'admin', input({ organizer_id: ids.user })).expect(422);
    await call('post', '/concerts', 'admin', input()).expect(422);
});

test('Organizer edita propio, no ajeno; Admin edita cualquiera; USER y STAFF no editan', async () => {
    const concert = await create();
    await call('patch', `/concerts/${concert.id}`, 'owner', { name: 'Propio' }).expect(200);
    for (const role of ['other', 'user', 'staff']) await call('patch', `/concerts/${concert.id}`, role, { name: 'Intruso' }).expect(403);
    const response = await call('patch', `/concerts/${concert.id}`, 'admin', { name: 'Admin' }).expect(200);
    assert.equal(response.body.data.name, 'Admin');
    await call('patch', `/concerts/${concert.id}`, 'admin', { organizer_id: ids.other }).expect(422);
});

test('lectura pública oculta borradores y cancelados, incluso sus entradas', async () => {
    const concert = await create();
    for (const role of [undefined, 'user', 'staff', 'other']) {
        await call('get', `/concerts/${concert.id}`, role).expect(404);
        await call('get', `/concerts/${concert.id}/ticket-types`, role).expect(404);
        const list = await call('get', '/concerts', role).expect(200);
        assert.equal(list.body.data.length, 0);
    }
    for (const role of ['owner', 'admin']) await call('get', `/concerts/${concert.id}`, role).expect(200);
    await publish(concert.id);
    await call('get', `/concerts/${concert.id}`).expect(200);
    await call('get', `/concerts/${concert.id}/ticket-types`).expect(200);
    await call('post', `/concerts/${concert.id}/cancel`, 'owner').expect(200);
    await call('get', `/concerts/${concert.id}`).expect(404);
});

test('listado combina todos los filtros y pagina sin duplicar conciertos con varios artistas', async () => {
    const matching = await create({ artist_ids: ['1', '2'], genre_ids: ['1', '2'] }); await publish(matching.id);
    const second = await create({ name: 'Otro show', venue_id: '2', concert_type_id: '2', artist_ids: ['2'], genre_ids: ['2'] }); await publish(second.id);
    await create();
    const query = new URLSearchParams({ q: 'VENTI', name: 'Festival', artist_id: '1', genre_id: '1', venue_id: '1', city_id: '1',
        type: 'CONCERT', concert_type_id: '1', status: 'PUBLISHED', date_from: future(20), date_to: future(40), page: '1', limit: '1' });
    const response = await call('get', `/concerts?${query}`).expect(200);
    assert.deepEqual(response.body.data.map(c => c.id), [matching.id]);
    assert.deepEqual(response.body.pagination, { page: 1, limit: 1, total: 1, total_pages: 1 });
    const page1 = await call('get', '/concerts?limit=1').expect(200);
    const page2 = await call('get', '/concerts?limit=1&page=2').expect(200);
    assert.equal(page1.body.pagination.total, 2);
    assert.notEqual(page1.body.data[0].id, page2.body.data[0].id);
    const empty = await call('get', '/concerts?page=99').expect(200);
    assert.deepEqual(empty.body.data, []);
    for (const filter of ['artist_id=999', 'genre_id=999', 'city_id=999', 'venue_id=999', 'type=LIVE_SHOW', 'q=inexistente']) {
        assert.equal((await call('get', `/concerts?${filter}`).expect(200)).body.pagination.total, 0);
    }
});

test('status/mine no amplían visibilidad; Organizer ve propios y públicos, Admin todos', async () => {
    const own = await create(); await create({}, 'other');
    for (const role of [undefined, 'user', 'staff']) await call('get', '/concerts?status=DRAFT', role).expect(403);
    const response = await call('get', '/concerts?status=DRAFT', 'owner').expect(200);
    assert.deepEqual(response.body.data.map(c => c.id), [own.id]);
    assert.equal((await call('get', '/concerts', 'admin').expect(200)).body.pagination.total, 2);
    assert.equal((await call('get', '/concerts?mine=true', 'owner').expect(200)).body.pagination.total, 1);
    await call('get', '/concerts?mine=true', 'user').expect(403);
    await request(ctx.app).get('/concerts').set('Authorization', 'Bearer invalid').expect(401);
});

test('relaciones se reemplazan y una referencia inválida revierte todos los cambios', async () => {
    const concert = await create();
    const changed = await call('patch', `/concerts/${concert.id}`, 'owner', { artist_ids: ['2', '1'], genre_ids: ['2'] }).expect(200);
    assert.deepEqual(changed.body.data.artists.map(a => a.id), ['2', '1']);
    assert.deepEqual(changed.body.data.genres.map(g => g.id), ['2']);
    await call('patch', `/concerts/${concert.id}`, 'owner', { name: 'Rollback', artist_ids: ['1'], genre_ids: ['9999'] }).expect(422);
    const current = (await call('get', `/concerts/${concert.id}`, 'owner').expect(200)).body.data;
    assert.equal(current.name, concert.name);
    assert.deepEqual(current.artists.map(a => a.id), ['2', '1']);
    assert.deepEqual(current.genres.map(g => g.id), ['2']);
});

test('creación multitabla revierte concierto y relaciones ante duplicados o referencias inválidas', async () => {
    await call('post', '/concerts', 'owner', input({ genre_ids: ['999'] })).expect(422);
    await call('post', '/concerts', 'owner', input({ venue_id: '999' })).expect(422);
    await call('post', '/concerts', 'owner', input({ concert_type_id: '999' })).expect(422);
    const ticket = { name: 'General', price: 1, stock_total: 5 };
    await call('post', '/concerts', 'owner', input({ ticket_types: [ticket, { ...ticket, name: 'GENERAL' }] })).expect(409);
    for (const table of ['concerts', 'concert_artists', 'concert_genres', 'ticket_types']) assert.equal(Number((await db.rows(`SELECT COUNT(*) AS total FROM ${table}`))[0].total), 0);
});

test('publicar valida requisitos y persiste published_at; publicar dos veces da 409', async () => {
    for (const extra of [{ artist_ids: [] }, { genre_ids: [] }, { ticket_types: [] }]) {
        const draft = await create(extra);
        await call('post', `/concerts/${draft.id}/publish`, 'owner').expect(422);
        assert.equal((await call('get', `/concerts/${draft.id}`, 'owner')).body.data.status, 'DRAFT');
    }
    const valid = await create(); const published = await publish(valid.id);
    assert.equal(published.status, 'PUBLISHED'); assert.ok(published.published_at);
    await call('post', `/concerts/${valid.id}/publish`, 'owner').expect(409);
    await call('post', `/concerts/${valid.id}/publish`, 'other').expect(403);
});

test('publicación permite precio y stock cero; rechaza fecha pasada existente en BD', async () => {
    const free = await create({ ticket_types: [{ name: 'Gratis', price: 0, stock_total: 0 }] }); await publish(free.id);
    const old = await create();
    await db.rows('UPDATE concerts SET start_datetime = ?, end_datetime = NULL WHERE id = ?', [new Date(Date.now() - 86400000), old.id]);
    await call('post', `/concerts/${old.id}/publish`, 'owner').expect(422);
});

test('publicado mantiene requisitos y ventanas de venta al editar o borrar entradas', async () => {
    const concert = await create(); await publish(concert.id);
    await call('patch', `/concerts/${concert.id}`, 'owner', { artist_ids: [] }).expect(422);
    await call('patch', `/concerts/${concert.id}`, 'owner', { genre_ids: [] }).expect(422);
    await call('patch', `/concerts/${concert.id}`, 'owner', { start_datetime: future(20) }).expect(422);
    await call('delete', `/ticket-types/${concert.ticket_types[0].id}`, 'owner').expect(422);
    const detail = (await call('get', `/concerts/${concert.id}`).expect(200)).body.data;
    assert.equal(detail.artists.length, 1); assert.equal(detail.genres.length, 1); assert.equal(detail.ticket_types.length, 1);
    await call('patch', `/concerts/${concert.id}`, 'owner', { description: 'Actualizado' }).expect(200);
});

test('cancelar conserva concierto y relaciones; cancelación idempotente y estado terminal', async () => {
    const concert = await create(); await publish(concert.id);
    await call('post', `/concerts/${concert.id}/cancel`, 'other').expect(403);
    for (let i = 0; i < 2; i++) assert.equal((await call('post', `/concerts/${concert.id}/cancel`, 'owner').expect(200)).body.data.status, 'CANCELLED');
    await call('post', `/concerts/${concert.id}/publish`, 'admin').expect(409);
    await call('patch', `/concerts/${concert.id}`, 'admin', { name: 'Cambio' }).expect(409);
    await call('post', `/concerts/${concert.id}/ticket-types`, 'owner', { name: 'VIP', price: 0, stock_total: 10 }).expect(409);
    await call('delete', `/ticket-types/${concert.ticket_types[0].id}`, 'owner').expect(409);
    await call('delete', `/concerts/${concert.id}`, 'owner').expect(409);
    assert.equal((await call('get', `/concerts/${concert.id}`, 'admin')).body.data.artists.length, 1);
});

test('borrado solo de borradores sin historial; protege publicados y favoritos', async () => {
    const draft = await create();
    await call('delete', `/concerts/${draft.id}`, 'other').expect(403);
    await call('delete', `/concerts/${draft.id}`, 'owner').expect(204);
    await call('get', `/concerts/${draft.id}`, 'admin').expect(404);
    assert.equal((await db.rows('SELECT * FROM ticket_types WHERE concert_id = ?', [draft.id])).length, 0);
    const published = await create(); await publish(published.id);
    await call('delete', `/concerts/${published.id}`, 'owner').expect(409);
    const saved = await create();
    await db.rows('INSERT INTO favorites (user_id, concert_id) VALUES (?, ?)', [ids.user, saved.id]);
    await call('delete', `/concerts/${saved.id}`, 'admin').expect(409);
});

for (const [catalog, body, update] of [
    ['provinces', { name: 'Mendoza' }, { name: 'Salta' }],
    ['cities', { name: 'Berisso', province_id: '1' }, { name: 'Ensenada' }],
    ['venues', { name: 'Club', city_id: '1', address: 'Calle 10', capacity: 50 }, { name: 'Club Nuevo', capacity: null }],
    ['genres', { name: 'Pop' }, { name: 'Soul' }],
    ['artists', { name: 'Solista', genre_ids: ['1', '2'] }, { name: 'Solista Nuevo', genre_ids: ['2'] }],
]) test(`CRUD ${catalog}: lectura pública y escrituras exclusivas de Admin`, async () => {
    await call('get', `/${catalog}`).expect(200);
    await call('post', `/${catalog}`, undefined, body).expect(401);
    for (const role of ['owner', 'user', 'staff']) await call('post', `/${catalog}`, role, body).expect(403);
    const created = (await call('post', `/${catalog}`, 'admin', body).expect(201)).body.data;
    await call('get', `/${catalog}/${created.id}`).expect(200);
    for (const role of ['owner', 'user', 'staff']) {
        await call('patch', `/${catalog}/${created.id}`, role, update).expect(403);
        await call('delete', `/${catalog}/${created.id}`, role).expect(403);
    }
    const edited = (await call('patch', `/${catalog}/${created.id}`, 'admin', update).expect(200)).body.data;
    assert.equal(edited.name, update.name);
    if (catalog === 'artists') assert.deepEqual(edited.genres.map(g => g.id), ['2']);
    await call('delete', `/${catalog}/${created.id}`, 'admin').expect(204);
    await call('get', `/${catalog}/${created.id}`).expect(404);
});

test('catálogos respetan unicidad, jerarquía, filtros y relaciones históricas', async () => {
    await create();
    for (const catalog of ['provinces', 'cities', 'venues', 'artists', 'genres']) await call('delete', `/${catalog}/1`, 'admin').expect(409);
    await call('post', '/genres', 'admin', { name: 'rock' }).expect(409);
    await call('post', '/cities', 'admin', { name: 'La Plata', province_id: '1' }).expect(409);
    await call('post', '/cities', 'admin', { name: 'Nueva', province_id: '999' }).expect(422);
    await call('post', '/venues', 'admin', { name: 'Nueva', city_id: '999', address: 'A' }).expect(422);
    const cities = (await call('get', '/cities?province_id=2').expect(200)).body.data;
    const venues = (await call('get', '/venues?city_id=1').expect(200)).body.data;
    assert.deepEqual(cities.map(c => c.id), ['2']); assert.deepEqual(venues.map(v => v.id), ['1']);
    assert.equal((await call('get', '/concert-types').expect(200)).body.data.length, 3);
});

test('artist_genres se actualiza atómicamente, sin duplicados ni borrado silencioso del género', async () => {
    await call('patch', '/artists/1', 'admin', { genre_ids: ['1'] }).expect(200);
    await call('patch', '/artists/1', 'admin', { name: 'No guardar', genre_ids: ['2', '999'] }).expect(422);
    const artist = (await call('get', '/artists/1').expect(200)).body.data;
    assert.equal(artist.name, 'Banda Uno'); assert.deepEqual(artist.genres.map(g => g.id), ['1']);
    await call('delete', '/genres/1', 'admin').expect(409);
    await call('patch', '/artists/1', 'admin', { genre_ids: ['1', '1'] }).expect(422);
    const list = await call('get', '/artists?q=Banda&limit=2').expect(200);
    assert.equal(list.body.pagination.total, 2); assert.equal(list.body.data.find(a => a.id === '1').genres.length, 1);
});

test('tipos de entrada: Organizer solo propios, Admin cualquiera, lectura según concierto', async () => {
    const concert = await create(); const path = `/concerts/${concert.id}/ticket-types`;
    const body = { name: 'VIP', price: 3000, stock_total: 10 };
    for (const role of ['other', 'user', 'staff']) await call('post', path, role, body).expect(403);
    const ticket = (await call('post', path, 'owner', body).expect(201)).body.data;
    for (const role of ['other', 'user', 'staff']) {
        await call('patch', `/ticket-types/${ticket.id}`, role, { price: 3500 }).expect(403);
        await call('delete', `/ticket-types/${ticket.id}`, role).expect(403);
    }
    await call('patch', `/ticket-types/${ticket.id}`, 'owner', { price: 3500 }).expect(200);
    await call('patch', `/ticket-types/${ticket.id}`, 'admin', { stock_total: 20 }).expect(200);
    await call('delete', `/ticket-types/${ticket.id}`, 'admin').expect(204);
    await call('patch', `/ticket-types/${ticket.id}`, 'owner', { price: 1 }).expect(404);
});

test('entradas validan precio, stock, máximo, unicidad y ventana completa en PATCH', async () => {
    const concert = await create(); const path = `/concerts/${concert.id}/ticket-types`;
    const base = { name: 'VIP', price: 1, stock_total: 1 };
    for (const extra of [{ price: -1 }, { price: 1.001 }, { price: 1.000001 }, { price: 10000000000 }, { stock_total: -1 }, { stock_total: 1.1 },
        { max_per_purchase: 0 }, { max_per_purchase: 65536 }, { sale_start: future(5), sale_end: future(4) },
        { sale_end: future(40) }, { sale_start: future(40) }, { concert_id: concert.id }]) {
        await call('post', path, 'owner', { ...base, ...extra }).expect(422);
    }
    await call('post', path, 'owner', { ...base, name: 'general' }).expect(409);
    const ticket = concert.ticket_types[0];
    await call('patch', `/ticket-types/${ticket.id}`, 'owner', { sale_end: future(0) }).expect(422);
    const vip = (await call('post', path, 'owner', base).expect(201)).body.data;
    await call('patch', `/ticket-types/${vip.id}`, 'owner', { name: 'General' }).expect(409);
    await call('patch', `/ticket-types/${vip.id}`, 'owner', { sale_start: null, sale_end: null, max_per_purchase: null }).expect(200);
});

test('FK de compras impide borrar concierto/entrada e historial impide reducir stock', async () => {
    const concert = await create(); const ticket = concert.ticket_types[0];
    await db.rows("INSERT INTO purchases (id, user_id, status_id) SELECT 1, ?, id FROM purchase_statuses WHERE code = 'CONFIRMED'", [ids.user]);
    await db.rows('INSERT INTO purchase_items (purchase_id, ticket_type_id, quantity, unit_price) VALUES (1, ?, 1, ?)', [ticket.id, ticket.price]);
    await call('delete', `/concerts/${concert.id}`, 'admin').expect(409);
    await call('delete', `/ticket-types/${ticket.id}`, 'admin').expect(409);
    await call('patch', `/ticket-types/${ticket.id}`, 'owner', { stock_total: 99 }).expect(409);
    await call('patch', `/ticket-types/${ticket.id}`, 'owner', { stock_total: 101 }).expect(200);
    assert.equal(Number((await db.rows('SELECT COUNT(*) AS total FROM purchase_items'))[0].total), 1);
});

test('escrituras concurrentes no eliminan todas las entradas de un publicado', async () => {
    const concert = await create({ ticket_types: [{ name: 'A', price: 1, stock_total: 1 }, { name: 'B', price: 2, stock_total: 2 }] });
    await publish(concert.id);
    const responses = await Promise.all(concert.ticket_types.map(ticket => call('delete', `/ticket-types/${ticket.id}`, 'owner')));
    assert.deepEqual(responses.map(r => r.status).sort(), [204, 422]);
    assert.equal((await call('get', `/concerts/${concert.id}`).expect(200)).body.data.ticket_types.length, 1);
});

test('publicación y reemplazo concurrente conservan invariantes', async () => {
    const concert = await create();
    const results = await Promise.all([call('post', `/concerts/${concert.id}/publish`, 'owner'), call('patch', `/concerts/${concert.id}`, 'owner', { genre_ids: [] })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 422]);
    const detail = (await call('get', `/concerts/${concert.id}`, 'owner').expect(200)).body.data;
    if (detail.status === 'PUBLISHED') assert.equal(detail.genres.length, 1);
    else assert.equal(detail.genres.length, 0);
});

test('listado usa cantidad constante de consultas para relaciones (sin N+1)', async t => {
    for (let i = 0; i < 3; i++) { const concert = await create({ name: `Show ${i}` }); await publish(concert.id); }
    const original = ManagementRepository.prototype.rows;
    let count = 0;
    t.mock.method(ManagementRepository.prototype, 'rows', function (...args) { count++; return original.apply(this, args); });
    await call('get', '/concerts?limit=1').expect(200); const one = count; count = 0;
    await call('get', '/concerts?limit=100').expect(200);
    assert.equal(count, one); assert.equal(count, 5);
});

test('IDs BIGINT seguros y rechazo de campos/IDs/fechas/filtros malformados', async () => {
    for (const extra of [{ artist_ids: ['1', '1'] }, { start_datetime: future(-1) }, { end_datetime: future(1) },
        { start_datetime: '2026-99-99' }, { status_id: 2 }, { published_at: future(1) }, { province_id: 1 }, { venue_id: '18446744073709551616' }]) {
        await call('post', '/concerts', 'owner', input(extra)).expect(422);
    }
    for (const query of ['limit=0', 'limit=101', 'page=-1', 'unknown=1', 'status=INVALID', 'artist_id=abc', 'q=a&q=b', `date_from=${future(40)}&date_to=${future(20)}`]) await call('get', `/concerts?${query}`).expect(422);
    for (const path of ['/concerts/abc', '/concerts/0', '/venues/18446744073709551616']) await call('get', path).expect(422);
    await call('get', '/concerts/99999', 'admin').expect(404);
    const concert = await create();
    await call('patch', `/concerts/${concert.id}`, 'owner', {}).expect(422);
    const hugeId = '9007199254740993';
    await db.rows('UPDATE concerts SET id = ? WHERE id = ?', [hugeId, (await create({ artist_ids: [], genre_ids: [], ticket_types: [] })).id]);
    assert.equal((await call('get', `/concerts/${hugeId}`, 'owner').expect(200)).body.data.id, hugeId);
    const injection = await call('get', `/concerts?q=${encodeURIComponent("' OR 1=1 --")}`).expect(200);
    assert.equal(injection.body.pagination.total, 0);
});

test('JSON inválido da 400 y CORS admite PATCH/DELETE; respuestas no se cachean', async () => {
    await request(ctx.app).post('/concerts').set('Content-Type', 'application/json').send('{broken').expect(400);
    const response = await request(ctx.app).options('/concerts/1').set('Origin', 'http://localhost:8081').set('Access-Control-Request-Method', 'PATCH').expect(204);
    assert.match(response.headers['access-control-allow-methods'], /PATCH/); assert.match(response.headers['access-control-allow-methods'], /DELETE/);
    assert.equal((await call('get', '/concerts').expect(200)).headers['cache-control'], 'no-store');
});
