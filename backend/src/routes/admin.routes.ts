import { Router, type RequestHandler } from 'express';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { AdminController } from '../controllers/admin.controller.ts';
import { AdminService } from '../services/admin.service.ts';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { grantSchema, selfProfileSchema, suspendSchema } from '../validators/admin.schemas.ts';
import type { Database } from '../types/management.types.ts';

export function adminRoutes(database: Database, authenticate: RequestHandler, mailer?: any): Router {
    const router = Router();
    const controller = new AdminController(new AdminService(database, mailer));
    router.use(['/admin/users', '/admin/audit'], authenticate, requirePermission(P.usersManage), (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); next();
    });
    // Any signed-in registered account; the service allows only SELF_SERVICE_ROLES (COMPRADOR, ARTISTA).
    router.use('/me/profiles', authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    router.post('/me/profiles', controller.profiles);
    router.post('/me/profiles/activate', validateRequest(selfProfileSchema), controller.activate);
    router.post('/admin/users', controller.users);
    router.post('/admin/users/:id', controller.user);
    router.post('/admin/users/:id/roles', validateRequest(grantSchema), controller.grant);
    router.post('/admin/users/:id/roles/:role/delete', controller.revoke);
    router.post('/admin/users/:id/suspend', validateRequest(suspendSchema), controller.suspend);
    router.post('/admin/users/:id/reactivate', controller.reactivate);
    router.post('/admin/audit', controller.audit);
    // Profile requests: anyone signed in asks for a business profile; only users.manage (ADMIN) lists and decides them.
    router.post('/me/profile-requests', authenticate, controller.requestProfile);
    router.post('/me/profile-requests/mine', authenticate, controller.myProfileRequests);
    router.post('/admin/profile-requests', authenticate, requirePermission(P.usersManage), controller.profileRequests);
    router.post('/admin/profile-requests/:id/approve', authenticate, requirePermission(P.usersManage), controller.approveProfileRequest);
    router.post('/admin/profile-requests/:id/reject', authenticate, requirePermission(P.usersManage), controller.rejectProfileRequest);
    // Read-only list of every organization (venues and service companies); marketplace.admin also reaches it.
    router.post('/admin/organizations', authenticate, requirePermission(P.usersManage, P.marketplaceAdmin), (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); next();
    }, controller.organizations);
    return router;
}
