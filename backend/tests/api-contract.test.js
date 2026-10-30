import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { admin: '401', buyer: '402' };
const roles = { admin: ['ADMIN'], buyer: ['COMPRADOR'] };
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};

// Rutas reales del router de Express (no una lista escrita a mano): así una ruta nueva entra al contrato.
const HTTP = ['get', 'post', 'put', 'patch', 'delete'];
function routesOf(app) {
    const found = [];
    const walk = stack => {
        for (const layer of stack) {
            if (layer.route) {
                const paths = [layer.route.path].flat().filter(p => typeof p === 'string');
                const methods = layer.route.methods._all || layer.route.methods.all ? HTTP : Object.keys(layer.route.methods);
                for (const path of paths) for (const method of methods) found.push({ method, path });
            }
            else if (layer.handle?.stack) walk(layer.handle.stack);
        }
    };
    walk(app.router.stack);
    return found;
}

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, name, 'Test', `${name}@contract.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
});

test('contrato: todas las rutas (sin token) responden sin 5xx ni fugas; las escrituras nunca dan éxito sin autenticación', async () => {
    const routes = routesOf(ctx.app);
    assert.ok(routes.length > 100, `rutas detectadas: ${routes.length}`);
    // 410: stubs deliberados de endpoints retirados (management.routes.ts, gone()).
    const WRITE_REJECTED = [400, 401, 403, 404, 405, 409, 410, 422, 429];
    for (const { method, path } of routes) {
        for (const value of ['abc', '999999']) {
            const url = path.replace(/:[A-Za-z]+/g, value);
            const req = request(ctx.app)[method](url);
            const response = method === 'get' ? await req : await req.set('Content-Type', 'application/json').send('{}');
            assert.ok(response.status < 500, `${method.toUpperCase()} ${url} -> ${response.status}`);
            assert.doesNotMatch(response.text, /SQL|ER_[A-Z_]+|stack trace|at .*\.js:\d+/, `${method.toUpperCase()} ${url} filtra detalle interno`);
            if (method !== 'get') assert.ok(WRITE_REJECTED.includes(response.status), `${method.toUpperCase()} ${url} sin auth -> ${response.status}`);
        }
    }
});

test('contrato: rutas con token de COMPRADOR y IDs inválidos no devuelven 5xx', async () => {
    for (const { path } of routesOf(ctx.app).filter(r => r.method === 'get')) {
        const url = path.replace(/:[A-Za-z]+/g, 'abc');
        const response = await call('get', url, 'buyer');
        assert.ok(response.status < 500, `GET ${url} -> ${response.status}`);
        assert.doesNotMatch(response.text, /SQL|ER_[A-Z_]+|stack trace/, `GET ${url} filtra detalle interno`);
    }
});

test('JSON malformado y métodos no permitidos responden 4xx con envelope de error', async () => {
    const malformed = await request(ctx.app).post('/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.success, false);
    assert.ok(malformed.body.error?.code, 'envelope de error');
    const method = await request(ctx.app).put('/auth/me').set('Authorization', `Bearer ${ctx.tokens.sign(ids.buyer, roles.buyer)}`);
    assert.ok([404, 405].includes(method.status), `PUT /auth/me -> ${method.status}`);
});

test('paginación y filtros: límites fuera de rango y valores inválidos → 422; límites válidos → 200 con meta', async () => {
    await call('get', '/artists?limit=101', 'buyer').expect(422);
    await call('get', '/artists?page=0', 'buyer').expect(422);
    await call('get', '/artists?genre_id=abc', 'buyer').expect(422);
    await call('get', '/admin/users?limit=1000', 'admin').expect(422);
    await call('get', '/admin/users?page=0', 'admin').expect(422);
    const page = (await call('get', '/admin/users?page=1&limit=1', 'admin').expect(200)).body;
    assert.equal(page.data.length, 1);
    assert.deepEqual(page.pagination, { page: 1, limit: 1, total: 2, total_pages: 2 });
    const artists = (await call('get', '/artists?page=1&limit=5', 'buyer').expect(200)).body;
    assert.ok(Array.isArray(artists.data));
});

// Rutas sin ninguna referencia previa en los tests.
test('GET /admin/organizations: sin token 401, COMPRADOR 403, ADMIN 200 paginado', async () => {
    await call('get', '/admin/organizations').expect(401);
    await call('get', '/admin/organizations', 'buyer').expect(403);
    const body = (await call('get', '/admin/organizations?page=1&limit=5', 'admin').expect(200)).body;
    assert.ok(Array.isArray(body.data));
    assert.equal(body.pagination.limit, 5);
    await call('get', '/admin/organizations?limit=500', 'admin').expect(422);
});

test('GET /marketplace/establishments/mine: sin token 401, COMPRADOR 403, ADMIN 200', async () => {
    await call('get', '/marketplace/establishments/mine').expect(401);
    await call('get', '/marketplace/establishments/mine', 'buyer').expect(403);
    const body = (await call('get', '/marketplace/establishments/mine', 'admin').expect(200)).body;
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
});

test('GET /services/categories: catálogo público, sin token responde 200 con lista', async () => {
    const body = (await request(ctx.app).get('/services/categories').expect(200)).body;
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
});

test('GET /services/providers/mine: sin token 401, COMPRADOR 403, ADMIN 200', async () => {
    await call('get', '/services/providers/mine').expect(401);
    await call('get', '/services/providers/mine', 'buyer').expect(403);
    const body = (await call('get', '/services/providers/mine', 'admin').expect(200)).body;
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
});
