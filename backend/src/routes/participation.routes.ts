import { Router, type RequestHandler } from 'express';
import { authorize } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { emptySchema } from '../validators/management.schemas.ts';
import { ParticipationService } from '../services/participation.service.ts';
import { ParticipationController } from '../controllers/participation.controller.ts';
import type { Database } from '../types/management.types.ts';

export function participationRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new ParticipationController(new ParticipationService(database));
    router.use(['/favorites', '/staff/assignments', '/concerts/:id/attendees'], (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); next();
    }, authenticate);
    router.get('/favorites', controller.favorites);
    for (const method of ['post', 'delete'] as const) router[method]('/favorites/:concertId',
        (req, _res, next) => { emptySchema.parse(req.query); next(); },
        validateRequest(emptySchema.default({})), controller.favorite(method === 'post'));
    router.get('/staff/assignments', authorize('STAFF', 'ADMIN'), controller.assignments);
    router.get('/concerts/:id/attendees', authorize('STAFF', 'ORGANIZER', 'ADMIN'), controller.attendees);
    return router;
}
