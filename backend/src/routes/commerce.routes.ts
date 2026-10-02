import { Router, type RequestHandler } from 'express';
import { authorize } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { CommerceController } from '../controllers/commerce.controller.ts';
import { CommerceService } from '../services/commerce.service.ts';
import { emptySchema } from '../validators/management.schemas.ts';
import { purchaseSchema, validationSchema } from '../validators/commerce.schemas.ts';
import type { Database } from '../types/management.types.ts';

export function commerceRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new CommerceController(new CommerceService(database));
    router.use(['/purchases', '/tickets'], authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    router.post('/purchases', validateRequest(purchaseSchema), controller.create);
    router.get('/purchases/me', controller.list('purchases'));
    router.get('/purchases/:id', controller.purchase);
    for (const action of ['confirm', 'cancel'] as const)
        router.post(`/purchases/:id/${action}`, validateRequest(emptySchema.default({})), controller.transition(action));
    router.get('/tickets', controller.list('tickets'));
    router.post('/tickets/validate', authorize('STAFF', 'ADMIN'), validateRequest(validationSchema), controller.validate);
    router.get('/tickets/:id', controller.ticket);
    return router;
}
