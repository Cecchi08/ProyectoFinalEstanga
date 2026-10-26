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
    // Staff is assigned per concert (concert_staff): no global role gate, the queries filter by assignment.
    router.get('/staff/assignments', controller.assignments);
    router.get('/concerts/:id/attendees', controller.attendees);
    return router;
}
