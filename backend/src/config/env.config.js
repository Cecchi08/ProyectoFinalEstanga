import 'dotenv/config';
import { z } from 'zod';
const boolean = z.enum(['true', 'false']).transform(v => v === 'true');
const optional = z.string().default('');
const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DB_HOST: z.string().default('127.0.0.1'), DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_USER: z.string().min(1), DB_PASSWORD: optional, DB_NAME: z.string().default('venti'),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().regex(/^\d+[sm]$/).default('15m'),
    JWT_ISSUER: z.string().default('venti-api'), JWT_AUDIENCE: z.string().default('venti-client'),
    REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    EMAIL_VERIFICATION_EXPIRES_HOURS: z.coerce.number().int().min(1).max(72).default(24),
    PASSWORD_RESET_EXPIRES_MINUTES: z.coerce.number().int().min(5).max(60).default(30),
    REQUIRE_EMAIL_VERIFICATION: boolean.default(true),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    CORS_ORIGINS: z.string().default('http://localhost:8081'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
    SMTP_HOST: z.string().min(1), SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: boolean.default(false), SMTP_USER: optional, SMTP_PASSWORD: optional,
    SMTP_FROM: z.email(),
    EMAIL_VERIFY_URL: z.url().default('http://localhost:8081/verify-email'),
    PASSWORD_RESET_URL: z.url().default('http://localhost:8081/reset-password'),
    GOOGLE_CLIENT_ID: optional, GOOGLE_CLIENT_SECRET: optional, GOOGLE_CALLBACK_URL: optional,
    GITHUB_CLIENT_ID: optional, GITHUB_CLIENT_SECRET: optional, GITHUB_CALLBACK_URL: optional,
    FACEBOOK_CLIENT_ID: optional, FACEBOOK_CLIENT_SECRET: optional, FACEBOOK_CALLBACK_URL: optional,
    FACEBOOK_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v23.0'),
    APP_DEEP_LINK: z.url().default('venti://oauth-callback'),
}).superRefine((env, ctx) => {
    const ttl = parseInt(env.JWT_ACCESS_EXPIRES_IN, 10) * (env.JWT_ACCESS_EXPIRES_IN.endsWith('m') ? 60 : 1);
    if (ttl < 60 || ttl > 1800)
        ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_EXPIRES_IN'], message: 'Usar entre 60s y 30m.' });
    for (const provider of ['GOOGLE', 'GITHUB', 'FACEBOOK']) {
        const values = [env[`${provider}_CLIENT_ID`], env[`${provider}_CLIENT_SECRET`], env[`${provider}_CALLBACK_URL`]];
        if (values.some(Boolean) && !values.every(Boolean))
            ctx.addIssue({ code: 'custom', path: [provider], message: 'Completar las tres variables OAuth.' });
        if (values[2]) {
            const url = z.url().safeParse(values[2]);
            if (!url.success || !/^https?:\/\//.test(values[2]) || (env.NODE_ENV === 'production' && !values[2].startsWith('https://')))
                ctx.addIssue({ code: 'custom', path: [`${provider}_CALLBACK_URL`], message: 'Callback HTTP válido; HTTPS en producción.' });
        }
    }
    if (env.NODE_ENV === 'production' && (env.BCRYPT_ROUNDS < 12 || env.JWT_ACCESS_SECRET.includes('replace')))
        ctx.addIssue({ code: 'custom', message: 'Configurar un secreto seguro y bcrypt >= 12 en producción.' });
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
        ctx.addIssue({ code: 'custom', path: ['SMTP_USER'], message: 'Configurar usuario y contraseña SMTP juntos.' });
    for (const origin of env.CORS_ORIGINS.split(',').filter(Boolean)) {
        try {
            if (new URL(origin.trim()).origin !== origin.trim())
                throw new Error();
        }
        catch {
            ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'Usar orígenes completos sin rutas ni comodines.' });
        }
    }
});
export function loadEnv(source = process.env) {
    const parsed = schema.safeParse(source);
    if (!parsed.success)
        throw new Error(`Configuración inválida: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    return parsed.data;
}
