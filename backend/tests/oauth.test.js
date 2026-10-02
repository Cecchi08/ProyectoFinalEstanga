import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { HttpOAuthProviderClient } from '../src/services/oauth-provider.service.js';
import { pkceChallenge } from '../src/utils/token.util.js';
import { EphemeralStore } from '../src/utils/ephemeral.util.js';
import { TestDatabase, registration, verifiedUser } from './helpers.js';
const database = new TestDatabase();
let ctx;
before(async () => { await database.open(); });
beforeEach(async () => { await database.clear(); ctx = database.context(); });
after(async () => { await database.close(); });
async function start(provider = 'google', query = {}) {
    const response = await request(ctx.app).get(`/auth/oauth/${provider}`).query(query).expect(302);
    const url = new URL(response.headers.location);
    const cookies = response.headers['set-cookie'];
    return { state: url.searchParams.get('state'), cookie: cookies[0].split(';')[0], url, response };
}
for (const provider of ['google', 'github', 'facebook']) {
    test(`${provider}: inicia flujo, crea cuenta, vincula proveedor y emite sesión`, async () => {
        const flow = await start(provider);
        assert.equal(flow.url.searchParams.get('response_type'), 'code');
        assert.ok(flow.response.headers['set-cookie']?.[0]?.includes('HttpOnly'));
        const result = await request(ctx.app).get(`/auth/oauth/${provider}/callback`).set('Cookie', flow.cookie).query({ state: flow.state, code: 'provider-code' }).expect(200);
        assert.deepEqual(result.body.data.roles, ['USER']);
        assert.ok(result.body.data.refreshToken);
        assert.equal((await database.rows('SELECT * FROM oauth_accounts')).length, 1);
        const again = await start(provider);
        await request(ctx.app).get(`/auth/oauth/${provider}/callback`).set('Cookie', again.cookie).query({ state: again.state, code: 'another-code' }).expect(200);
        assert.equal((await database.rows('SELECT * FROM users')).length, 1);
    });
}
test('OAuth rechaza state desconocido, cookie ausente, mezcla de proveedores y replay', async () => {
    const flow = await start();
    await request(ctx.app).get('/auth/oauth/google/callback').set('Cookie', flow.cookie).query({ state: '0'.repeat(64), code: 'code' }).expect(400);
    await request(ctx.app).get('/auth/oauth/google/callback').query({ state: flow.state, code: 'code' }).expect(400);
    await request(ctx.app).get('/auth/oauth/github/callback').set('Cookie', flow.cookie.replace('google', 'github')).query({ state: flow.state, code: 'code' }).expect(400);
    await request(ctx.app).get('/auth/oauth/google/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'code' }).expect(200);
    await request(ctx.app).get('/auth/oauth/google/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'code' }).expect(400);
});
test('OAuth cancelado consume el state y no crea cuenta', async () => {
    const flow = await start();
    await request(ctx.app).get('/auth/oauth/google/callback').set('Cookie', flow.cookie).query({ state: flow.state, error: 'access_denied' }).expect(400);
    assert.equal((await database.rows('SELECT id FROM users')).length, 0);
});
test('OAuth auto-vincula email existente solo con garantía de verificación', async () => {
    const user = await verifiedUser(ctx.auth, ctx.mailer);
    ctx.provider.profile.email = registration.email;
    const flow = await start();
    const result = await request(ctx.app).get('/auth/oauth/google/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'code' }).expect(200);
    assert.equal(result.body.data.user.id, user.id);
});
test('OAuth email no verificado nunca se auto-vincula con cuenta existente', async () => {
    await verifiedUser(ctx.auth, ctx.mailer);
    ctx.provider.profile.email = registration.email;
    ctx.provider.profile.emailVerified = false;
    const flow = await start('facebook');
    await request(ctx.app).get('/auth/oauth/facebook/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'code' }).expect(409);
    assert.equal((await database.rows('SELECT id FROM oauth_accounts')).length, 0);
});
test('OAuth evita apropiación de cuentas prerregistradas con email ajeno', async () => {
    await ctx.auth.register(registration);
    ctx.provider.profile.email = registration.email;
    const flow = await start();
    await request(ctx.app).get('/auth/oauth/google/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'code' }).expect(409);
});
test('OAuth nuevo sin garantía de email exige verificación local y luego permite login', async () => {
    ctx.provider.profile.emailVerified = false;
    const flow = await start('facebook');
    await request(ctx.app).get('/auth/oauth/facebook/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'code' }).expect(403);
    assert.equal((await database.rows('SELECT id FROM oauth_accounts')).length, 1);
    assert.equal((await database.rows('SELECT id FROM refresh_tokens')).length, 0);
    await ctx.auth.verifyEmail(ctx.mailer.last('verification').token);
    const next = await start('facebook');
    await request(ctx.app).get('/auth/oauth/facebook/callback').set('Cookie', next.cookie).query({ state: next.state, code: 'new-code' }).expect(200);
});
test('vinculación explícita autenticada admite proveedor sin email verificado', async () => {
    const user = await verifiedUser(ctx.auth, ctx.mailer);
    const session = await ctx.auth.oauthSession(user.id);
    ctx.provider.profile.email = null;
    ctx.provider.profile.emailVerified = false;
    await request(ctx.app).post('/auth/oauth/facebook/link').send({}).expect(401);
    const response = await request(ctx.app).post('/auth/oauth/facebook/link').auth(session.accessToken, { type: 'bearer' }).send({}).expect(200);
    const state = new URL(response.body.data.authorizationUrl).searchParams.get('state');
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    const result = await request(ctx.app).get('/auth/oauth/facebook/callback').set('Cookie', cookie).query({ state, code: 'code' }).expect(200);
    assert.equal(result.body.data.user.id, user.id);
});
test('OAuth nuevo sin email devuelve 422 sin inventar dirección', async () => {
    ctx.provider.profile.email = null;
    const flow = await start();
    await request(ctx.app).get('/auth/oauth/google/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'code' }).expect(422);
});
test('deep link entrega solo código de un uso ligado al PKCE del cliente', async () => {
    const verifier = 'a'.repeat(64);
    const flow = await start('google', { mode: 'mobile', codeChallenge: pkceChallenge(verifier) });
    const response = await request(ctx.app).get('/auth/oauth/google/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'code' }).expect(302);
    const url = new URL(response.headers.location);
    assert.equal(url.protocol, 'venti:');
    assert.deepEqual([...url.searchParams.keys()], ['code']);
    const code = url.searchParams.get('code');
    assert.equal((await database.rows('SELECT id FROM refresh_tokens')).length, 0);
    await request(ctx.app).post('/auth/oauth/exchange').send({ code, codeVerifier: 'b'.repeat(64) }).expect(401);
    const result = await request(ctx.app).post('/auth/oauth/exchange').send({ code, codeVerifier: verifier }).expect(200);
    assert.ok(result.body.data.accessToken);
    assert.ok(result.body.data.refreshToken);
    await request(ctx.app).post('/auth/oauth/exchange').send({ code, codeVerifier: verifier }).expect(401);
});
test('mobile exige challenge y no permite redirect URL del cliente', async () => {
    await request(ctx.app).get('/auth/oauth/google').query({ mode: 'mobile' }).expect(422);
    await request(ctx.app).get('/auth/oauth/google').query({ redirect_uri: 'https://attacker.example' }).expect(422);
});
test('capacidades efímeras expiran y son de un solo uso', () => {
    const expired = new EphemeralStore(-1);
    const token = expired.put('value');
    assert.equal(expired.take(token, () => true), null);
    const store = new EphemeralStore(1000);
    const valid = store.put('value');
    assert.equal(store.take(valid, () => false), null);
    assert.equal(store.take(valid, () => true), 'value');
    assert.equal(store.take(valid, () => true), null);
});
function providerClient(responses, inspect) {
    const fetcher = async (input, init) => {
        inspect?.(String(input), init);
        return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    return new HttpOAuthProviderClient(database.env, fetcher);
}
test('adaptador Google usa userinfo email_verified y PKCE en el canje', async () => {
    let sentVerifier = false;
    const client = providerClient([{ access_token: 'access' }, { sub: 'google-id', email: 'USER@EXAMPLE.COM', email_verified: true, given_name: 'Test' }], (url, init) => {
        if (url.includes('/token'))
            sentVerifier = new URLSearchParams(init?.body).get('code_verifier') === 'verifier';
    });
    const identity = await client.identity('google', 'code', 'verifier');
    assert.ok(sentVerifier);
    assert.equal(identity.emailVerified, true);
    assert.equal(identity.email, 'user@example.com');
});
test('adaptador GitHub elige email privado verificado', async () => {
    const client = providerClient([{ access_token: 'access' }, { id: 123, login: 'test', email: 'untrusted@example.com' },
        [{ email: 'unsafe@example.com', verified: false, primary: true }, { email: 'verified@example.com', verified: true, primary: false }]]);
    const identity = await client.identity('github', 'code', 'verifier');
    assert.equal(identity.subject, '123');
    assert.equal(identity.email, 'verified@example.com');
    assert.equal(identity.emailVerified, true);
});
test('adaptador Facebook no confunde verified del perfil con verificación de email', async () => {
    let proof = false;
    const client = providerClient([{ access_token: 'access' }, { id: 'facebook-id', email: 'facebook@example.com', verified: true }], (url, init) => {
        if (url.includes('/me?')) {
            proof = new URL(url).searchParams.has('appsecret_proof');
            assert.equal((init?.headers).Authorization, 'Bearer access');
        }
    });
    const identity = await client.identity('facebook', 'code', 'verifier');
    assert.equal(identity.emailVerified, false);
    assert.ok(proof);
});
test('fallos del proveedor no exponen tokens ni secretos', async () => {
    const client = providerClient([{ error: 'secret-provider-error' }]);
    await assert.rejects(client.identity('google', 'code', 'verifier'), error => error instanceof Error && !error.message.includes('secret-provider-error'));
});
