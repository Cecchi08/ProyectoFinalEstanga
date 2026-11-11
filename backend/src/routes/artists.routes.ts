import { Router, type RequestHandler } from 'express';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { ArtistsController } from '../controllers/artists.controller.ts';
import { ArtistsService } from '../services/artists.service.ts';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { emptySchema, idSchema } from '../validators/management.schemas.ts';
import { artistMemberSchema, artistPatchSchema, artistSchema, proposalDecisionSchema, proposalSchema } from '../validators/artists.schemas.ts';
import type { Database } from '../types/management.types.ts';

// Public: published profiles. Writes: artist.profile.manage plus membership (artists.admin overrides).
export function artistsRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new ArtistsController(new ArtistsService(database));
    const optionalAuth: RequestHandler = (req, res, next) => req.headers.authorization !== undefined ? authenticate(req, res, next) : next();
    const manage = requirePermission(P.artistProfileManage, P.artistsAdmin);
    router.use(['/artists', '/proposals'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    for (const param of ['id', 'userId', 'establishmentId']) router.param(param, (_req, _res, next, value) => { idSchema.parse(value); next(); });
    router.post('/artists', controller.list);
    router.post('/artists/mine', authenticate, manage, controller.mine);
    router.post('/artists/:id', optionalAuth, controller.get);
    router.post('/artists/:id/concerts', optionalAuth, controller.concerts);
    router.post('/artists/create', authenticate, manage, validateRequest(artistSchema), controller.create);
    router.post('/artists/:id/update', authenticate, manage, validateRequest(artistPatchSchema), controller.update);
    router.post('/artists/:id/publish', authenticate, manage, validateRequest(emptySchema.default({})), controller.status('PUBLISHED'));
    router.post('/artists/:id/archive', authenticate, manage, validateRequest(emptySchema.default({})), controller.status('ARCHIVED'));
    router.post('/artists/:id/members', authenticate, manage, controller.members);
    router.post('/artists/:id/members/add', authenticate, manage, validateRequest(artistMemberSchema), controller.addMember);
    router.post('/artists/:id/members/:userId/update', authenticate, manage, controller.updateMember);
    router.post('/artists/:id/members/:userId/delete', authenticate, manage, controller.removeMember);

    // Bidirectional hiring & presentation proposals (Venue <-> Artist, Organizer -> Artist)
    router.post('/proposals', authenticate, controller.proposals);
    router.post('/proposals/venue-summary/:establishmentId', authenticate, controller.venueSummary);
    router.post('/proposals/:id', authenticate, controller.proposal);
    router.post('/proposals/create', authenticate, validateRequest(proposalSchema), controller.createProposal);
    router.post('/proposals/:id/accept', authenticate, validateRequest(proposalDecisionSchema), controller.decideProposal('accept'));
    router.post('/proposals/:id/reject', authenticate, validateRequest(proposalDecisionSchema), controller.decideProposal('reject'));
    router.post('/proposals/:id/cancel', authenticate, validateRequest(proposalDecisionSchema), controller.decideProposal('cancel'));
    return router;
}
