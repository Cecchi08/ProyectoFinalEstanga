import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';
import { ManagementRepository } from '../src/repositories/management.repository.ts';

const db = new TestDatabase();
let ctx;
// Staff is a per-concert assignment; outside a concert it is a plain COMPRADOR.
const roles = { admin: ['ADMIN'], owner: ['ORGANIZADOR'], other: ['ORGANIZADOR'], user: ['COMPRADOR'], staff: ['COMPRADOR'] };
const ids = { admin: '101', owner: '102', other: '103', user: '104', staff: '105' };
const future = days => new Date(Date.now() + days * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const bearer = role => `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`;
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', bearer(role));
    return body === undefined ? req : req.send(body);
};
// Seeded catalogs: city 1 = Mar del Plata, city 2 = Batan (province 1, Buenos Aires); genre 1 = Rock, 2 = Pop.
const input = (extra = {}) => ({ name: 'Festival VENTI', artist_name: 'Banda Uno', venue_name: 'Estadio', address_line: 'Calle 1', city_id: '1',
    start_datetime: future(30), end_datetime: future(31), genre_ids: ['1'],
    ticket_types: [{ name: 'General', price: 1500.25, stock_total: 100, sale_start: future(1), sale_end: future(29), max_per_purchase: 4 }], ...extra });
const create = async (extra = {}, role = 'owner') => (await call('post', '/concerts', role, input(extra)).expect(201)).body.data;
const publish = async id => (await call('post', `/concerts/${id}/publish`, 'owner').expect(200)).body.data;

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [role, userId] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [userId, role, 'Test', `${role}@test.example`]);
        await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [userId, roles[role][0]]);
    }
    // A marketplace space in Batan, to check the location snapshot a concert takes from venue_id.
    await db.rows("INSERT INTO organizations (id, name, slug) VALUES (1, 'Org', 'org')");
    await db.rows(`INSERT INTO establishments (id, organization_id, city_id, name, slug, address_line, status, published_at)
        VALUES (1, 1, 2, 'Club', 'club', 'Ruta 88 km 5', 'PUBLISHED', NOW())`);
    await db.rows("INSERT INTO venues (id, establishment_id, venue_type_id, name, slug, status, published_at) VALUES (1, 1, 1, 'Sala A', 'sala-a', 'PUBLISHED', NOW())");
});

test('Organizer crea borrador propio con relaciones, fechas, entradas y precios exactos', async () => {
    const concert = await create();
    assert.equal(concert.organizer_id, ids.owner);
    assert.equal(concert.status, 'DRAFT');
    assert.deepEqual(concert.artists, [{ name: 'Banda Uno' }]);
    assert.ok(concert.slug.startsWith('festival-venti-'));
    assert.equal(concert.genres[0].id, '1');
    assert.equal(concert.ticket_types[0].price, '1500.25');
    assert.equal(concert.city_id, '1');
    assert.equal(concert.province_id, '1');
});

test('crear exige autenticación y permiso vigente; COMPRADOR recibe 403', async () => {
    await call('post', '/concerts', undefined, input()).expect(401);
    for (const role of ['user', 'staff']) await call('post', '/concerts', role, input()).expect(403);
    await db.rows('DELETE FROM user_roles WHERE user_id = ?', [ids.owner]);
    await db.rows("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'COMPRADOR'", [ids.owner]);
    await call('post', '/concerts', 'owner', input()).expect(403);
});

test('ownership nunca se acepta del Organizer; Admin puede elegir organizador válido', async () => {
    await call('post', '/concerts', 'owner', input({ organizer_id: ids.other })).expect(403);
    const concert = await create({ organizer_id: ids.other }, 'admin');
    assert.equal(concert.organizer_id, ids.other);
    await call('post', '/concerts', 'admin', input({ organizer_id: ids.user })).expect(422);
    // Any active account whose profiles grant concerts.manage (ORGANIZADOR, ADMIN) can own concerts.
    assert.equal((await create({}, 'admin')).organizer_id, ids.admin);
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

test('listado combina todos los filtros y pagina sin duplicar conciertos con varios géneros', async () => {
    const matching = await create({ genre_ids: ['1', '2'] }); await publish(matching.id);
    const second = await create({ name: 'Otro show', venue_id: '1', artist_name: 'Banda Dos', genre_ids: ['2'] }); await publish(second.id);
    await create();
    const query = new URLSearchParams({ q: 'VENTI', name: 'Festival', artist: 'Uno', genre_id: '1', city_id: '1',
        status: 'PUBLISHED', date_from: future(20), date_to: future(40), page: '1', limit: '1' });
    const response = await call('get', `/concerts?${query}`).expect(200);
    assert.deepEqual(response.body.data.map(c => c.id), [matching.id]);
    assert.deepEqual(response.body.pagination, { page: 1, limit: 1, total: 1, total_pages: 1 });
    const page1 = await call('get', '/concerts?limit=1').expect(200);
    const page2 = await call('get', '/concerts?limit=1&page=2').expect(200);
    assert.equal(page1.body.pagination.total, 2);
    assert.notEqual(page1.body.data[0].id, page2.body.data[0].id);
    const empty = await call('get', '/concerts?page=99').expect(200);
    assert.deepEqual(empty.body.data, []);
    assert.deepEqual((await call('get', '/concerts?venue_id=1').expect(200)).body.data.map(c => c.id), [second.id]);
    for (const filter of ['artist=Nadie', 'genre_id=999', 'city_id=999', 'venue_id=999', 'q=inexistente']) {
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
    const changed = await call('patch', `/concerts/${concert.id}`, 'owner', { artist_name: 'Banda Dos', genre_ids: ['2', '1'] }).expect(200);
    assert.deepEqual(changed.body.data.artists, [{ name: 'Banda Dos' }]);
    assert.deepEqual(changed.body.data.genres.map(g => g.id), ['2', '1']);
    await call('patch', `/concerts/${concert.id}`, 'owner', { name: 'Rollback', artist_name: 'No', genre_ids: ['9999'] }).expect(422);
    const current = (await call('get', `/concerts/${concert.id}`, 'owner').expect(200)).body.data;
    assert.equal(current.name, concert.name);
    assert.equal(current.artist_name, 'Banda Dos');
    assert.deepEqual(current.genres.map(g => g.id), ['2', '1']);
});

test('venue_id del marketplace copia lugar y ciudad; un lugar explícito tiene prioridad', async () => {
    const concert = await create({ venue_id: '1', venue_name: undefined, address_line: undefined, city_id: undefined });
    assert.deepEqual([concert.venue_id, concert.venue_name, concert.address_line, concert.city_id, concert.city_name],
        ['1', 'Club - Sala A', 'Ruta 88 km 5', '2', 'Batan']);
    const named = await create({ venue_id: '1', venue_name: 'Escenario principal' });
    assert.deepEqual([named.venue_name, named.city_id], ['Escenario principal', '1']);
});

test('creación multitabla revierte concierto y relaciones ante duplicados o referencias inválidas', async () => {
    await call('post', '/concerts', 'owner', input({ genre_ids: ['999'] })).expect(422);
    await call('post', '/concerts', 'owner', input({ venue_id: '999' })).expect(422);
    await call('post', '/concerts', 'owner', input({ artist_ids: ['1'] })).expect(422);
    const ticket = { name: 'General', price: 1, stock_total: 5 };
    await call('post', '/concerts', 'owner', input({ ticket_types: [ticket, { ...ticket, name: 'GENERAL' }] })).expect(409);
    for (const table of ['concerts', 'concert_genres', 'ticket_types']) assert.equal(Number((await db.rows(`SELECT COUNT(*) AS total FROM ${table}`))[0].total), 0);
});

test('publicar valida requisitos y persiste published_at; publicar dos veces da 409', async () => {
    for (const extra of [{ venue_name: null }, { city_id: null }, { genre_ids: [] }, { ticket_types: [] }]) {
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
    await db.rows('UPDATE concerts SET starts_at = ?, ends_at = NULL WHERE id = ?', [new Date(Date.now() - 86400000), old.id]);
    await call('post', `/concerts/${old.id}/publish`, 'owner').expect(422);
});

test('publicado mantiene requisitos y ventanas de venta al editar o borrar entradas', async () => {
    const concert = await create(); await publish(concert.id);
    await call('patch', `/concerts/${concert.id}`, 'owner', { venue_name: null }).expect(422);
    await call('patch', `/concerts/${concert.id}`, 'owner', { genre_ids: [] }).expect(422);
    await call('patch', `/concerts/${concert.id}`, 'owner', { start_datetime: future(20) }).expect(422);
    await call('delete', `/ticket-types/${concert.ticket_types[0].id}`, 'owner').expect(422);
    const detail = (await call('get', `/concerts/${concert.id}`).expect(200)).body.data;
    assert.equal(detail.artists.length, 1); assert.equal(detail.genres.length, 1); assert.equal(detail.ticket_types.length, 1);
    await call('patch', `/concerts/${concert.id}`, 'owner', { description: 'Actualizado' }).expect(200);
});

test('cancelar conserva concierto y relaciones; cancelación idempotente y estado terminal', async () => {
    // chk_concerts_published: a draft cannot become CANCELLED without a publication date; drafts are deleted instead.
    await call('post', `/concerts/${(await create()).id}/cancel`, 'owner').expect(409);
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

test('borrado solo de borradores sin historial; protege publicados y staff asignado', async () => {
    const draft = await create();
    await call('delete', `/concerts/${draft.id}`, 'other').expect(403);
    await call('delete', `/concerts/${draft.id}`, 'owner').expect(204);
    await call('get', `/concerts/${draft.id}`, 'admin').expect(404);
    assert.equal((await db.rows('SELECT * FROM ticket_types WHERE concert_id = ?', [draft.id])).length, 0);
    const published = await create(); await publish(published.id);
    await call('delete', `/concerts/${published.id}`, 'owner').expect(409);
    const saved = await create();
    await db.rows('INSERT INTO concert_staff (concert_id, user_id) VALUES (?, ?)', [saved.id, ids.staff]);
    await call('delete', `/concerts/${saved.id}`, 'admin').expect(409);
});

for (const [catalog, body, update] of [
    ['provinces', { code: 'AR-ZZ', name: 'Provincia Test' }, { name: 'Provincia Editada' }],
    ['districts', { name: 'Partido Test', province_id: '1' }, { name: 'Partido Editado' }],
    ['cities', { name: 'Berisso', province_id: '1', district_id: '1' }, { name: 'Ensenada' }],
    ['genres', { name: 'Funk' }, { name: 'Soul' }],
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
    await call('delete', `/${catalog}/${created.id}`, 'admin').expect(204);
    await call('get', `/${catalog}/${created.id}`).expect(404);
});

test('catálogos respetan unicidad, jerarquía, filtros y relaciones históricas', async () => {
    await create({ genre_ids: ['1'] });
    for (const catalog of ['provinces', 'cities', 'genres']) await call('delete', `/${catalog}/1`, 'admin').expect(409);
    await call('post', '/genres', 'admin', { name: 'rock' }).expect(409);
    const genre = (await call('post', '/genres', 'admin', { name: 'Chamamé' }).expect(201)).body.data;
    assert.match(genre.slug, /^chamame-[a-f0-9]{6}$/);
    await call('post', '/cities', 'admin', { name: 'Mar del Plata', province_id: '1', district_id: '1' }).expect(409);
    await call('post', '/cities', 'admin', { name: 'Nueva', province_id: '999', district_id: '1' }).expect(422);
    // The composite FK keeps a city's district inside its province.
    await call('post', '/cities', 'admin', { name: 'Nueva', province_id: '2', district_id: '1' }).expect(422);
    assert.equal((await call('get', '/cities?district_id=1').expect(200)).body.pagination.total, 4);
    assert.equal((await call('get', '/cities?province_id=2').expect(200)).body.pagination.total, 0);
    assert.deepEqual((await call('get', '/venues').expect(200)).body.data.map(v => v.id), ['1']);
});

test('endpoints sin tabla en el esquema responden 410 con la alternativa', async () => {
    for (const [method, path, role] of [['get', '/concert-types'],
        ['post', '/venues', 'admin'], ['patch', '/venues/1', 'admin'], ['delete', '/venues/1', 'admin']]) {
        const response = await call(method, path, role, method === 'get' ? undefined : {});
        assert.equal(response.status, 410, `${method} ${path}`);
        assert.equal(response.body.error.code, 'GONE');
    }
});

test('staff: el dueño asigna por email, es idempotente y da acceso solo a ese concierto', async () => {
    const concert = await create(); const path = `/concerts/${concert.id}/staff`;
    for (const role of ['other', 'user']) await call('post', path, role, { email: 'staff@test.example' }).expect(403);
    await call('post', path, 'owner', { email: 'nadie@test.example' }).expect(422);
    await call('post', path, 'owner', { email: 'no-es-email' }).expect(422);
    for (let i = 0; i < 2; i++) {
        const list = (await call('post', path, 'owner', { email: ' STAFF@test.example ' }).expect(201)).body.data;
        assert.deepEqual(list.map(s => s.user_id), [ids.staff]);
    }
    assert.equal((await call('get', path, 'admin').expect(200)).body.data[0].email, 'staff@test.example');
    await call('get', path, 'other').expect(403);
    assert.deepEqual((await call('get', '/staff/assignments', 'staff').expect(200)).body.data.map(c => c.id), [concert.id]);
    await call('delete', `${path}/${ids.staff}`, 'other').expect(403);
    await call('delete', `${path}/${ids.staff}`, 'owner').expect(204);
    await call('delete', `${path}/${ids.staff}`, 'owner').expect(404);
    assert.deepEqual((await call('get', '/staff/assignments', 'staff').expect(200)).body.data, []);
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
    await db.rows("INSERT INTO orders (id, public_code, user_id, status, confirmed_at) VALUES (1, 'O-TEST', ?, 'CONFIRMED', NOW())", [ids.user]);
    await db.rows('INSERT INTO order_items (order_id, ticket_type_id, concert_id, quantity, unit_price, line_total) VALUES (1, ?, ?, 1, ?, ?)', [ticket.id, concert.id, ticket.price, ticket.price]);
    await call('delete', `/concerts/${concert.id}`, 'admin').expect(409);
    await call('delete', `/ticket-types/${ticket.id}`, 'admin').expect(409);
    await call('patch', `/ticket-types/${ticket.id}`, 'owner', { stock_total: 99 }).expect(409);
    await call('patch', `/ticket-types/${ticket.id}`, 'owner', { stock_total: 101 }).expect(200);
    assert.equal(Number((await db.rows('SELECT COUNT(*) AS total FROM order_items'))[0].total), 1);
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
    assert.equal(count, one); assert.equal(count, 4);
});

test('IDs BIGINT seguros y rechazo de campos/IDs/fechas/filtros malformados', async () => {
    for (const extra of [{ artist_ids: ['1'] }, { concert_type_id: '1' }, { start_datetime: future(-1) }, { end_datetime: future(1) },
        { start_datetime: '2026-99-99' }, { status_id: 2 }, { published_at: future(1) }, { province_id: 1 }, { venue_id: '18446744073709551616' }]) {
        await call('post', '/concerts', 'owner', input(extra)).expect(422);
    }
    for (const query of ['limit=0', 'limit=101', 'page=-1', 'unknown=1', 'status=INVALID', 'artist_id=1', 'type=CONCERT', 'q=a&q=b', `date_from=${future(40)}&date_to=${future(20)}`]) await call('get', `/concerts?${query}`).expect(422);
    for (const path of ['/concerts/abc', '/concerts/0', '/venues/18446744073709551616']) await call('get', path).expect(422);
    await call('get', '/concerts/99999', 'admin').expect(404);
    const concert = await create();
    await call('patch', `/concerts/${concert.id}`, 'owner', {}).expect(422);
    const hugeId = '9007199254740993';
    await db.rows('UPDATE concerts SET id = ? WHERE id = ?', [hugeId, (await create({ genre_ids: [], ticket_types: [] })).id]);
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
