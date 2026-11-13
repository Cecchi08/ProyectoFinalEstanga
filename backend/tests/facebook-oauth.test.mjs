import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { loadEnv } from '../src/config/env.config.js';
import { oauthConfig } from '../src/config/oauth.config.js';
import { OAuthService } from '../src/services/oauth.service.js';
import { HttpOAuthProviderClient } from '../src/services/oauth-provider.service.js';
import { oauthCallbackSchema } from '../src/validators/auth.schemas.js';

function baseEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PORT: '3000',
    MYSQL_PUBLIC_URL: 'mysql://user:pass@localhost:3306/venti',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    SMTP_HOST: 'localhost',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_FROM: 'no-reply@venti.local',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_CALLBACK_URL: 'https://proyecto-final-estanga.vercel.app/auth/oauth/google/callback',
    GITHUB_CLIENT_ID: 'github-client-id',
    GITHUB_CLIENT_SECRET: 'github-client-secret',
    GITHUB_CALLBACK_URL: 'https://proyecto-final-estanga.vercel.app/auth/oauth/github/callback',
    FACEBOOK_CLIENT_ID: 'fb-client-id',
    FACEBOOK_CLIENT_SECRET: 'fb-client-secret',
    FACEBOOK_CALLBACK_URL: 'https://proyecto-final-estanga.vercel.app/auth/oauth/facebook/callback',
    FACEBOOK_GRAPH_VERSION: 'v23.0',
    ...overrides,
  };
}

test('loadEnv acepta FACEBOOK_CONFIG_ID válido y rechaza valores inválidos sin exponer el valor', () => {
  const valid = loadEnv(baseEnv({ FACEBOOK_CONFIG_ID: '  123456789012345  ' }));
  assert.equal(valid.FACEBOOK_CONFIG_ID, '123456789012345');

  const secretLike = 'invalid config with spaces';
  assert.throws(
    () => loadEnv(baseEnv({ FACEBOOK_CONFIG_ID: secretLike })),
    (err) => err instanceof Error && err.message.includes('FACEBOOK_CONFIG_ID') && !err.message.includes(secretLike),
  );
});

test('Facebook Login for Business: envía config_id, omite scope y conserva redirect_uri, state y auth_type', () => {
  const env = loadEnv(baseEnv({ FACEBOOK_CONFIG_ID: '987654321098765' }));
  const service = new OAuthService(env, {}, {});
  const { url, browser } = service.start('facebook', 'web');
  assert.ok(browser);

  const parsed = new URL(url);
  assert.equal(`${parsed.origin}${parsed.pathname}`, 'https://www.facebook.com/v23.0/dialog/oauth');
  assert.equal(parsed.searchParams.get('client_id'), 'fb-client-id');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://proyecto-final-estanga.vercel.app/auth/oauth/facebook/callback');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('config_id'), '987654321098765');
  assert.equal(parsed.searchParams.get('auth_type'), 'reauthenticate');
  assert.ok(parsed.searchParams.get('state'));
  assert.equal(parsed.searchParams.has('scope'), false);
  assert.equal(parsed.searchParams.has('code_challenge'), false);
});

test('Facebook Login estándar (sin FACEBOOK_CONFIG_ID): conserva scope=email,public_profile y no envía config_id', () => {
  const env = loadEnv(baseEnv({ FACEBOOK_CONFIG_ID: '' }));
  const cfg = oauthConfig(env, 'facebook');
  assert.equal(cfg.scope, 'email,public_profile');
  assert.equal(cfg.configId, undefined);

  const service = new OAuthService(env, {}, {});
  const { url } = service.start('facebook', 'web');
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('scope'), 'email,public_profile');
  assert.equal(parsed.searchParams.has('config_id'), false);
});

test('Validación de state, CSRF browser cookie, intercambio de code y obtención de perfil/email de Facebook', async () => {
  const env = loadEnv(baseEnv({ FACEBOOK_CONFIG_ID: '987654321098765' }));
  const calls = [];
  const fakeFetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    calls.push({ url: urlStr, init });
    if (urlStr.includes('/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: 'fb-access-token-123' }), { status: 200 });
    }
    if (urlStr.includes('/me')) {
      return new Response(JSON.stringify({ id: '1000123456', first_name: 'Lucía', last_name: 'Benítez', email: 'lucia@example.com' }), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${urlStr}`);
  };

  const client = new HttpOAuthProviderClient(env, fakeFetch);
  let capturedIdentity = null;
  const fakeAuth = {
    oauthIdentity: async (identity) => { capturedIdentity = identity; return 42; },
    oauthSession: async (userId) => ({ userId, accessToken: 'jwt' }),
  };
  const service = new OAuthService(env, fakeAuth, client);
  const { url, browser } = service.start('facebook', 'web');
  const state = new URL(url).searchParams.get('state');

  // CSRF: browser inválido debe fallar con OAUTH_STATE_INVALID
  await assert.rejects(
    () => service.callback('facebook', state, 'wrong-browser', 'auth-code-1'),
    (err) => err?.code === 'OAUTH_STATE_INVALID',
  );

  // Nuevo flujo válido
  const flow2 = service.start('facebook', 'web');
  const state2 = new URL(flow2.url).searchParams.get('state');
  const result = await service.callback('facebook', state2, flow2.browser, 'auth-code-2');
  assert.deepEqual(result, { session: { userId: 42, accessToken: 'jwt' } });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://graph.facebook.com/v23.0/oauth/access_token');
  const tokenBody = calls[0].init.body;
  assert.equal(tokenBody.get('client_id'), 'fb-client-id');
  assert.equal(tokenBody.get('client_secret'), 'fb-client-secret');
  assert.equal(tokenBody.get('redirect_uri'), 'https://proyecto-final-estanga.vercel.app/auth/oauth/facebook/callback');
  assert.equal(tokenBody.get('code'), 'auth-code-2');
  assert.equal(tokenBody.get('grant_type'), 'authorization_code');
  assert.equal(tokenBody.has('code_verifier'), false);

  const meUrl = new URL(calls[1].url);
  assert.equal(`${meUrl.origin}${meUrl.pathname}`, 'https://graph.facebook.com/v23.0/me');
  assert.equal(meUrl.searchParams.get('fields'), 'id,first_name,last_name,email');
  const expectedProof = createHmac('sha256', 'fb-client-secret').update('fb-access-token-123').digest('hex');
  assert.equal(meUrl.searchParams.get('appsecret_proof'), expectedProof);

  assert.deepEqual(capturedIdentity, {
    provider: 'facebook',
    subject: '1000123456',
    email: 'lucia@example.com',
    emailVerified: false,
    firstName: 'Lucía',
    lastName: 'Benítez',
  });
});

test('Manejo seguro de errores de Meta en callback y en token exchange', async () => {
  const env = loadEnv(baseEnv({ FACEBOOK_CONFIG_ID: '987654321098765' }));
  const parsedQuery = oauthCallbackSchema.parse({
    state: 'a'.repeat(64),
    error: 'access_denied',
    error_code: '200',
    error_description: 'Permissions error',
    error_reason: 'user_denied',
  });
  assert.equal(parsedQuery.error, 'access_denied');
  assert.equal(parsedQuery.error_code, '200');

  const failingFetch = async () => new Response(
    JSON.stringify({ error: { message: 'Invalid verification code format.', type: 'OAuthException', code: 100 } }),
    { status: 400 },
  );
  const client = new HttpOAuthProviderClient(env, failingFetch);
  await assert.rejects(
    () => client.identity('facebook', 'bad-code', 'verifier'),
    (err) => err?.code === 'OAUTH_PROVIDER_ERROR' && !err.message.includes('fb-client-secret'),
  );
});

test('Google y GitHub no sufren regresiones en URL de autorización', () => {
  const env = loadEnv(baseEnv({ FACEBOOK_CONFIG_ID: '987654321098765' }));
  const service = new OAuthService(env, {}, {});

  const googleUrl = new URL(service.start('google', 'web').url);
  assert.equal(googleUrl.searchParams.get('scope'), 'openid email profile');
  assert.equal(googleUrl.searchParams.get('prompt'), 'select_account');
  assert.equal(googleUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(googleUrl.searchParams.has('config_id'), false);

  const githubUrl = new URL(service.start('github', 'web').url);
  assert.equal(githubUrl.searchParams.get('scope'), 'read:user user:email');
  assert.equal(githubUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(githubUrl.searchParams.has('config_id'), false);
});

test('db.config.js conserva la configuración de conexión MySQL sin alteraciones', () => {
  const dbConfigSrc = readFileSync(new URL('../src/config/db.config.js', import.meta.url), 'utf8');
  assert.ok(dbConfigSrc.includes('MYSQL_PUBLIC_URL'));
  assert.ok(dbConfigSrc.includes('export function databaseConfig'));
});

