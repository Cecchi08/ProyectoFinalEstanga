import { Router, type RequestHandler } from 'express';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { PERMISSIONS as P } from '../utils/access.util.js';
import type { Database } from '../types/management.types.ts';
import { StatisticsService } from '../services/statistics.service.ts';
import { StatisticsController } from '../controllers/statistics.controller.ts';
export function statisticsRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router(); const controller = new StatisticsController(new StatisticsService(database));
    router.use(['/organizer/statistics', '/organizer/concerts/:id/statistics', '/admin/statistics'], authenticate,
        (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    router.get('/organizer/statistics', requirePermission(P.statisticsOwn), controller.summary(false));
    router.get('/organizer/concerts/:id/statistics', requirePermission(P.statisticsOwn), controller.summary(false));
    router.get('/admin/statistics', requirePermission(P.statisticsGlobal), controller.summary(true));
    return router;
}
