import { Router, type RequestHandler } from 'express';
import type { Database } from '../types/management.types.ts';
import { NotificationsService } from '../services/notifications.service.ts';
import { NotificationsController } from '../controllers/notifications.controller.ts';
export function notificationsRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router(); const controller = new NotificationsController(new NotificationsService(database));
    router.use('/notifications', authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    router.get('/notifications', controller.list);
    router.patch('/notifications/read-all', controller.read);
    router.patch('/notifications/:id/read', controller.read);
    return router;
}
