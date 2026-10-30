import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { admin: '301', artist: '302', buyer: '303', blocked: '304' };
const roles = { admin: ['ADMIN'], artist: ['ARTISTA'], buyer: ['COMPRADOR'], blocked: ['COMPRADOR'] };
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};
const userRow = async id => (await db.rows('SELECT first_name, last_name, display_name, phone, email, status, password_hash FROM users WHERE id = ?', [id]))[0];
const roleCodes = async id => (await db.rows('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.code', [id])).map(r => r.code);

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at, status) VALUES (?, ?, ?, ?, NOW(), ?)',
            [id, name, 'Test', `${name}@profile.example`, name === 'blocked' ? 'BLOCKED' : 'ACTIVE']);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
});

// USR-02: edición del perfil propio.
test('USR-02 PATCH /auth/me: actualiza solo los campos seguros y devuelve el perfil persistido', async () => {
    const before = await userRow(ids.buyer);
    const response = await call('patch', '/auth/me', 'buyer', { first_name: 'Ana María', phone: '+54 11 1234-5678', display_name: 'Ana M.' }).expect(200);
    assert.equal(response.body.data.user.first_name, 'Ana María');
    assert.equal(response.body.data.user.display_name, 'Ana M.');
    assert.equal(response.body.data.user.phone, '+54 11 1234-5678');
    const after = await userRow(ids.buyer);
    assert.equal(after.last_name, before.last_name);
    assert.equal(after.email, before.email);
    assert.equal(after.password_hash, before.password_hash);
    assert.equal((await call('get', '/auth/me', 'buyer').expect(200)).body.data.user.display_name, 'Ana M.');
});

test('USR-02 PATCH /auth/me: permite limpiar campos opcionales con null', async () => {
    await call('patch', '/auth/me', 'buyer', { display_name: 'Ana', phone: '+5491112345678' }).expect(200);
    await call('patch', '/auth/me', 'buyer', { display_name: null, phone: null }).expect(200);
    const row = await userRow(ids.buyer);
    assert.equal(row.display_name, null);
    assert.equal(row.phone, null);
});

test('USR-02 PATCH /auth/me: rechaza cuerpo vacío, campos inválidos y campos no permitidos sin modificar nada', async () => {
    const before = await userRow(ids.buyer);
    const invalid = [
        {},
        { first_name: '' },
        { first_name: 'Ana\u0007' },
        { last_name: 'x'.repeat(81) },
        { display_name: '   ' },
        { display_name: 'x'.repeat(151) },
        { phone: 'abc' },
        { phone: '12' },
    ];
    for (const body of invalid) await call('patch', '/auth/me', 'buyer', body).expect(422);
    // Campos sensibles: el esquema estricto los rechaza aunque vengan junto a campos válidos.
    const sensitive = [
        { email: 'otro@profile.example' },
        { password: 'nueva-contraseña-123' },
        { password_hash: 'x' },
        { status: 'ACTIVE' },
        { roles: ['ADMIN'] },
        { role: 'ADMIN' },
        { email_verified_at: null },
        { is_guest: 1 },
        { id: ids.admin },
        { first_name: 'Ana', status: 'BLOCKED' },
        { first_name: 'Ana', roles: ['ADMIN'] },
    ];
    for (const body of sensitive) await call('patch', '/auth/me', 'buyer', body).expect(422);
    const after = await userRow(ids.buyer);
    assert.deepEqual(after, before);
    assert.deepEqual(await roleCodes(ids.buyer), ['COMPRADOR']);
});

test('USR-02 PATCH /auth/me: requiere autenticación y no permite editar cuentas bloqueadas', async () => {
    await call('patch', '/auth/me', undefined, { first_name: 'Intruso' }).expect(401);
    const blockedBefore = await userRow(ids.blocked);
    const response = await call('patch', '/auth/me', 'blocked', { first_name: 'Cambio' });
    assert.ok(response.status >= 400 && response.status < 500, `status ${response.status}`);
    assert.equal((await userRow(ids.blocked)).first_name, blockedBefore.first_name);
});

test('USR-02 PATCH /auth/me: un usuario solo modifica su propia cuenta', async () => {
    await call('patch', '/auth/me', 'artist', { first_name: 'Solo yo' }).expect(200);
    assert.equal((await userRow(ids.artist)).first_name, 'Solo yo');
    assert.equal((await userRow(ids.buyer)).first_name, 'buyer');
});

// USR-07: rollback ante un fallo durante la asignación administrativa de roles.
test('USR-07 fallo en la auditoría de una asignación de rol revierte el rol y deja la cuenta consistente', async () => {
    await db.pool.query(`CREATE TRIGGER tmp_fail_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo simulado'`);
    try {
        const failed = await call('post', `/admin/users/${ids.buyer}/roles`, 'admin', { role: 'ARTISTA', reason: 'prueba rollback' });
        assert.ok(failed.status >= 500, `status ${failed.status}`);
        assert.doesNotMatch(JSON.stringify(failed.body), /SQL|ER_|syntax|stack/i);
    } finally {
        await db.pool.query('DROP TRIGGER tmp_fail_audit');
    }
    assert.deepEqual(await roleCodes(ids.buyer), ['COMPRADOR'], 'el rol no debe quedar asignado');
    const audits = await db.rows("SELECT id FROM admin_audit_log WHERE action = 'ROLE_GRANTED' AND target_user_id = ?", [ids.buyer]);
    assert.equal(audits.length, 0);
    // Tras el rollback la misma operación funciona: no quedó lock ni estado parcial.
    await call('post', `/admin/users/${ids.buyer}/roles`, 'admin', { role: 'ARTISTA', reason: 'reintento' }).expect(201);
    assert.deepEqual(await roleCodes(ids.buyer), ['ARTISTA', 'COMPRADOR']);
});
