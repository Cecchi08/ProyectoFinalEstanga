import { Router, type RequestHandler } from 'express';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { ArtistsController } from '../controllers/artists.controller.ts';
import { ArtistsService } from '../services/artists.service.ts';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { emptySchema, idSchema } from '../validators/management.schemas.ts';
import { artistMemberSchema, artistPatchSchema, artistSchema } from '../validators/artists.schemas.ts';
import type { Database } from '../types/management.types.ts';

// Public: published profiles. Writes: artist.profile.manage plus membership (artists.admin overrides).
export function artistsRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new ArtistsController(new ArtistsService(database));
    const optionalAuth: RequestHandler = (req, res, next) => req.headers.authorization !== undefined ? authenticate(req, res, next) : next();
    const manage = requirePermission(P.artistProfileManage, P.artistsAdmin);
    router.use('/artists', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    for (const param of ['id', 'userId']) router.param(param, (_req, _res, next, value) => { idSchema.parse(value); next(); });
    router.get('/artists', controller.list);
    router.get('/artists/mine', authenticate, manage, controller.mine);
    router.get('/artists/:id', optionalAuth, controller.get);
    router.get('/artists/:id/concerts', optionalAuth, controller.concerts);
    router.post('/artists', authenticate, manage, validateRequest(artistSchema), controller.create);
    router.patch('/artists/:id', authenticate, manage, validateRequest(artistPatchSchema), controller.update);
    router.post('/artists/:id/publish', authenticate, manage, validateRequest(emptySchema.default({})), controller.status('PUBLISHED'));
    router.post('/artists/:id/archive', authenticate, manage, validateRequest(emptySchema.default({})), controller.status('ARCHIVED'));
    router.get('/artists/:id/members', authenticate, manage, controller.members);
    router.post('/artists/:id/members', authenticate, manage, validateRequest(artistMemberSchema), controller.addMember);
    router.patch('/artists/:id/members/:userId', authenticate, manage, controller.updateMember);
    router.delete('/artists/:id/members/:userId', authenticate, manage, controller.removeMember);
    return router;
}
