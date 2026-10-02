import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { emailRequestSchema, loginSchema, oauthExchangeSchema, oauthStartSchema, refreshSchema, registerSchema, resetSchema, verifySchema } from '../validators/auth.schemas.js';
export function authRoutes(controller, oauth, authenticate, env) {
    const router = Router();
    const message = { success: false, error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Reintentá más tarde.' } };
    router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache'); next(); });
    router.use(rateLimit({ windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS, limit: env.AUTH_RATE_LIMIT_MAX, standardHeaders: 'draft-8', legacyHeaders: false, message }));
    const sensitive = rateLimit({ windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message });
    router.post('/register', sensitive, validateRequest(registerSchema), controller.register);
    router.post('/login', sensitive, validateRequest(loginSchema), controller.login);
    router.post('/refresh', validateRequest(refreshSchema), controller.refresh);
    router.post('/logout', validateRequest(refreshSchema), controller.logout);
    router.get('/me', authenticate, controller.me);
    router.post('/verify-email', validateRequest(verifySchema), controller.verifyEmail);
    router.post('/resend-verification', sensitive, validateRequest(emailRequestSchema), controller.resendVerification);
    router.post('/forgot-password', sensitive, validateRequest(emailRequestSchema), controller.forgotPassword);
    router.post('/reset-password', sensitive, validateRequest(resetSchema), controller.resetPassword);
    router.post('/oauth/exchange', validateRequest(oauthExchangeSchema), oauth.exchange);
    router.get('/oauth/:provider', oauth.start);
    router.post('/oauth/:provider/link', authenticate, validateRequest(oauthStartSchema), oauth.link);
    router.get('/oauth/:provider/callback', oauth.callback);
    return router;
}
