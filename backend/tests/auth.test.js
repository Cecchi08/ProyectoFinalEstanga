import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticate, authorize, authorizeConcertOwner, authorizeStaffAssignment } from '../src/middlewares/auth.middleware.js';
import { errorHandler } from '../src/middlewares/error.middleware.js';
import { PermissionsService } from '../src/services/permissions.service.js';
import { hashToken } from '../src/utils/token.util.js';
import { TestDatabase, password, registration, verifiedUser } from './helpers.js';
const database = new TestDatabase();
let ctx;
before(async () => { await database.open(); });
beforeEach(async () => { await database.clear(); ctx = database.context(); });
after(async () => { await database.close(); });
const login = () => request(ctx.app).post('/auth/login').send({ email: registration.email, password });
async function session() { await verifiedUser(ctx.auth, ctx.mailer); return (await login().expect(200)).body.data; }
test('register: normaliza email, bcrypt, rol USER, preferencias y token hasheado', async () => {
    const response = await request(ctx.app).post('/auth/register').send({ ...registration, email: ' ANA@EXAMPLE.COM ' }).expect(201);
    assert.equal(response.body.data.user.email, registration.email);
    assert.deepEqual(response.body.data.roles, ['USER']);
    assert.equal(response.body.data.user.password_hash, undefined);
    const user = await database.db.read(r => r.findUserByEmail(registration.email));
    assert.ok(user?.password_hash);
    assert.ok(await bcrypt.compare(password, user.password_hash));
    assert.deepEqual(await database.db.read(r => r.preferences(user.id)), { recommendations_enabled: true, notifications_enabled: true });
    const rows = await database.rows('SELECT * FROM email_verification_tokens');
    assert.equal(rows[0]?.token_hash, hashToken(ctx.mailer.last('verification').token));
});
test('register rechaza email duplicado con 409', async () => {
    await ctx.auth.register(registration);
    await request(ctx.app).post('/auth/register').send(registration).expect(409);
    assert.equal((await database.rows('SELECT id FROM users')).length, 1);
});
test('registro concurrente crea una sola cuenta', async () => {
    const responses = await Promise.all([request(ctx.app).post('/auth/register').send(registration), request(ctx.app).post('/auth/register').send(registration)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
});
test('register nunca acepta roles ni propiedades extra', async () => {
    await request(ctx.app).post('/auth/register').send({ ...registration, roles: ['ADMIN'] }).expect(422);
    assert.equal((await database.rows('SELECT id FROM users')).length, 0);
});
test('validación rechaza email inválido y contraseña que bcrypt truncaría', async () => {
    await request(ctx.app).post('/auth/register').send({ ...registration, email: 'invalid' }).expect(422);
    await request(ctx.app).post('/auth/register').send({ ...registration, password: 'á'.repeat(40) }).expect(422);
});
test('rollback revierte usuario, preferencias y roles', async () => {
    await assert.rejects(database.db.transaction(async (repo) => {
        const user = await repo.createUser({ ...registration, password_hash: null, email_verified_at: null });
        await repo.initializeUser(user.id);
        throw new Error('rollback');
    }));
    assert.equal((await database.rows('SELECT id FROM users')).length, 0);
    assert.equal((await database.rows('SELECT user_id FROM user_preferences')).length, 0);
});
test('login correcto genera JWT mínimo y refresh persistido únicamente como hash', async () => {
    const data = await session();
    const claims = jwt.decode(data.accessToken);
    assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'roles', 'sub']);
    assert.equal(claims.sub, data.user.id);
    assert.deepEqual(claims.roles, ['USER']);
    assert.equal((await database.rows('SELECT token_hash FROM refresh_tokens'))[0]?.token_hash, hashToken(data.refreshToken));
    assert.equal(data.user.password_hash, undefined);
});
test('login incorrecto y usuario inexistente tienen la misma respuesta', async () => {
    await verifiedUser(ctx.auth, ctx.mailer);
    const incorrect = await request(ctx.app).post('/auth/login').send({ email: registration.email, password: 'wrong-password' }).expect(401);
    const absent = await request(ctx.app).post('/auth/login').send({ email: 'absent@example.com', password }).expect(401);
    assert.deepEqual(incorrect.body, absent.body);
});
test('login exige email verificado', async () => { await ctx.auth.register(registration); await login().expect(403); });
test('usuario inactivo no inicia sesión ni usa access/refresh anteriores', async () => {
    const data = await session();
    await database.pool.execute('UPDATE users SET is_active = FALSE');
    await login().expect(401);
    await request(ctx.app).get('/auth/me').auth(data.accessToken, { type: 'bearer' }).expect(401);
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: data.refreshToken }).expect(401);
});
test('/auth/me sin token o token inválido devuelve 401', async () => {
    await request(ctx.app).get('/auth/me').expect(401);
    await request(ctx.app).get('/auth/me').set('Authorization', 'Bearer fake').expect(401);
});
test('JWT expirado, algoritmo distinto y audiencia incorrecta son rechazados', async () => {
    const user = await verifiedUser(ctx.auth, ctx.mailer);
    const base = { roles: ['USER'], sub: user.id };
    for (const options of [{ expiresIn: -1, algorithm: 'HS256' }, { expiresIn: 60, algorithm: 'HS384' }, { expiresIn: 60, audience: 'other' }]) {
        const token = jwt.sign(base, database.env.JWT_ACCESS_SECRET, { issuer: database.env.JWT_ISSUER, audience: database.env.JWT_AUDIENCE, ...options });
        await request(ctx.app).get('/auth/me').auth(token, { type: 'bearer' }).expect(401);
    }
});
test('/auth/me retorna usuario, todos los roles y preferencias sin secretos', async () => {
    const data = await session();
    await database.pool.execute("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code IN ('ORGANIZER', 'STAFF')", [data.user.id]);
    const response = await request(ctx.app).get('/auth/me').auth(data.accessToken, { type: 'bearer' }).expect(200);
    assert.deepEqual(response.body.data.roles, ['USER', 'ORGANIZER', 'STAFF']);
    assert.equal(response.body.data.user.password_hash, undefined);
    assert.equal(response.body.data.refreshToken, undefined);
    assert.equal(response.body.data.preferences.notifications_enabled, true);
});
test('login y refresh incluyen todos los roles', async () => {
    const data = await session();
    await database.pool.execute("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'STAFF'", [data.user.id]);
    assert.deepEqual((await login().expect(200)).body.data.roles, ['USER', 'STAFF']);
    const refreshed = await request(ctx.app).post('/auth/refresh').send({ refreshToken: data.refreshToken }).expect(200);
    assert.deepEqual(ctx.tokens.verify(refreshed.body.data.accessToken).roles, ['USER', 'STAFF']);
});
test('authorize permite cualquier rol requerido y consulta roles actuales', async () => {
    const data = await session();
    const app = express();
    app.get('/protected', authenticate(ctx.tokens, ctx.auth), authorize('STAFF', 'ADMIN'), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler());
    await request(app).get('/protected').expect(401);
    await request(app).get('/protected').auth(data.accessToken, { type: 'bearer' }).set('X-Role', 'ADMIN').expect(403);
    await database.pool.execute("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'STAFF'", [data.user.id]);
    await request(app).get('/protected').auth(data.accessToken, { type: 'bearer' }).expect(200);
    await database.pool.execute("DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'STAFF'");
    await request(app).get('/protected').auth(data.accessToken, { type: 'bearer' }).expect(403);
});
test('refresh rota, revoca el anterior y permite usar el nuevo', async () => {
    const data = await session();
    const rotated = (await request(ctx.app).post('/auth/refresh').send({ refreshToken: data.refreshToken }).expect(200)).body.data;
    assert.notEqual(rotated.refreshToken, data.refreshToken);
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: data.refreshToken }).expect(401);
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: rotated.refreshToken }).expect(200);
});
test('dos refresh concurrentes no pueden reutilizar el mismo token', async () => {
    const data = await session();
    const results = await Promise.all([1, 2].map(() => request(ctx.app).post('/auth/refresh').send({ refreshToken: data.refreshToken })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
    assert.equal((await database.rows('SELECT id FROM refresh_tokens WHERE revoked_at IS NULL')).length, 1);
});
test('refresh expirado, revocado, inexistente o malformado se rechaza', async () => {
    const data = await session();
    await database.pool.execute('UPDATE refresh_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND');
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: data.refreshToken }).expect(401);
    await database.pool.execute('UPDATE refresh_tokens SET expires_at = UTC_TIMESTAMP() + INTERVAL 1 DAY, revoked_at = UTC_TIMESTAMP()');
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: data.refreshToken }).expect(401);
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: '0'.repeat(64) }).expect(401);
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: 'bad' }).expect(422);
});
test('logout idempotente revoca solo la sesión indicada', async () => {
    const first = await session();
    const second = (await login().expect(200)).body.data;
    for (let i = 0; i < 2; i++)
        await request(ctx.app).post('/auth/logout').send({ refreshToken: first.refreshToken }).expect(200);
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: second.refreshToken }).expect(200);
    await request(ctx.app).get('/auth/me').auth(first.accessToken, { type: 'bearer' }).expect(200);
});
test('verificación de email actualiza fecha y el token tiene un solo uso', async () => {
    await ctx.auth.register(registration);
    const token = ctx.mailer.last('verification').token;
    await request(ctx.app).post('/auth/verify-email').send({ token }).expect(200);
    await request(ctx.app).post('/auth/verify-email').send({ token }).expect(401);
    await login().expect(200);
});
test('verificación expirada y desconocida no modifican usuario', async () => {
    await ctx.auth.register(registration);
    await database.pool.execute('UPDATE email_verification_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND');
    await request(ctx.app).post('/auth/verify-email').send({ token: ctx.mailer.last('verification').token }).expect(401);
    await request(ctx.app).post('/auth/verify-email').send({ token: '0'.repeat(64) }).expect(401);
    assert.equal((await database.rows('SELECT email_verified_at FROM users'))[0]?.email_verified_at, null);
});
test('resend invalida el token anterior y responde genéricamente', async () => {
    await ctx.auth.register(registration);
    const old = ctx.mailer.last('verification').token;
    const known = await request(ctx.app).post('/auth/resend-verification').send({ email: registration.email }).expect(200);
    const absent = await request(ctx.app).post('/auth/resend-verification').send({ email: 'absent@example.com' }).expect(200);
    assert.deepEqual(known.body, absent.body);
    await request(ctx.app).post('/auth/verify-email').send({ token: old }).expect(401);
    await request(ctx.app).post('/auth/verify-email').send({ token: ctx.mailer.last('verification').token }).expect(200);
});
test('forgot no enumera usuarios y reset cambia bcrypt y revoca todas las sesiones', async () => {
    const data = await session();
    await login().expect(200);
    const known = await request(ctx.app).post('/auth/forgot-password').send({ email: registration.email }).expect(200);
    const absent = await request(ctx.app).post('/auth/forgot-password').send({ email: 'absent@example.com' }).expect(200);
    assert.deepEqual(known.body, absent.body);
    const token = ctx.mailer.last('reset').token;
    assert.equal((await database.rows('SELECT token_hash FROM password_reset_tokens'))[0]?.token_hash, hashToken(token));
    await request(ctx.app).post('/auth/reset-password').send({ token, password: 'new-password-456' }).expect(200);
    await request(ctx.app).post('/auth/reset-password').send({ token, password: 'other-password-789' }).expect(401);
    await login().expect(401);
    await request(ctx.app).post('/auth/login').send({ email: registration.email, password: 'new-password-456' }).expect(200);
    await request(ctx.app).post('/auth/refresh').send({ refreshToken: data.refreshToken }).expect(401);
});
test('reset expirado no cambia la contraseña', async () => {
    await session();
    await ctx.auth.requestEmail(registration.email, 'reset');
    await database.pool.execute('UPDATE password_reset_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND');
    await request(ctx.app).post('/auth/reset-password').send({ token: ctx.mailer.last('reset').token, password: 'another-password-123' }).expect(401);
    await login().expect(200);
});
test('reset concurrente con refresh no deja sesiones previas activas', async () => {
    const data = await session();
    await ctx.auth.requestEmail(registration.email, 'reset');
    const [reset, refresh] = await Promise.all([
        request(ctx.app).post('/auth/reset-password').send({ token: ctx.mailer.last('reset').token, password: 'new-password-789' }),
        request(ctx.app).post('/auth/refresh').send({ refreshToken: data.refreshToken }),
    ]);
    assert.equal(reset.status, 200);
    assert.ok([200, 401].includes(refresh.status));
    assert.equal((await database.rows('SELECT id FROM refresh_tokens WHERE revoked_at IS NULL')).length, 0);
});
test('MySQL usa UTC en cada conexión', async () => {
    await database.db.read(async () => undefined);
    const row = (await database.rows('SELECT @@session.time_zone AS zone, ABS(TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())) AS delta'))[0];
    assert.equal(row?.zone, '+00:00');
    assert.equal(String(row?.delta), '0');
});
test('IDs BIGINT mayores al rango seguro se conservan como strings', async () => {
    await database.pool.execute('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', ['9007199254740993', 'Big', 'Id', 'big@example.com']);
    await database.db.transaction(repo => repo.initializeUser('9007199254740993'));
    const result = await ctx.auth.oauthSession('9007199254740993');
    assert.equal(result.user.id, '9007199254740993');
    assert.equal(ctx.tokens.verify(result.accessToken).id, '9007199254740993');
});
test('guards owner y staff validan existencia, propiedad, asignación y ADMIN', async () => {
    const data = await session();
    const id = data.user.id;
    await database.pool.execute("INSERT INTO organizer_profiles (user_id, display_name) VALUES (?, 'Organizer')", [id]);
    await database.pool.execute("INSERT INTO provinces (id,name) VALUES (1,'Test') ON DUPLICATE KEY UPDATE name=name");
    await database.pool.execute("INSERT INTO cities (id,province_id,name) VALUES (1,1,'Test') ON DUPLICATE KEY UPDATE name=name");
    await database.pool.execute("INSERT INTO venues (id,city_id,name,address) VALUES (1,1,'Test','Test') ON DUPLICATE KEY UPDATE name=name");
    await database.pool.execute("INSERT INTO concerts (id,organizer_id,venue_id,concert_type_id,status_id,name,start_datetime) VALUES (1,?,1,1,1,'Fixture',UTC_TIMESTAMP())", [id]);
    const permissions = new PermissionsService(database.db);
    const app = express();
    app.use(authenticate(ctx.tokens, ctx.auth));
    app.get('/owner/:concertId', authorizeConcertOwner(permissions), (_req, res) => res.sendStatus(200));
    app.get('/staff/:concertId', authorizeStaffAssignment(permissions), (_req, res) => res.sendStatus(200));
    app.use(errorHandler());
    const get = (path) => request(app).get(path).auth(data.accessToken, { type: 'bearer' });
    await get('/owner/1').expect(403);
    await get('/owner/2').expect(404);
    await get('/owner/invalid').expect(422);
    await database.pool.execute("INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code IN ('ORGANIZER','STAFF')", [id]);
    await get('/owner/1').expect(200);
    await get('/staff/1').expect(403);
    await database.pool.execute('INSERT INTO staff_assignments (concert_id,user_id,assigned_by_user_id) VALUES (1,?,?)', [id, id]);
    await get('/staff/1').expect(200);
    await database.pool.execute('DELETE FROM staff_assignments');
    await database.pool.execute("INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code = 'ADMIN'", [id]);
    await get('/staff/1').expect(200);
    await database.pool.execute('DELETE FROM concerts');
});
test('errores 400/404/422, CORS, Helmet y Cache-Control consistentes', async () => {
    await request(ctx.app).post('/auth/login').set('Content-Type', 'application/json').send('{').expect(400);
    await request(ctx.app).get('/unknown').expect(404);
    await request(ctx.app).post('/auth/login').send({}).expect(422);
    await request(ctx.app).get('/auth/me').set('Origin', 'https://attacker.example').expect(403);
    const response = await request(ctx.app).get('/auth/me').set('Origin', 'http://localhost:8081').expect(401);
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:8081');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['cache-control'], 'no-store');
});
test('rate limit sensible devuelve 429 sin omitir autenticación', async () => {
    for (let i = 0; i < 10; i++)
        await request(ctx.app).post('/auth/forgot-password').send({ email: 'absent@example.com' }).expect(200);
    const response = await request(ctx.app).post('/auth/forgot-password').send({ email: 'absent@example.com' }).expect(429);
    assert.equal(response.body.error.code, 'RATE_LIMITED');
    assert.ok(response.headers['retry-after']);
});
