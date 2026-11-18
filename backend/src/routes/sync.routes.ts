import { Router, type RequestHandler } from 'express';
import { SyncController } from '../controllers/sync.controller.ts';
import { SyncService } from '../services/sync.service.ts';
import type { Database } from '../types/management.types.ts';

export function syncRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new SyncController(new SyncService(database));
    const optionalAuth: RequestHandler = (req, res, next) =>
        req.headers.authorization !== undefined ? authenticate(req, res, next) : next();

    router.use('/sync', (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
        next();
    });

    router.post('/sync/versions', optionalAuth, controller.versions);
    router.get('/sync/versions', optionalAuth, controller.versions);

    return router;
}

