import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, password, registration, resetData } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { admin: '101', admin2: '102', artist: '103', artist2: '104', buyer: '105', organizer: '106' };
const roles = { admin: ['ADMIN'], admin2: ['ADMIN', 'COMPRADOR'], artist: ['ARTISTA'], artist2: ['ARTISTA'], buyer: ['COMPRADOR'], organizer: ['ORGANIZADOR'] };
const call = (method, url, role, body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};
async function error(response, status, code) {
    const result = await response;
    assert.equal(result.status, status, JSON.stringify(result.body));
    assert.equal(result.body.error.code, code);
}
const audit = () => db.rows('SELECT action, CAST(actor_user_id AS CHAR) AS actor, CAST(target_user_id AS CHAR) AS target, details FROM admin_audit_log ORDER BY id');

before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, name, 'Test', `${name}@profiles.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, role]);
    }
});

test('admin: solo users.manage lista usuarios y filtra por perfil', async () => {
    await call('get', '/admin/users').expect(401);
    for (const role of ['organizer', 'artist', 'buyer']) await call('get', '/admin/users', role).expect(403);
    const artists = (await call('get', '/admin/users?role=ARTISTA', 'admin').expect(200)).body;
    assert.deepEqual(artists.data.map(u => [u.id, u.roles]), [[ids.artist, ['ARTISTA']], [ids.artist2, ['ARTISTA']]]);
    assert.equal((await call('get', `/admin/users/${ids.admin2}`, 'admin').expect(200)).body.data.roles.join(), 'ADMIN,COMPRADOR');
    await call('get', '/admin/users/999', 'admin').expect(404);
    await call('get', '/admin/users?role=BOSS', 'admin').expect(422);
});

test('admin: asignar y quitar perfiles queda auditado, es idempotente y surte efecto en el siguiente pedido', async () => {
    await call('get', '/organizer/statistics', 'buyer').expect(403);
    const granted = (await call('post', `/admin/users/${ids.buyer}/roles`, 'admin', { role: 'ORGANIZADOR', reason: 'Alta como productora' }).expect(201)).body.data;
    assert.deepEqual([granted.changed, granted.user.roles], [true, ['COMPRADOR', 'ORGANIZADOR']]);
    assert.equal((await call('post', `/admin/users/${ids.buyer}/roles`, 'admin', { role: 'ORGANIZADOR' }).expect(200)).body.data.changed, false);
    await call('get', '/organizer/statistics', 'buyer').expect(200);
    await call('delete', `/admin/users/${ids.buyer}/roles/ORGANIZADOR`, 'admin').expect(200);
    await call('get', '/organizer/statistics', 'buyer').expect(403);
    await error(call('delete', `/admin/users/${ids.buyer}/roles/ORGANIZADOR`, 'admin'), 404, 'ROLE_NOT_GRANTED');
    const log = await audit();
    assert.deepEqual(log.map(row => [row.action, row.actor, row.target]), [['ROLE_GRANTED', ids.admin, ids.buyer], ['ROLE_REVOKED', ids.admin, ids.buyer]]);
    assert.deepEqual([log[0].details.role, log[0].details.reason, log[0].details.target_email], ['ORGANIZADOR', 'Alta como productora', 'buyer@profiles.example']);
    const listed = (await call('get', `/admin/audit?target_user_id=${ids.buyer}`, 'admin').expect(200)).body;
    assert.deepEqual(listed.data.map(row => [row.action, row.role]), [['ROLE_REVOKED', 'ORGANIZADOR'], ['ROLE_GRANTED', 'ORGANIZADOR']]);
    await call('get', '/admin/audit', 'organizer').expect(403);
});

test('admin: validaciones, último perfil, último ADMIN y cuentas no elegibles', async () => {
    for (const body of [{ role: 'GUEST' }, { role: 'BOSS' }, {}, { role: 'ARTISTA', user_id: ids.admin }]) await call('post', `/admin/users/${ids.buyer}/roles`, 'admin', body).expect(422);
    await call('delete', `/admin/users/${ids.buyer}/roles/GUEST`, 'admin').expect(422);
    await call('post', '/admin/users/999/roles', 'admin', { role: 'ARTISTA' }).expect(404);
    await error(call('delete', `/admin/users/${ids.buyer}/roles/COMPRADOR`, 'admin'), 409, 'LAST_ROLE');
    await db.rows("UPDATE users SET status = 'BLOCKED' WHERE id = ?", [ids.artist2]);
    await error(call('post', `/admin/users/${ids.artist2}/roles`, 'admin', { role: 'VENUE' }), 422, 'USER_NOT_ELIGIBLE');
    await call('delete', `/admin/users/${ids.admin2}/roles/ADMIN`, 'admin').expect(200);
    await error(call('delete', `/admin/users/${ids.admin}/roles/ADMIN`, 'admin'), 409, 'LAST_ADMIN');
    assert.equal((await audit()).length, 1);
});

test('admin: dos admins quitándose ADMIN a la vez dejan siempre uno', async () => {
    roles.admin = ['ADMIN', 'COMPRADOR'];
    await db.rows("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'COMPRADOR'", [ids.admin]);
    try {
        const responses = await Promise.all([
            call('delete', `/admin/users/${ids.admin2}/roles/ADMIN`, 'admin'),
            call('delete', `/admin/users/${ids.admin}/roles/ADMIN`, 'admin2'),
        ]);
        // The loser either sees LAST_ADMIN (409) or, if the winner committed before it authenticated, has already lost users.manage (403).
        const statuses = responses.map(r => r.status).sort();
        assert.equal(statuses[0], 200, JSON.stringify(responses.map(r => r.body)));
        assert.ok([403, 409].includes(statuses[1]), JSON.stringify(responses.map(r => r.body)));
        assert.equal(Number((await db.rows("SELECT COUNT(*) AS n FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'ADMIN'"))[0].n), 1);
        assert.equal((await audit()).length, 1);
    } finally { roles.admin = ['ADMIN']; }
});

const profile = { stage_name: 'Los Test', bio: 'Rock del puerto', city_id: '1', genre_ids: ['1'] };
test('artistas: crear exige artist.profile.manage; el borrador solo lo ven sus miembros', async () => {
    for (const role of ['buyer', 'organizer']) await call('post', '/artists', role, profile).expect(403);
    await call('post', '/artists', null, profile).expect(401);
    const created = (await call('post', '/artists', 'artist', profile).expect(201)).body.data;
    assert.deepEqual([created.status, created.city_name, created.genres.map(g => g.id)], ['DRAFT', 'Mar del Plata', ['1']]);
    assert.deepEqual(created.members.map(m => [m.user_id, m.member_role, m.email]), [[ids.artist, 'OWNER', 'artist@profiles.example']]);
    assert.match(created.slug, /^los-test-[a-f0-9]{6}$/);
    assert.equal((await call('get', '/artists').expect(200)).body.pagination.total, 0);
    for (const role of [null, 'artist2', 'buyer']) await call('get', `/artists/${created.id}`, role).expect(404);
    await call('get', `/artists/${created.id}`, 'admin').expect(200);
    assert.deepEqual((await call('get', '/artists/mine', 'artist').expect(200)).body.data.map(a => a.id), [created.id]);
    for (const body of [{ ...profile, city_id: '999999' }, { ...profile, genre_ids: ['9999'] }]) await error(call('post', '/artists', 'artist', body), 422, 'INVALID_REFERENCE');
    for (const body of [{}, { stage_name: '' }, { ...profile, status: 'PUBLISHED' }, { ...profile, genre_ids: ['1', '1'] }]) await call('post', '/artists', 'artist', body).expect(422);
});

test('artistas: publicar, filtrar, miembros con OWNER obligatorio y override de admin', async () => {
    const { id } = (await call('post', '/artists', 'artist', profile).expect(201)).body.data;
    await call('post', `/artists/${id}/publish`, 'artist').expect(200);
    const listed = (await call('get', '/artists?genre_id=1&q=Test').expect(200)).body;
    assert.deepEqual(listed.data.map(a => a.id), [id]);
    assert.equal((await call('get', '/artists?genre_id=2').expect(200)).body.pagination.total, 0);
    const publicDetail = (await call('get', `/artists/${id}`).expect(200)).body.data;
    assert.equal('email' in publicDetail.members[0], false);
    const members = `/artists/${id}/members`;
    await error(call('post', members, 'artist', { email: 'buyer@profiles.example' }), 422, 'MEMBER_NOT_ARTIST');
    await error(call('post', members, 'artist', { email: 'nadie@profiles.example' }), 422, 'INVALID_MEMBER');
    await call('post', members, 'artist', { email: 'artist2@profiles.example' }).expect(201);
    await error(call('post', members, 'artist', { email: 'ARTIST2@profiles.example' }), 409, 'ALREADY_MEMBER');
    // A MEMBER edits content but neither publishes nor manages members.
    await call('patch', `/artists/${id}`, 'artist2', { bio: 'Nueva bio' }).expect(200);
    await call('post', `/artists/${id}/archive`, 'artist2').expect(403);
    await call('patch', `${members}/${ids.artist}`, 'artist2', { member_role: 'MEMBER' }).expect(403);
    await error(call('patch', `${members}/${ids.artist}`, 'artist', { member_role: 'MEMBER' }), 409, 'LAST_OWNER');
    await error(call('delete', `${members}/${ids.artist}`, 'artist'), 409, 'LAST_OWNER');
    await call('patch', `${members}/${ids.artist2}`, 'artist', { member_role: 'OWNER' }).expect(200);
    await call('delete', `${members}/${ids.artist}`, 'artist').expect(204);
    await call('patch', `/artists/${id}`, 'artist', { bio: 'x' }).expect(403);
    // artists.admin (ADMIN) overrides membership; archived profiles leave the public listing and are read-only.
    await call('post', `/artists/${id}/archive`, 'admin').expect(200);
    await call('get', `/artists/${id}`).expect(404);
    await error(call('patch', `/artists/${id}`, 'artist2', { bio: 'y' }), 409, 'INVALID_STATE');
    await call('post', `/artists/${id}/publish`, 'artist2').expect(200);
    await call('patch', `${members}/${ids.artist2}`, 'artist2', { member_role: 'BOSS' }).expect(422);
});

test('autoservicio: COMPRADOR y ARTISTA se activan solos y se auditan; el resto requiere ADMIN', async () => {
    await call('get', '/me/profiles').expect(401);
    const before = (await call('get', '/me/profiles', 'buyer').expect(200)).body.data;
    assert.deepEqual(before.self_service.map(p => [p.code, p.active]), [['COMPRADOR', true], ['ARTISTA', false]]);
    await call('post', '/artists', 'buyer', profile).expect(403);
    const activated = (await call('post', '/me/profiles', 'buyer', { role: 'ARTISTA' }).expect(201)).body.data;
    assert.deepEqual(activated.roles, ['COMPRADOR', 'ARTISTA']);
    assert.ok(activated.permissions.includes('artist.profile.manage'));
    assert.equal((await call('post', '/me/profiles', 'buyer', { role: 'ARTISTA' }).expect(200)).body.data.changed, false);
    await call('post', '/artists', 'buyer', profile).expect(201);
    assert.deepEqual((await call('get', '/auth/me', 'buyer').expect(200)).body.data.roles, ['COMPRADOR', 'ARTISTA']);
    for (const role of ['ORGANIZADOR', 'VENUE', 'EMPRESA_SERVICIOS', 'ADMIN']) await error(call('post', '/me/profiles', 'buyer', { role }), 403, 'ADMIN_APPROVAL_REQUIRED');
    for (const body of [{ role: 'GUEST' }, { role: 'BOSS' }, {}, { role: 'ARTISTA', user_id: ids.organizer }]) await call('post', '/me/profiles', 'buyer', body).expect(422);
    // An organizer can also become a buyer by itself; the change is attributed to the person.
    await call('post', '/me/profiles', 'organizer', { role: 'COMPRADOR' }).expect(201);
    const log = await audit();
    assert.deepEqual(log.map(row => [row.action, row.actor, row.target, row.details.role]),
        [['ROLE_SELF_ACTIVATED', ids.buyer, ids.buyer, 'ARTISTA'], ['ROLE_SELF_ACTIVATED', ids.organizer, ids.organizer, 'COMPRADOR']]);
    await db.rows('UPDATE users SET is_guest = 1, email = NULL WHERE id = ?', [ids.artist2]);
    await error(call('post', '/me/profiles', 'artist2', { role: 'COMPRADOR' }), 422, 'USER_NOT_ELIGIBLE');
});

test('suspensión: solo users.manage y con motivo; corta acceso, login y sesiones; reactivar lo devuelve; todo auditado', async () => {
    const email = 'suspendida@profiles.example';
    const { user } = await ctx.auth.register({ ...registration, email });
    await ctx.auth.verifyEmail(ctx.mailer.last('verification').token);
    const login = () => request(ctx.app).post('/auth/login').send({ email, password });
    const session = (await login().expect(200)).body.data;
    const me = () => request(ctx.app).get('/auth/me').set('Authorization', `Bearer ${session.accessToken}`);
    await me().expect(200);
    const path = `/admin/users/${user.id}`;
    for (const role of ['buyer', 'organizer']) await call('post', `${path}/suspend`, role, { reason: 'Fraude' }).expect(403);
    await call('post', `${path}/suspend`, 'admin', {}).expect(422);
    await error(call('post', `/admin/users/${ids.admin}/suspend`, 'admin', { reason: 'Prueba' }), 409, 'SELF_SUSPEND');
    assert.equal((await call('post', `${path}/suspend`, 'admin', { reason: 'Reclamos de fraude' }).expect(200)).body.data.status, 'BLOCKED');
    // The still-valid access token, the password and the refresh token stop working at once.
    await me().expect(401);
    await login().expect(401);
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await error(call('post', `${path}/suspend`, 'admin', { reason: 'Otra vez' }), 409, 'INVALID_STATE');
    assert.equal((await call('post', `${path}/reactivate`, 'admin', {}).expect(200)).body.data.status, 'ACTIVE');
    await login().expect(200);
    await error(call('post', `${path}/reactivate`, 'admin', {}), 409, 'INVALID_STATE');
    const rows = (await audit()).filter(row => row.target === String(user.id));
    assert.deepEqual(rows.map(row => row.action), ['USER_SUSPENDED', 'USER_REACTIVATED']);
    assert.deepEqual([rows[0].actor, rows[0].details.reason, rows[0].details.revoked_sessions], [ids.admin, 'Reclamos de fraude', 1]);
});
