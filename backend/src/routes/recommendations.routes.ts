import { Router, type RequestHandler } from 'express';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { RecommendationsController } from '../controllers/recommendations.controller.ts';
import { RecommendationsService } from '../services/recommendations.service.ts';
import { preferencesPatchSchema } from '../validators/recommendations.schemas.ts';
import type { Database } from '../types/management.types.ts';
export function recommendationsRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new RecommendationsController(new RecommendationsService(database));
    router.use(['/recommendations', '/preferences'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); }, authenticate);
    router.get('/recommendations', controller.recommendations);
    router.get('/preferences', controller.preferences);
    router.patch('/preferences', validateRequest(preferencesPatchSchema), controller.update);
    return router;
}
