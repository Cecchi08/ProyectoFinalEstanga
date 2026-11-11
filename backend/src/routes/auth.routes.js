import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { emailRequestSchema, loginSchema, oauthExchangeSchema, oauthStartSchema, profileUpdateSchema, refreshSchema, registerSchema, resetSchema, verifySchema } from '../validators/auth.schemas.js';
export function authRoutes(controller, oauth, authenticate, env) {
    const router = Router();
    const message = { success: false, error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Reintentá más tarde.' } };
    // Vercel inyecta X-Forwarded-For/Forwarded: desactivamos esas validaciones de express-rate-limit
    // (el trust proxy se define en app.js) para evitar ERR_ERL_FORWARDED_HEADER en producción.
    const proxyValidate = { forwardedHeader: false, xForwardedForHeader: false, trustProxy: false };
    router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache'); next(); });
    router.use(rateLimit({ windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS, limit: env.AUTH_RATE_LIMIT_MAX, standardHeaders: 'draft-8', legacyHeaders: false, message, validate: proxyValidate }));
    const sensitive = rateLimit({ windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message, validate: proxyValidate });
    router.post('/register', sensitive, validateRequest(registerSchema), controller.register);
    router.post('/login', sensitive, validateRequest(loginSchema), controller.login);
    router.post('/refresh', validateRequest(refreshSchema), controller.refresh);
    router.post('/logout', validateRequest(refreshSchema), controller.logout);
    router.post('/me', authenticate, controller.me);
    router.post('/me/update', authenticate, validateRequest(profileUpdateSchema), controller.updateMe);
    router.post('/verify-email', validateRequest(verifySchema), controller.verifyEmail);
    router.post('/resend-verification', sensitive, validateRequest(emailRequestSchema), controller.resendVerification);
    router.post('/forgot-password', sensitive, validateRequest(emailRequestSchema), controller.forgotPassword);
    router.post('/reset-password', sensitive, validateRequest(resetSchema), controller.resetPassword);
    router.post('/oauth/exchange', validateRequest(oauthExchangeSchema), oauth.exchange);
    router.post('/oauth/:provider', oauth.start);
    router.post('/oauth/:provider/link', authenticate, validateRequest(oauthStartSchema), oauth.link);
    router.post('/oauth/:provider/callback', oauth.callback);
    router.post('/:provider/callback', oauth.callback);
    // Limitación técnica de terceros: los proveedores externos de OAuth 2.0 (Google, GitHub, Facebook)
    // redirigen el navegador del usuario al callback mediante peticiones HTTP GET (RFC 6749 §4.1.2).
    // Se conservan los receptores GET exclusivamente para compatibilidad con la redirección del navegador externo.
    router.get('/oauth/:provider', oauth.start);
    router.get('/oauth/:provider/callback', oauth.callback);
    router.get('/:provider/callback', oauth.callback);
    return router;
}
