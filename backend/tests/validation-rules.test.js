import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData, registration } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { admin: '801', provider: '802', buyer: '803' };
const roles = { admin: ['ADMIN'], provider: ['VENUE', 'ORGANIZADOR'], buyer: ['COMPRADOR'] };
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};
const status = async response => (await response).status;

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, name, 'Test', `${name}@rules.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
});

test('ciudad del catálogo: solo letras Unicode y espacios, recortada; números, símbolos y vacíos dan 422', async () => {
    const [district] = await db.rows('SELECT CAST(id AS CHAR) AS id, CAST(province_id AS CHAR) AS province_id FROM districts ORDER BY id LIMIT 1');
    const city = name => call('post', '/cities', 'admin', { name, province_id: district.province_id, district_id: district.id });
    for (const valid of ['Ñandú del Sur', 'São Sebastião', 'Villa  Gesell', '  Güemes  ']) assert.equal(await status(city(valid)), 201, valid);
    const [trimmed] = await db.rows("SELECT name FROM cities WHERE name LIKE 'G%emes'");
    assert.equal(trimmed.name, 'Güemes', 'se guarda recortada');
    for (const invalid of ['Ciudad 9', 'Mar_del', 'Tandil!', 'Mar\tChiquita', '', '   ', '-', "Mar d'Ajó"]) assert.equal(await status(city(invalid)), 422, JSON.stringify(invalid));
    assert.equal(await status(call('post', '/cities', 'admin', { name: 'Balcarce', province_id: district.province_id, district_id: district.id, postal_code: '76#0' })), 422);
});

test('nombre y apellido de personas: letras, espacios, apóstrofo, punto y guion; números o vacíos dan 422', async () => {
    const register = (first_name, n) => request(ctx.app).post('/auth/register').send({ ...registration, email: `persona${n}@rules.example`, first_name });
    let n = 0;
    for (const valid of ["O'Connor", 'José-María', 'Ñ. Pérez', 'Zoë']) assert.equal((await register(valid, n++)).status, 201, valid);
    for (const invalid of ['Ana2', '123', '<script>', '', '  ', 'Ana_Paula']) assert.equal((await register(invalid, n++)).status, 422, JSON.stringify(invalid));
    assert.equal(await status(call('patch', '/auth/me', 'buyer', { last_name: 'Gómez 3' })), 422);
    assert.equal(await status(call('patch', '/auth/me', 'buyer', { last_name: 'Gómez-Ruiz' })), 200);
});

test('marketplace: teléfono, sitio web y código postal con formato; descripciones aceptan puntuación', async () => {
    const organization = body => call('post', '/marketplace/organizations', 'provider', { name: 'Sala Demo SRL', ...body });
    assert.equal(await status(organization({ phone: 'llamar al rato' })), 422);
    assert.equal(await status(organization({ phone: '12' })), 422);
    const org = (await organization({ phone: '+54 (223) 555-0101' }).expect(201)).body.data;
    const establishment = body => call('post', '/marketplace/establishments', 'provider', { organization_id: org.id, city_id: '1', name: 'Complejo Demo', address_line: 'Av. Colón 1234, 1° B', ...body });
    assert.equal(await status(establishment({ website: 'ftp://sala.example' })), 422);
    assert.equal(await status(establishment({ website: 'javascript:alert(1)' })), 422);
    assert.equal(await status(establishment({ postal_code: '76*00' })), 422);
    const created = await establishment({ website: 'https://sala.example', postal_code: 'B7600', description: '¡Sala renovada! Precio: $1.500 (IVA inc.) — consultá; 100% accesible.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.match(created.body.data.description, /¡Sala renovada!/);
});

test('entradas con tipos incorrectos nunca dan 500', async () => {
    for (const body of [{ name: 123 }, { name: ['x'] }, { name: { $gt: '' } }, { name: 'ok', phone: 5550101 }, { name: 'ok', email: 'no-es-email' }]) {
        const response = await call('post', '/marketplace/organizations', 'provider', body);
        assert.ok(response.status >= 400 && response.status < 500, `${JSON.stringify(body)} -> ${response.status}`);
    }
});
