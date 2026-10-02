import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { oauthConfig } from '../config/oauth.config.js';
import { AppError } from '../utils/app-error.util.js';
import { emailSchema } from '../validators/auth.schemas.js';
const tokenResponse = z.object({ access_token: z.string().min(1) });
const subject = z.union([z.string().min(1).max(255), z.number().int().safe().positive()]).transform(String);
const optionalName = z.string().nullish();
export class HttpOAuthProviderClient {
    env;
    fetcher;
    constructor(env, fetcher = fetch) {
        this.env = env;
        this.fetcher = fetcher;
    }
    async json(url, init = {}) {
        try {
            const response = await this.fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000),
                headers: { Accept: 'application/json', 'User-Agent': 'VENTI', ...init.headers } });
            if (!response.ok)
                throw new Error();
            return await response.json();
        }
        catch {
            throw new AppError(401, 'OAUTH_PROVIDER_ERROR', 'No se pudo autenticar con el proveedor.');
        }
    }
    async identity(provider, code, verifier) {
        const config = oauthConfig(this.env, provider);
        const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
            redirect_uri: config.callback, code, grant_type: 'authorization_code' });
        if (provider !== 'facebook')
            body.set('code_verifier', verifier);
        try {
            const { access_token } = tokenResponse.parse(await this.json(config.token, { method: 'POST', body }));
            const headers = { Authorization: `Bearer ${access_token}` };
            let id;
            let email = null;
            let emailVerified = false;
            let firstName;
            let lastName;
            if (provider === 'google') {
                const profile = z.object({ sub: subject, email: z.string().optional(), email_verified: z.boolean().optional(), given_name: optionalName, family_name: optionalName })
                    .parse(await this.json('https://openidconnect.googleapis.com/v1/userinfo', { headers }));
                id = profile.sub;
                email = profile.email ?? null;
                emailVerified = profile.email_verified === true;
                firstName = profile.given_name;
                lastName = profile.family_name;
            }
            else if (provider === 'github') {
                const profile = z.object({ id: subject, login: z.string(), name: optionalName })
                    .parse(await this.json('https://api.github.com/user', { headers }));
                const emails = z.array(z.object({ email: z.string(), verified: z.boolean(), primary: z.boolean() }))
                    .parse(await this.json('https://api.github.com/user/emails?per_page=100', { headers }));
                const selected = emails.find(e => e.primary && e.verified) ?? emails.find(e => e.verified) ?? emails.find(e => e.primary);
                id = profile.id;
                email = selected?.email ?? null;
                emailVerified = selected?.verified === true;
                const names = (profile.name || profile.login).trim().split(/\s+/);
                firstName = names.shift();
                lastName = names.join(' ');
            }
            else {
                const url = new URL(`https://graph.facebook.com/${this.env.FACEBOOK_GRAPH_VERSION}/me`);
                url.searchParams.set('fields', 'id,first_name,last_name,email');
                url.searchParams.set('appsecret_proof', createHmac('sha256', config.clientSecret).update(access_token).digest('hex'));
                const profile = z.object({ id: subject, email: z.string().optional(), first_name: optionalName, last_name: optionalName })
                    .parse(await this.json(url.toString(), { headers }));
                id = profile.id;
                email = profile.email ?? null;
                firstName = profile.first_name;
                lastName = profile.last_name;
                // Facebook's account verification is not a guarantee of email ownership.
                emailVerified = false;
            }
            const parsedEmail = emailSchema.safeParse(email);
            return { provider, subject: id, email: parsedEmail.success ? parsedEmail.data : null,
                emailVerified: parsedEmail.success && emailVerified,
                firstName: (firstName?.trim() || 'Usuario').slice(0, 80), lastName: (lastName?.trim() || '').slice(0, 80) };
        }
        catch (error) {
            if (error instanceof AppError)
                throw error;
            throw new AppError(401, 'OAUTH_PROFILE_INVALID', 'El proveedor devolvió un perfil inválido.');
        }
    }
}
