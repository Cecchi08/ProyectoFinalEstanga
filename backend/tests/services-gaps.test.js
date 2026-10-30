import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { services: '301', rival: '302', organizer: '303', admin: '304' };
const roles = { services: ['EMPRESA_SERVICIOS'], rival: ['EMPRESA_SERVICIOS'], organizer: ['ORGANIZADOR'], admin: ['ADMIN'] };
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};
const base = Math.ceil(Date.now() / 3600000) * 3600000 + 10 * 86400000;
const at = hours => new Date(base + hours * 3600000).toISOString().replace('.000Z', 'Z');
const company = async (role = 'services', name = 'Sonido Sur') =>
    (await call('post', '/services/providers', role, { name, city_id: '1', coverage_area: 'Costa atlántica' }).expect(201)).body.data;
const offering = async (providerId, role = 'services') => (await call('post', `/services/providers/${providerId}/offerings`, role,
    { category_code: 'SOUND', name: 'Sistema PA', pricing_unit: 'DAY', base_price: 50000 }).expect(201)).body.data;
const ask = (offeringId, role = 'organizer') => call('post', '/services/quotes', role,
    { offering_id: offeringId, event_name: 'Festival', event_start_at: at(20), event_end_at: at(24) });
const answer = (quoteId) => call('post', `/services/quotes/${quoteId}/respond`, 'services',
    { items: [{ description: 'PA line array', quantity: 2, unit_price: 1000.5 }], fees: 100, discount: 50, valid_until: at(5) });

async function published() {
    const provider = await company();
    const service = await offering(provider.id);
    await call('post', `/services/offerings/${service.id}/publish`, 'services').expect(200);
    await call('post', `/services/providers/${provider.id}/publish`, 'services').expect(200);
    return { provider, service };
}

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, name, 'Test', `${name}@gaps.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
});

test('aceptación concurrente de la misma cotización: una sola se acepta, la otra responde 409', async () => {
    const { service } = await published();
    const quote = (await ask(service.id).expect(201)).body.data;
    await answer(quote.id).expect(200);
    const responses = await Promise.all([call('post', `/services/quotes/${quote.id}/accept`, 'organizer'), call('post', `/services/quotes/${quote.id}/accept`, 'organizer')]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(responses.find(response => response.status === 409).body.error.code, 'INVALID_STATE');
});

test('aislamiento: otro proveedor no edita, publica ni cotiza sobre ofertas ajenas', async () => {
    const { service } = await published();
    const statuses = [
        (await call('patch', `/services/offerings/${service.id}`, 'rival', { base_price: 1 })).status,
        (await call('post', `/services/offerings/${service.id}/archive`, 'rival', {})).status,
    ];
    for (const status of statuses) assert.ok([403, 404].includes(status), `status ${status}`);
    const price = (await call('get', `/services/offerings/${service.id}`, 'organizer').expect(200)).body.data;
    assert.equal(String(price.base_price), '50000.00');
    await call('post', `/services/providers/${(await company('rival', 'Otra')).id}/offerings`, 'rival', { category_code: 'SOUND', name: 'X', pricing_unit: 'DAY', base_price: 1 }).expect(201);
});

test('ofertas y cotizaciones: precios negativos, datos vacíos y referencias inexistentes responden 4xx sin 500', async () => {
    const provider = await company();
    for (const body of [
        { category_code: 'SOUND', name: 'Sistema', pricing_unit: 'DAY', base_price: -1 },
        { category_code: 'SOUND', name: '', pricing_unit: 'DAY', base_price: 10 },
        { category_code: 'NO_EXISTE', name: 'Sistema', pricing_unit: 'DAY', base_price: 10 },
    ]) {
        const response = await call('post', `/services/providers/${provider.id}/offerings`, 'services', body);
        assert.ok(response.status >= 400 && response.status < 500, `${JSON.stringify(body)} -> ${response.status}`);
    }
    const missing = await ask('999999');
    assert.ok(missing.status >= 400 && missing.status < 500, `cotización a oferta inexistente -> ${missing.status}`);
});

// Regresión de transacción: si falla la notificación al proveedor, la aceptación no debe quedar a medias.
test('rollback de aceptación: si falla la notificación, la cotización sigue SENT y se puede aceptar después', async () => {
    const { service } = await published();
    const quote = (await ask(service.id).expect(201)).body.data;
    await answer(quote.id).expect(200);
    await db.pool.query(`CREATE TRIGGER tmp_fail_quote_notif BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo simulado'`);
    try {
        const failed = await call('post', `/services/quotes/${quote.id}/accept`, 'organizer');
        assert.ok(failed.status >= 500, `status ${failed.status}`);
    } finally {
        await db.pool.query('DROP TRIGGER tmp_fail_quote_notif');
    }
    const [row] = await db.rows('SELECT status FROM service_quotes WHERE id = ?', [quote.id]);
    assert.equal(row.status, 'SENT', 'la cotización no debe quedar ACCEPTED sin notificación');
    await call('post', `/services/quotes/${quote.id}/accept`, 'organizer').expect(200);
});
