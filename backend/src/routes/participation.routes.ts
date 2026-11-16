import { Router, type RequestHandler } from 'express';
import { ParticipationService } from '../services/participation.service.ts';
import { ParticipationController } from '../controllers/participation.controller.ts';
import type { Database } from '../types/management.types.ts';

export function participationRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new ParticipationController(new ParticipationService(database));
    router.use(['/staff/assignments', '/concerts/:id/attendees'], (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); next();
    }, authenticate);
    // El personal de puerta se asigna por concierto (concert_staff): no hay rol global, las consultas filtran por asignación.
    router.post('/staff/assignments', controller.assignments);
    router.post('/concerts/:id/attendees', controller.attendees);
    return router;
}
