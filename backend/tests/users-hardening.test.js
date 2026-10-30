import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { admin: '201', artist: '202', artist2: '203', buyer: '204', buyer2: '205', organizer: '206' };
const roles = { admin: ['ADMIN'], artist: ['ARTISTA'], artist2: ['ARTISTA'], buyer: ['COMPRADOR'], buyer2: ['COMPRADOR'], organizer: ['ORGANIZADOR'] };
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, name, 'Test', `${name}@users.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
});

// USR-01: paginación y filtros de listado (los filtros por rol ya están en profiles.test.js).
test('USR-01 admin: paginación, búsqueda por nombre y filtro por estado', async () => {
    const page1 = (await call('get', '/admin/users?limit=2&page=1', 'admin').expect(200)).body;
    const page2 = (await call('get', '/admin/users?limit=2&page=2', 'admin').expect(200)).body;
    assert.equal(page1.data.length, 2);
    assert.equal(page2.data.length, 2);
    assert.equal(page1.pagination.total, 6);
    assert.equal(page1.pagination.total_pages, 3);
    assert.equal(new Set([...page1.data, ...page2.data].map(u => u.id)).size, 4, 'páginas sin repetidos');

    const byName = (await call('get', '/admin/users?q=buyer2', 'admin').expect(200)).body;
    assert.deepEqual(byName.data.map(u => u.id), [ids.buyer2]);

    const active = (await call('get', '/admin/users?status=ACTIVE', 'admin').expect(200)).body;
    assert.equal(active.pagination.total, 6);
    await db.rows("UPDATE users SET status = 'BLOCKED' WHERE id = ?", [ids.buyer2]);
    const blocked = (await call('get', '/admin/users?status=BLOCKED', 'admin').expect(200)).body;
    assert.deepEqual(blocked.data.map(u => u.id), [ids.buyer2]);
    await call('get', '/admin/users?limit=0', 'admin').expect(422);
    await call('get', '/admin/users?orden=desc', 'admin').expect(422);
});

// USR-03: detalle de otro usuario solo para quien tiene users.manage.
test('USR-03 detalle de usuarios ajenos: solo users.manage; el propio perfil sigue en /auth/me', async () => {
    await call('get', `/admin/users/${ids.buyer}`, 'buyer').expect(403);
    await call('get', `/admin/users/${ids.buyer}`, 'artist').expect(403);
    await call('get', `/admin/users/${ids.buyer}`).expect(401);
    await call('get', `/admin/users/${ids.buyer}`, 'admin').expect(200);
    const me = (await call('get', '/auth/me', 'buyer').expect(200)).body.data;
    assert.equal(me.user.id, ids.buyer);
});

// USR-04: sin escalamiento desde el cliente.
test('USR-04 un COMPRADOR o ARTISTA no puede asignarse ADMIN ni roles ajenos por body, ruta o query', async () => {
    await call('post', `/admin/users/${ids.buyer}/roles`, 'buyer', { role: 'ADMIN' }).expect(403);
    await call('post', `/admin/users/${ids.buyer}/roles`, 'artist', { role: 'ORGANIZADOR' }).expect(403);
    await call('delete', `/admin/users/${ids.buyer}/roles/COMPRADOR`, 'buyer').expect(403);
    await call('post', `/admin/users/${ids.buyer}/roles`, 'admin', { role: 'ARTISTA', user_id: ids.admin }).expect(422);
    await call('post', `/me/profiles`, 'buyer', { role: 'ADMIN' }).expect(403);
    const roleRows = await db.rows('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?', [ids.buyer]);
    assert.deepEqual(roleRows.map(r => r.code), ['COMPRADOR']);
});

// USR-08: IDs manipulados y payloads inesperados sin 500 ni detalles internos.
test('USR-08 IDs manipulados y payloads inesperados responden 4xx sin filtrar SQL', async () => {
    const badIds = ['abc', '-1', '1.5', '999999999999999999999999', '%27%20OR%201%3D1', '0'];
    for (const id of badIds) {
        const response = await call('get', `/admin/users/${id}`, 'admin');
        assert.ok(response.status >= 400 && response.status < 500, `id ${id} -> ${response.status}`);
        assert.doesNotMatch(JSON.stringify(response.body), /SQL|ER_|syntax|stack/i);
    }
    // JSON crudo: un literal JS __proto__ no llega como propiedad, por eso el payload se manda como texto.
    const rawPayloads = ['{"role":"COMPRADOR","__proto__":{"role":"ADMIN"}}', '{"role":["ADMIN"]}', '{"role":"ADMIN","reason":{"$gt":""}}'];
    for (const raw of rawPayloads) {
        const response = await request(ctx.app).post(`/admin/users/${ids.buyer}/roles`)
            .set('Authorization', `Bearer ${ctx.tokens.sign(ids.admin, roles.admin)}`)
            .set('Content-Type', 'application/json').send(raw);
        assert.ok(response.status >= 400 && response.status < 500, `payload -> ${response.status}`);
    }
    const roleRows = await db.rows('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?', [ids.buyer]);
    assert.deepEqual(roleRows.map(r => r.code), ['COMPRADOR']);
});
