import { Router, type RequestHandler } from 'express';
import { authorize, authorizeConcertOwner } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { PermissionsService } from '../services/permissions.service.js';
import { ManagementService } from '../services/management.service.ts';
import { ManagementController } from '../controllers/management.controller.ts';
import { catalogSchemas, concertSchema, concertPatchSchema, ticketSchema, ticketPatchSchema, emptySchema, idSchema } from '../validators/management.schemas.ts';
import type { Catalog, Database } from '../types/management.types.ts';

export function managementRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new ManagementController(new ManagementService(database));
    const permissions = new PermissionsService(database);
    const optionalAuth: RequestHandler = (req, res, next) => req.headers.authorization !== undefined ? authenticate(req, res, next) : next();
    const manage = authorize('ORGANIZER', 'ADMIN');
    // Authenticated and public representations must never share a cached response.
    router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    for (const param of ['id', 'concertId']) router.param(param, (_req, _res, next, value) => { idSchema.parse(value); next(); });
    for (const kind of Object.keys(catalogSchemas) as Catalog[]) {
        const schema = catalogSchemas[kind];
        router.get(`/${kind}`, controller.catalogList(kind));
        router.get(`/${kind}/:id`, controller.catalogGet(kind));
        router.post(`/${kind}`, authenticate, authorize('ADMIN'), validateRequest(schema), controller.catalogCreate(kind));
        router.patch(`/${kind}/:id`, authenticate, authorize('ADMIN'), validateRequest(schema.partial().refine(value => Object.keys(value).length > 0, 'Enviar al menos un campo.')), controller.catalogUpdate(kind));
        router.delete(`/${kind}/:id`, authenticate, authorize('ADMIN'), controller.catalogDelete(kind));
    }
    router.get('/concert-types', controller.concertTypes);
    router.get('/concerts', optionalAuth, controller.concertList);
    router.get('/concerts/:id', optionalAuth, controller.concertGet);
    router.post('/concerts', authenticate, manage, validateRequest(concertSchema), controller.concertCreate);
    router.patch('/concerts/:id', authenticate, manage, authorizeConcertOwner(permissions, 'id'), validateRequest(concertPatchSchema), controller.concertUpdate);
    router.delete('/concerts/:id', authenticate, manage, authorizeConcertOwner(permissions, 'id'), controller.concertDelete);
    for (const action of ['publish', 'cancel'] as const) router.post(`/concerts/:id/${action}`, authenticate, manage, authorizeConcertOwner(permissions, 'id'), validateRequest(emptySchema.default({})), controller.transition(action));
    router.get('/concerts/:concertId/ticket-types', optionalAuth, controller.ticketList);
    router.post('/concerts/:concertId/ticket-types', authenticate, manage, authorizeConcertOwner(permissions), validateRequest(ticketSchema), controller.ticketCreate);
    router.patch('/ticket-types/:id', authenticate, manage, validateRequest(ticketPatchSchema), controller.ticketUpdate);
    router.delete('/ticket-types/:id', authenticate, manage, controller.ticketDelete);
    return router;
}
