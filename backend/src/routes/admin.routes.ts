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
    // Cualquier cuenta registrada autenticada; el servicio solo admite SELF_SERVICE_ROLES (COMPRADOR, ARTISTA).
    router.use('/me/profiles', authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    router.post('/me/profiles', controller.profiles);
    router.post('/me/profiles/activate', validateRequest(selfProfileSchema), controller.activate);
    // Gestión administrativa de usuarios, roles, suspensiones y auditoría.
    router.post('/admin/users', controller.users);
    router.post('/admin/users/:id', controller.user);
    router.post('/admin/users/:id/roles', validateRequest(grantSchema), controller.grant);
    router.post('/admin/users/:id/roles/:role/delete', controller.revoke);
    router.post('/admin/users/:id/suspend', validateRequest(suspendSchema), controller.suspend);
    router.post('/admin/users/:id/reactivate', controller.reactivate);
    router.post('/admin/audit', controller.audit);
    // Solicitudes de perfil comercial: cualquier usuario autenticado puede pedirlos; solo users.manage (ADMIN) los lista y resuelve.
    router.post('/me/profile-requests', authenticate, controller.requestProfile);
    router.post('/me/profile-requests/mine', authenticate, controller.myProfileRequests);
    router.post('/admin/profile-requests', authenticate, requirePermission(P.usersManage), controller.profileRequests);
    router.post('/admin/profile-requests/:id/approve', authenticate, requirePermission(P.usersManage), controller.approveProfileRequest);
    router.post('/admin/profile-requests/:id/reject', authenticate, requirePermission(P.usersManage), controller.rejectProfileRequest);
    // Listado de solo lectura de todas las organizaciones (espacios y empresas de servicios); marketplace.admin también accede.
    router.post('/admin/organizations', authenticate, requirePermission(P.usersManage, P.marketplaceAdmin), (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); next();
    }, controller.organizations);
    return router;
}
