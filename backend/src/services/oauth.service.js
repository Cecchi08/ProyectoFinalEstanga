import { oauthConfig } from '../config/oauth.config.js';
import { AppError } from '../utils/app-error.util.js';
import { equalSecret, hashToken, pkceChallenge, randomToken } from '../utils/token.util.js';
import { EphemeralStore } from '../utils/ephemeral.util.js';
export class OAuthService {
    env;
    auth;
    client;
    flows = new EphemeralStore(600000);
    handoffs = new EphemeralStore(60000);
    constructor(env, auth, client) {
        this.env = env;
        this.auth = auth;
        this.client = client;
    }
    start(provider, mode, codeChallenge, linkUserId) {
        const config = oauthConfig(this.env, provider);
        if (mode === 'mobile' && !codeChallenge)
            throw new AppError(422, 'PKCE_REQUIRED', 'Se requiere codeChallenge S256.');
        const browser = randomToken();
        const verifier = randomToken();
        const state = this.flows.put({ provider, mode, browserHash: hashToken(browser), verifier, codeChallenge, linkUserId });
        const url = new URL(config.authorize);
        for (const [key, value] of Object.entries({ client_id: config.clientId, redirect_uri: config.callback,
            response_type: 'code', scope: config.scope, state }))
            url.searchParams.set(key, value);
        if (provider !== 'facebook') {
            url.searchParams.set('code_challenge', pkceChallenge(verifier));
            url.searchParams.set('code_challenge_method', 'S256');
        }
        return { url: url.toString(), browser };
    }
    async callback(provider, state, browser, code, error) {
        const flow = this.flows.take(state, f => f.provider === provider && equalSecret(f.browserHash, hashToken(browser)));
        if (!flow)
            throw new AppError(400, 'OAUTH_STATE_INVALID', 'Estado OAuth inválido, vencido o usado.');
        if (error || !code)
            throw new AppError(400, 'OAUTH_DENIED', 'Autorización OAuth cancelada.');
        const identity = await this.client.identity(provider, code, flow.verifier);
        if (identity.provider !== provider)
            throw new AppError(401, 'OAUTH_PROVIDER_MISMATCH', 'Proveedor inválido.');
        const userId = await this.auth.oauthIdentity(identity, flow.linkUserId);
        if (flow.codeChallenge) {
            const handoff = this.handoffs.put({ userId, challenge: flow.codeChallenge });
            const url = new URL(flow.mode === 'mobile' ? this.env.APP_DEEP_LINK : this.env.WEB_OAUTH_REDIRECT_URL);
            url.searchParams.set('code', handoff);
            return { redirect: url.toString() };
        }
        return { session: await this.auth.oauthSession(userId) };
    }
    exchange(code, verifier) {
        const handoff = this.handoffs.take(code, h => equalSecret(h.challenge, pkceChallenge(verifier)));
        if (!handoff)
            throw new AppError(401, 'OAUTH_EXCHANGE_INVALID', 'Código OAuth inválido, vencido o usado.');
        return this.auth.oauthSession(handoff.userId);
    }
}
