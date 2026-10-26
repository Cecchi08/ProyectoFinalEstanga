import { Router, type RequestHandler } from 'express';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { ServicesController } from '../controllers/services.controller.ts';
import { ServicesService } from '../services/services.service.ts';
import { emptySchema, idSchema } from '../validators/management.schemas.ts';
import { memberSchema } from '../validators/marketplace.schemas.ts';
import { offeringPatchSchema, offeringSchema, providerPatchSchema, providerSchema, serviceQuoteRequestSchema, serviceQuoteResponseSchema }
    from '../validators/services.schemas.ts';
import type { Database } from '../types/management.types.ts';

// EMPRESA_SERVICIOS. Public: published companies and offerings. Route gates by permission; the service adds
// organization membership (OWNER/ADMIN to edit) and requester ownership on top.
export function servicesRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new ServicesController(new ServicesService(database));
    const optionalAuth: RequestHandler = (req, res, next) => req.headers.authorization !== undefined ? authenticate(req, res, next) : next();
    const manage = requirePermission(P.servicesManage, P.servicesAdmin);
    const requesting = requirePermission(P.serviceQuotesRequest, P.servicesAdmin);
    const responding = requirePermission(P.serviceQuotesRespond, P.servicesAdmin);
    const readers = requirePermission(P.serviceQuotesRequest, P.serviceQuotesRespond, P.servicesAdmin);
    const empty = validateRequest(emptySchema.default({}));
    router.use('/services', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    router.param('id', (_req, _res, next, value) => { idSchema.parse(value); next(); });

    router.get('/services/categories', controller.categories);
    router.get('/services/providers', controller.providers);
    router.get('/services/providers/mine', authenticate, manage, controller.mine);
    router.get('/services/providers/:id', optionalAuth, controller.provider);
    router.get('/services/offerings', controller.offerings);
    router.get('/services/offerings/:id', optionalAuth, controller.offering);
    router.get('/services/offerings/:id/availability', optionalAuth, controller.availability);

    router.post('/services/providers', authenticate, manage, validateRequest(providerSchema), controller.createProvider);
    router.patch('/services/providers/:id', authenticate, manage, validateRequest(providerPatchSchema), controller.updateProvider);
    router.post('/services/providers/:id/publish', authenticate, manage, empty, controller.providerStatus('PUBLISHED'));
    router.post('/services/providers/:id/archive', authenticate, manage, empty, controller.providerStatus('ARCHIVED'));
    router.post('/services/providers/:id/verify', authenticate, requirePermission(P.servicesAdmin), empty, controller.verify(true));
    router.post('/services/providers/:id/unverify', authenticate, requirePermission(P.servicesAdmin), empty, controller.verify(false));
    // Members: any member reads the list; OWNER/ADMIN manage it (rules in the service, as for venue organizations).
    router.get('/services/providers/:id/members', authenticate, manage, controller.members);
    router.post('/services/providers/:id/members', authenticate, manage, validateRequest(memberSchema), controller.addMember);
    router.patch('/services/providers/:id/members/:userId', authenticate, manage, controller.updateMember);
    router.delete('/services/providers/:id/members/:userId', authenticate, manage, controller.removeMember);
    router.post('/services/providers/:id/offerings', authenticate, manage, validateRequest(offeringSchema), controller.createOffering);
    router.patch('/services/offerings/:id', authenticate, manage, validateRequest(offeringPatchSchema), controller.updateOffering);
    router.post('/services/offerings/:id/publish', authenticate, manage, empty, controller.offeringStatus('PUBLISHED'));
    router.post('/services/offerings/:id/archive', authenticate, manage, empty, controller.offeringStatus('ARCHIVED'));

    router.post('/services/quotes', authenticate, requesting, validateRequest(serviceQuoteRequestSchema), controller.requestQuote);
    router.get('/services/quotes', authenticate, readers, controller.quotes);
    router.get('/services/quotes/:id', authenticate, readers, controller.quote);
    router.post('/services/quotes/:id/respond', authenticate, responding, validateRequest(serviceQuoteResponseSchema), controller.respondQuote);
    router.post('/services/quotes/:id/reject', authenticate, responding, controller.rejectQuote);
    router.post('/services/quotes/:id/cancel', authenticate, requesting, controller.cancelQuote);
    router.post('/services/quotes/:id/accept', authenticate, requesting, empty, controller.acceptQuote);
    return router;
}
