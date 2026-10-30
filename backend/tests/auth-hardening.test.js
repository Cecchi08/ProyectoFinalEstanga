import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { TestDatabase, password, registration, verifiedUser } from './helpers.js';

const database = new TestDatabase();
let ctx;
before(async () => { await database.open(); });
beforeEach(async () => { await database.clear(); ctx = database.context(); });
after(async () => { await database.close(); });

const PAYLOADS = ["' OR '1'='1", "admin'--", "x'; DROP TABLE users; --", "' UNION SELECT password_hash FROM users --"];

test('inyección SQL en login, registro y recuperación no altera datos ni filtra errores SQL', async () => {
    await verifiedUser(ctx.auth, ctx.mailer);
    const [before] = await database.rows('SELECT COUNT(*) AS total FROM users');
    for (const payload of PAYLOADS) {
        for (const response of [
            await request(ctx.app).post('/auth/login').send({ email: payload, password }),
            await request(ctx.app).post('/auth/login').send({ email: registration.email, password: payload }),
            await request(ctx.app).post('/auth/register').send({ ...registration, email: payload }),
            await request(ctx.app).post('/auth/forgot-password').send({ email: payload }),
        ]) {
            assert.ok(response.status < 500, `status ${response.status} con payload`);
            assert.doesNotMatch(JSON.stringify(response.body), /SQL|ER_|syntax|password_hash/i);
        }
    }
    const [after] = await database.rows('SELECT COUNT(*) AS total FROM users');
    assert.equal(after.total, before.total);
});

test('login con campos no string (objetos o arreglos) se rechaza con 4xx y sin 500', async () => {
    await verifiedUser(ctx.auth, ctx.mailer);
    await request(ctx.app).post('/auth/login').send({ email: { $ne: null }, password }).expect(res => assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`));
    await request(ctx.app).post('/auth/login').send({ email: registration.email, password: ['a'] }).expect(res => assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`));
});

test('access token firmado con otra clave o con rol elevado es rechazado por /auth/me', async () => {
    const user = await verifiedUser(ctx.auth, ctx.mailer);
    const claims = { roles: ['ADMIN'], sub: user.id };
    const options = { issuer: database.env.JWT_ISSUER, audience: database.env.JWT_AUDIENCE, expiresIn: 60, algorithm: 'HS256' };
    const forgedKey = jwt.sign(claims, 'otra-clave-distinta-de-prueba-0123456789abcdef', options);
    const validKeyElevated = jwt.sign(claims, database.env.JWT_ACCESS_SECRET, options);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ ...claims, iss: options.issuer, aud: options.audience, exp: Math.floor(Date.now() / 1000) + 60 })}.`;
    await request(ctx.app).get('/auth/me').auth(forgedKey, { type: 'bearer' }).expect(401);
    await request(ctx.app).get('/auth/me').auth(unsigned, { type: 'bearer' }).expect(401);
    // Firma válida pero rol ADMIN en el token: el rol debe leerse de la base, no del JWT.
    const elevated = await request(ctx.app).get('/auth/me').auth(validKeyElevated, { type: 'bearer' });
    assert.ok(elevated.status === 200 || elevated.status === 401, `status ${elevated.status}`);
    assert.doesNotMatch(JSON.stringify(elevated.body), /ADMIN/);
});
