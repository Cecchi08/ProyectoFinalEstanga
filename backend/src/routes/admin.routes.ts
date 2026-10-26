import { Router, type RequestHandler } from 'express';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { AdminController } from '../controllers/admin.controller.ts';
import { AdminService } from '../services/admin.service.ts';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { grantSchema, selfProfileSchema } from '../validators/admin.schemas.ts';
import type { Database } from '../types/management.types.ts';

export function adminRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new AdminController(new AdminService(database));
    router.use(['/admin/users', '/admin/audit'], authenticate, requirePermission(P.usersManage), (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); next();
    });
    // Any signed-in registered account; the service allows only SELF_SERVICE_ROLES (COMPRADOR, ARTISTA).
    router.use('/me/profiles', authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    router.get('/me/profiles', controller.profiles);
    router.post('/me/profiles', validateRequest(selfProfileSchema), controller.activate);
    router.get('/admin/users', controller.users);
    router.get('/admin/users/:id', controller.user);
    router.post('/admin/users/:id/roles', validateRequest(grantSchema), controller.grant);
    router.delete('/admin/users/:id/roles/:role', controller.revoke);
    router.get('/admin/audit', controller.audit);
    return router;
}
