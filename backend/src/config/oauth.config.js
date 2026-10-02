import { AppError } from '../utils/app-error.util.js';
export function oauthConfig(env, provider) {
    const prefix = provider.toUpperCase();
    const clientId = env[`${prefix}_CLIENT_ID`];
    const clientSecret = env[`${prefix}_CLIENT_SECRET`];
    const callback = env[`${prefix}_CALLBACK_URL`];
    if (!clientId || !clientSecret || !callback)
        throw new AppError(500, 'OAUTH_NOT_CONFIGURED', 'Proveedor OAuth no configurado.');
    const endpoints = {
        google: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'openid email profile' },
        github: { authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', scope: 'read:user user:email' },
        facebook: { authorize: `https://www.facebook.com/${env.FACEBOOK_GRAPH_VERSION}/dialog/oauth`, token: `https://graph.facebook.com/${env.FACEBOOK_GRAPH_VERSION}/oauth/access_token`, scope: 'email,public_profile' },
    };
    return { ...endpoints[provider], clientId, clientSecret, callback };
}
