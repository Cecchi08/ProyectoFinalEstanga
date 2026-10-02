import { oauthCallbackSchema, oauthStartSchema, providerSchema } from '../validators/auth.schemas.js';
import { unauthorized } from '../utils/app-error.util.js';
export class OAuthController {
    oauth;
    cookie;
    constructor(oauth, env) {
        this.oauth = oauth;
        this.cookie = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/auth/oauth', maxAge: 600000 };
    }
    start = (req, res) => {
        const provider = providerSchema.parse(req.params.provider);
        const input = oauthStartSchema.parse(req.query);
        const flow = this.oauth.start(provider, input.mode, input.codeChallenge);
        res.cookie(`venti_oauth_${provider}`, flow.browser, this.cookie);
        res.redirect(302, flow.url);
    };
    link = (req, res) => {
        if (!req.user)
            throw unauthorized();
        const provider = providerSchema.parse(req.params.provider);
        const input = oauthStartSchema.parse(req.body);
        const flow = this.oauth.start(provider, input.mode, input.codeChallenge, req.user.id);
        res.cookie(`venti_oauth_${provider}`, flow.browser, this.cookie);
        res.json({ success: true, data: { authorizationUrl: flow.url } });
    };
    callback = async (req, res) => {
        const provider = providerSchema.parse(req.params.provider);
        const input = oauthCallbackSchema.parse(req.query);
        const cookieName = `venti_oauth_${provider}`;
        const browser = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
        res.clearCookie(cookieName, { ...this.cookie, maxAge: undefined });
        const result = await this.oauth.callback(provider, input.state, browser, input.code, input.error);
        if (result.redirect) {
            res.redirect(302, result.redirect);
            return;
        }
        res.json({ success: true, data: result.session });
    };
    exchange = async (req, res) => {
        res.json({ success: true, data: await this.oauth.exchange(req.body.code, req.body.codeVerifier) });
    };
}
