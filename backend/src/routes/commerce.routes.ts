import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { CommerceController } from '../controllers/commerce.controller.ts';
import { CommerceService } from '../services/commerce.service.ts';
import { emptySchema } from '../validators/management.schemas.ts';
import { createPromotionSchema, promotionValidationSchema, purchasePaymentSchema, purchaseSchema, updatePromotionSchema, validationSchema } from '../validators/commerce.schemas.ts';
import type { Database } from '../types/management.types.ts';

export function commerceRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new CommerceController(new CommerceService(database));
    router.use(['/purchases', '/tickets', '/promotions', '/admin/promotions'], authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

    // Per-user limit on code checks: stops guessing promotion codes. Keyed by user id (the route is authenticated).
    const promotionLimiter = rateLimit({
        windowMs: 60_000,
        limit: 30,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        keyGenerator: req => `user:${req.user?.id ?? 'anonymous'}`,
        validate: { forwardedHeader: false, xForwardedForHeader: false, trustProxy: false },
        message: { success: false, error: { code: 'RATE_LIMITED', message: 'Demasiadas validaciones de código. Reintentá en un minuto.' } },
    });

    router.post('/promotions/validate', requirePermission(P.ticketsPurchase), promotionLimiter, validateRequest(promotionValidationSchema), controller.validatePromotion);

    // Administración CRUD de promociones (ADMIN vía orders.read_all o catalogs.manage)
    // Soportamos tanto verbos REST estándar como POST para compatibilidad total
    router.get('/admin/promotions', requirePermission(P.ordersReadAll, P.catalogsManage), controller.listPromotions);
    router.post('/admin/promotions/list', requirePermission(P.ordersReadAll, P.catalogsManage), controller.listPromotions);
    router.post('/admin/promotions', requirePermission(P.ordersReadAll, P.catalogsManage), validateRequest(createPromotionSchema), controller.createPromotion);
    router.get('/admin/promotions/:id', requirePermission(P.ordersReadAll, P.catalogsManage), controller.getPromotion);
    router.post('/admin/promotions/:id', requirePermission(P.ordersReadAll, P.catalogsManage), controller.getPromotion);
    router.put('/admin/promotions/:id', requirePermission(P.ordersReadAll, P.catalogsManage), validateRequest(updatePromotionSchema), controller.updatePromotion);
    router.patch('/admin/promotions/:id', requirePermission(P.ordersReadAll, P.catalogsManage), validateRequest(updatePromotionSchema), controller.updatePromotion);
    router.post('/admin/promotions/:id/update', requirePermission(P.ordersReadAll, P.catalogsManage), validateRequest(updatePromotionSchema), controller.updatePromotion);
    router.delete('/admin/promotions/:id', requirePermission(P.ordersReadAll, P.catalogsManage), controller.deletePromotion);
    router.post('/admin/promotions/:id/delete', requirePermission(P.ordersReadAll, P.catalogsManage), controller.deletePromotion);

    // Every profile (guests included) keeps tickets.purchase; reading and cancelling stay owner-checked in the service.
    router.post('/purchases', requirePermission(P.ticketsPurchase), validateRequest(purchaseSchema), controller.create);
    router.get('/purchases/me', controller.list('purchases'));
    router.post('/purchases/me', controller.list('purchases'));
    router.get('/purchases/:id', controller.purchase);
    router.post('/purchases/:id', controller.purchase);
    router.post('/purchases/:id/confirm', validateRequest(purchasePaymentSchema), controller.transition('confirm'));
    router.post('/purchases/:id/cancel', validateRequest(emptySchema.default({})), controller.transition('cancel'));
    router.get('/tickets', controller.list('tickets'));
    router.post('/tickets', controller.list('tickets'));

    // Authorized per concert in the service: a concert_staff assignment for this concert, or tickets.validate_all (ADMIN).
    router.post('/tickets/validate', validateRequest(validationSchema), controller.validate);
    router.get('/tickets/:id', controller.ticket);
    router.post('/tickets/:id', controller.ticket);
    return router;
}
