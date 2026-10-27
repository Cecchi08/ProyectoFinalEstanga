import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';

const db = new TestDatabase();
let ctx;
// 'services', 'crew' and 'rival' operate companies; 'hybrid' also requests quotes; 'organizer' only requests; 'buyer' neither.
const ids = { services: '201', crew: '202', rival: '203', hybrid: '204', organizer: '205', buyer: '206', admin: '207' };
const roles = { services: ['EMPRESA_SERVICIOS'], crew: ['EMPRESA_SERVICIOS'], rival: ['EMPRESA_SERVICIOS'], hybrid: ['EMPRESA_SERVICIOS', 'ORGANIZADOR'],
    organizer: ['ORGANIZADOR'], buyer: ['COMPRADOR'], admin: ['ADMIN'] };
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
// Whole hours, ten days ahead.
const base = Math.ceil(Date.now() / 3600000) * 3600000 + 10 * 86400000;
const at = hours => new Date(base + hours * 3600000).toISOString().replace('.000Z', 'Z');
const company = async (role = 'services', name = 'Sonido Sur') =>
    (await call('post', '/services/providers', role, { name, city_id: '1', coverage_area: 'Costa atlántica' }).expect(201)).body.data;
const offering = async (providerId, role = 'services') => (await call('post', `/services/providers/${providerId}/offerings`, role,
    { category_code: 'SOUND', name: 'Sistema PA', pricing_unit: 'DAY', base_price: 50000 }).expect(201)).body.data;
// A public company with one published offering.
async function published() {
    const provider = await company();
    const service = await offering(provider.id);
    await call('post', `/services/offerings/${service.id}/publish`, 'services').expect(200);
    await call('post', `/services/providers/${provider.id}/publish`, 'services').expect(200);
    return { provider, service };
}
const ask = (offeringId, extra = {}, role = 'organizer') => call('post', '/services/quotes', role,
    { offering_id: offeringId, event_name: 'Festival', event_start_at: at(20), event_end_at: at(24), ...extra });
const answer = (quoteId, extra = {}, role = 'services') => call('post', `/services/quotes/${quoteId}/respond`, role,
    { items: [{ description: 'PA line array', quantity: 2, unit_price: 1000.5 }], fees: 100, discount: 50, valid_until: at(5), ...extra });

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, name, 'Test', `${name}@services.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
});

test('empresa: alta y catálogo por OWNER; borradores ocultos al público; verificación solo services.admin y auditada', async () => {
    await call('post', '/services/providers', 'buyer', { name: 'Ajena' }).expect(403);
    const provider = await company();
    assert.deepEqual([provider.member_role, provider.status], ['OWNER', 'DRAFT']);
    await call('get', `/services/providers/${provider.id}`).expect(404);
    await call('get', `/services/providers/${provider.id}`, 'services').expect(200);
    await call('post', `/services/providers/${provider.id}/offerings`, 'services', { category_code: 'SOUND', name: 'Sin precio', pricing_unit: 'DAY' }).expect(422);
    await error(call('post', `/services/providers/${provider.id}/offerings`, 'services', { category_code: 'NOPE', name: 'X' }), 422, 'UNKNOWN_CATEGORY');
    await error(call('patch', `/services/providers/${provider.id}`, 'rival', { coverage_area: 'Ajena' }), 403, 'FORBIDDEN');
    const service = await offering(provider.id);
    await call('post', `/services/offerings/${service.id}/publish`, 'services').expect(200);
    const search = async () => (await call('get', '/services/offerings?q=Sistema').expect(200)).body.data.map(item => item.id);
    // A published offering of an unpublished company is not public.
    assert.deepEqual(await search(), []);
    await call('post', `/services/providers/${provider.id}/publish`, 'services').expect(200);
    assert.deepEqual(await search(), [service.id]);
    await call('get', `/services/providers/${provider.id}`).expect(200);
    await call('post', `/services/providers/${provider.id}/verify`, 'services').expect(403);
    const verified = (await call('post', `/services/providers/${provider.id}/verify`, 'admin').expect(200)).body.data;
    assert.equal(Boolean(Number(verified.is_verified)), true);
    await call('post', `/services/providers/${provider.id}/verify`, 'admin').expect(200);
    await call('post', `/services/providers/${provider.id}/unverify`, 'admin').expect(200);
    const audit = await db.rows("SELECT action FROM admin_audit_log WHERE entity_type = 'SERVICE_PROVIDER' AND entity_id = ? ORDER BY id", [provider.id]);
    assert.deepEqual(audit.map(row => row.action), ['SERVICE_PROVIDER_VERIFIED', 'SERVICE_PROVIDER_UNVERIFIED']);
});

test('integrantes: solo cuentas EMPRESA_SERVICIOS; gestionan OWNER/ADMIN; solo un OWNER toca a otro OWNER; siempre queda uno', async () => {
    const provider = await company();
    const path = `/services/providers/${provider.id}/members`;
    await error(call('post', path, 'services', { email: 'buyer@services.example' }), 422, 'MEMBER_NOT_SERVICES');
    await error(call('post', path, 'services', { email: 'nadie@services.example' }), 422, 'INVALID_MEMBER');
    const members = (await call('post', path, 'services', { email: 'crew@services.example' }).expect(201)).body.data;
    assert.deepEqual(members.map(member => [member.user_id, member.member_role]), [[ids.services, 'OWNER'], [ids.crew, 'STAFF']]);
    await error(call('post', path, 'services', { email: 'crew@services.example' }), 409, 'ALREADY_MEMBER');
    // STAFF reads the company but does not manage it.
    await call('get', path, 'crew').expect(200);
    await error(call('post', path, 'crew', { email: 'rival@services.example' }), 403, 'FORBIDDEN');
    await error(call('get', path, 'rival'), 403, 'FORBIDDEN');
    await call('patch', `${path}/${ids.crew}`, 'services', { member_role: 'ADMIN' }).expect(200);
    await call('post', path, 'crew', { email: 'rival@services.example' }).expect(201);
    await error(call('patch', `${path}/${ids.crew}`, 'crew', { member_role: 'OWNER' }), 403, 'FORBIDDEN');
    await error(call('patch', `${path}/${ids.services}`, 'services', { member_role: 'ADMIN' }), 409, 'LAST_OWNER');
    await error(call('delete', `${path}/${ids.services}`, 'services'), 409, 'LAST_OWNER');
    await call('delete', `${path}/${ids.rival}`, 'crew').expect(204);
    await call('delete', `${path}/${ids.crew}`, 'crew').expect(204);
    assert.deepEqual((await call('get', path, 'services').expect(200)).body.data.map(member => member.user_id), [ids.services]);
});

test('cotizaciones: pedir, responder, contratar, vencer, rechazar y cancelar con reglas de cada parte; disponibilidad', async () => {
    const { provider, service } = await published();
    await call('post', `/services/providers/${provider.id}/members`, 'services', { email: 'hybrid@services.example' }).expect(201);
    await call('post', '/services/quotes', 'buyer', {}).expect(403);
    await error(ask(service.id, { event_start_at: '2020-01-01T10:00:00Z', event_end_at: '2020-01-01T12:00:00Z' }), 422, 'INVALID_DATE');
    await error(ask(service.id, {}, 'hybrid'), 422, 'OWN_PROVIDER');
    const quote = (await ask(service.id).expect(201)).body.data;
    assert.equal(quote.status, 'REQUESTED');
    const notices = await db.rows("SELECT user_id, JSON_UNQUOTE(JSON_EXTRACT(data, '$.service_quote_id')) AS quote FROM notifications WHERE type = 'QUOTE_UPDATE' ORDER BY user_id");
    assert.deepEqual(notices.map(row => [String(row.user_id), row.quote]), [[ids.services, quote.id], [ids.hybrid, quote.id]]);
    await error(call('get', `/services/quotes/${quote.id}`, 'rival'), 404, 'NOT_FOUND');
    await call('post', `/services/quotes/${quote.id}/respond`, 'organizer', {}).expect(403);
    await error(answer(quote.id, { valid_until: at(21) }), 422, 'INVALID_DATE');
    await error(answer(quote.id, { discount: 5000 }), 422, 'INVALID_TOTAL');
    const sent = (await answer(quote.id).expect(200)).body.data;
    assert.deepEqual([sent.status, sent.subtotal, sent.total_amount, sent.items.length], ['SENT', '2001.00', '2051.00', 1]);
    await call('post', `/services/quotes/${quote.id}/accept`, 'services').expect(403);
    const accepted = (await call('post', `/services/quotes/${quote.id}/accept`, 'organizer').expect(200)).body.data;
    assert.equal(accepted.status, 'ACCEPTED'); assert.ok(accepted.accepted_at);
    await error(call('post', `/services/quotes/${quote.id}/accept`, 'organizer'), 409, 'INVALID_STATE');
    // Contracted windows: outsiders see only the times, members also see the quote.
    const window = `from=${encodeURIComponent(at(19))}&to=${encodeURIComponent(at(25))}`;
    const outside = (await call('get', `/services/offerings/${service.id}/availability?${window}`).expect(200)).body.data;
    assert.equal(outside.available, false); assert.deepEqual(Object.keys(outside.busy[0]).sort(), ['ends_at', 'starts_at']);
    const inside = (await call('get', `/services/offerings/${service.id}/availability?${window}`, 'services').expect(200)).body.data;
    assert.equal(String(inside.busy[0].quote_id), quote.id);
    // The requester cancels the contracted service before it starts: the window is free again.
    assert.equal((await call('post', `/services/quotes/${quote.id}/cancel`, 'organizer', { reason: 'Se suspendió el show' }).expect(200)).body.data.status, 'CANCELLED');
    assert.equal((await call('get', `/services/offerings/${service.id}/availability?${window}`).expect(200)).body.data.available, true);
    // A SENT quote past its validity expires when accepted, and the state is persisted.
    const late = (await ask(service.id).expect(201)).body.data;
    await answer(late.id).expect(200);
    await db.rows('UPDATE service_quotes SET valid_until = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE id = ?', [late.id]);
    await error(call('post', `/services/quotes/${late.id}/accept`, 'organizer'), 409, 'QUOTE_EXPIRED');
    assert.equal((await call('get', `/services/quotes/${late.id}`, 'organizer').expect(200)).body.data.status, 'EXPIRED');
    // The company declines; a closed quote can no longer be cancelled.
    const declined = (await ask(service.id).expect(201)).body.data;
    await call('post', `/services/quotes/${declined.id}/reject`, 'organizer', {}).expect(403);
    const rejected = (await call('post', `/services/quotes/${declined.id}/reject`, 'services', { provider_notes: 'Sin equipos esa fecha' }).expect(200)).body.data;
    assert.deepEqual([rejected.status, rejected.provider_notes], ['REJECTED', 'Sin equipos esa fecha']);
    await error(call('post', `/services/quotes/${declined.id}/cancel`, 'organizer', {}), 409, 'INVALID_STATE');
});
