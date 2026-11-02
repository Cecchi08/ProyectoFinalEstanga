import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AuthService } from './services/auth.service.js';
import { OAuthService } from './services/oauth.service.js';
import { HttpOAuthProviderClient } from './services/oauth-provider.service.js';
import { AuthController } from './controllers/auth.controller.js';
import { OAuthController } from './controllers/oauth.controller.js';
import { authenticate } from './middlewares/auth.middleware.js';
import { errorHandler, notFound } from './middlewares/error.middleware.js';
import { authRoutes } from './routes/auth.routes.js';
import { AccessTokens } from './utils/jwt.util.js';
import { AppError } from './utils/app-error.util.js';
import { managementRoutes } from './routes/management.routes.js';
import { commerceRoutes } from './routes/commerce.routes.js';
import { participationRoutes } from './routes/participation.routes.js';
import { recommendationsRoutes } from './routes/recommendations.routes.js';
import { notificationsRoutes } from './routes/notifications.routes.js';
import { statisticsRoutes } from './routes/statistics.routes.js';
import { marketplaceRoutes } from './routes/marketplace.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { artistsRoutes } from './routes/artists.routes.js';
import { servicesRoutes } from './routes/services.routes.js';
export function createApp({ env, database, mailer, oauthClient }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
    app.use(helmet({ referrerPolicy: { policy: 'no-referrer' } }));
    const origins = new Set(env.CORS_ORIGINS.split(',').map(v => v.trim()).filter(Boolean));
    const frontendUrl = String(env.FRONTEND_URL || process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
    if (frontendUrl) {
        try {
            origins.add(new URL(frontendUrl).origin);
        }
        catch {
            origins.add(frontendUrl);
        }
    }
    // Orígenes web explícitos: frontend en Vercel + desarrollo local en Expo Web/Next.
    for (const origin of ['https://proyectofinalestanga-frontend.vercel.app', 'http://localhost:8081', 'http://localhost:19006', 'http://localhost:3000'])
        origins.add(origin);
    const corsOptions = {
        origin(origin, callback) {
            if (!origin)
                return callback(null, true);
            let host = '';
            try {
                host = new URL(origin).hostname;
            }
            catch {
                return callback(new AppError(403, 'CORS_FORBIDDEN', 'Origen no permitido.'));
            }
            const allowed = origins.has(origin)
                || host === 'localhost' || host === '127.0.0.1'
                || /\.vercel\.app$/i.test(host);
            if (allowed)
                callback(null, true);
            else
                callback(new AppError(403, 'CORS_FORBIDDEN', 'Origen no permitido.'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    };
    app.use(cors(corsOptions));
    // Express 5 (path-to-regexp v8) exige comodín con nombre: '*' es inválido y rompería el arranque.
    app.options('/*splat', cors(corsOptions));
    app.use(express.json({ limit: '16kb', strict: true }));
    const tokens = new AccessTokens(env);
    const auth = new AuthService(database, env, tokens, mailer);
    const oauth = new OAuthService(env, auth, oauthClient ?? new HttpOAuthProviderClient(env));
    const gate = authenticate(tokens, auth);
    const authRouter = authRoutes(new AuthController(auth), new OAuthController(oauth, env), gate, env);
    const routers = [
        managementRoutes(database, gate),
        commerceRoutes(database, gate),
        participationRoutes(database, gate),
        recommendationsRoutes(database, gate),
        notificationsRoutes(database, gate),
        statisticsRoutes(database, gate),
        marketplaceRoutes(database, gate),
        adminRoutes(database, gate),
        artistsRoutes(database, gate),
        servicesRoutes(database, gate),
    ];
    // Local/tests keep /auth and /purchases; the backend Vercel project also serves /api/*.
    app.use(['/api/auth', '/auth'], authRouter);
    for (const router of routers) {
        app.use('/api', router);
        app.use(router);
    }
    app.use(notFound);
    app.use(errorHandler());
    return app;
}
