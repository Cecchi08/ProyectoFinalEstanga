import { Router, type RequestHandler } from 'express';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { CommerceController } from '../controllers/commerce.controller.ts';
import { CommerceService } from '../services/commerce.service.ts';
import { emptySchema } from '../validators/management.schemas.ts';
import { purchasePaymentSchema, purchaseSchema, validationSchema } from '../validators/commerce.schemas.ts';
import type { Database } from '../types/management.types.ts';

export function commerceRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new CommerceController(new CommerceService(database));
    router.use(['/purchases', '/tickets'], authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    // Every profile (guests included) keeps tickets.purchase; reading and cancelling stay owner-checked in the service.
    router.post('/purchases', requirePermission(P.ticketsPurchase), validateRequest(purchaseSchema), controller.create);
    router.get('/purchases/me', controller.list('purchases'));
    router.get('/purchases/:id', controller.purchase);
    router.post('/purchases/:id/confirm', validateRequest(purchasePaymentSchema), controller.transition('confirm'));
    router.post('/purchases/:id/cancel', validateRequest(emptySchema.default({})), controller.transition('cancel'));
    router.get('/tickets', controller.list('tickets'));
    // Authorized per concert in the service: a concert_staff assignment for this concert, or tickets.validate_all (ADMIN).
    // No route-level permission: tickets.validate is derived only for published concerts, so gating here would turn a
    // scan for a cancelled concert into FORBIDDEN instead of CANCELLED and skip logging the rejected attempt.
    router.post('/tickets/validate', validateRequest(validationSchema), controller.validate);
    router.get('/tickets/:id', controller.ticket);
    return router;
}
