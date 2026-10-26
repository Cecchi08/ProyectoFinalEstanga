import { Router, type RequestHandler } from 'express';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { MarketplaceController } from '../controllers/marketplace.controller.ts';
import { MarketplaceService } from '../services/marketplace.service.ts';
import { emptySchema, idSchema } from '../validators/management.schemas.ts';
import { blockSchema, establishmentPatchSchema, establishmentSchema, memberSchema, organizationSchema, quoteRequestSchema, quoteResponseSchema,
    reservationSchema, venuePatchSchema, venueSchema } from '../validators/marketplace.schemas.ts';
import type { Database } from '../types/management.types.ts';

export function marketplaceRoutes(database: Database, authenticate: RequestHandler): Router {
    const router = Router();
    const controller = new MarketplaceController(new MarketplaceService(database));
    const optionalAuth: RequestHandler = (req, res, next) => req.headers.authorization !== undefined ? authenticate(req, res, next) : next();
    // Route gates by permission; the service adds ownership and organization membership on top.
    const establishments = requirePermission(P.establishmentsManage, P.marketplaceAdmin);
    const quoting = requirePermission(P.quotesRequest, P.marketplaceAdmin);
    const responding = requirePermission(P.quotesRespond, P.marketplaceAdmin);
    const quoteReaders = requirePermission(P.quotesRequest, P.quotesRespond, P.marketplaceAdmin);
    const booking = requirePermission(P.reservationsCreate, P.marketplaceAdmin);
    const reservationReaders = requirePermission(P.reservationsCreate, P.reservationsManage, P.marketplaceAdmin);
    const empty = validateRequest(emptySchema.default({}));
    router.use(['/marketplace', '/venues'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    router.param('id', (_req, _res, next, value) => { idSchema.parse(value); next(); });

    router.get('/marketplace/cities', controller.cities);
    router.get('/marketplace/catalogs', controller.catalogs);
    // /venues kept as an alias: concert venues are now marketplace spaces.
    router.get(['/marketplace/venues', '/venues'], controller.venues);
    router.get(['/marketplace/venues/:id', '/venues/:id'], optionalAuth, controller.venue);
    router.get('/marketplace/venues/:id/availability', optionalAuth, controller.availability);

    router.post('/marketplace/organizations', authenticate, establishments, validateRequest(organizationSchema), controller.createOrganization);
    router.get('/marketplace/organizations/mine', authenticate, establishments, controller.organizations);
    router.get('/marketplace/organizations/:id/members', authenticate, establishments, controller.members);
    router.post('/marketplace/organizations/:id/members', authenticate, establishments, validateRequest(memberSchema), controller.addMember);
    router.patch('/marketplace/organizations/:id/members/:userId', authenticate, establishments, controller.updateMember);
    router.delete('/marketplace/organizations/:id/members/:userId', authenticate, establishments, controller.removeMember);
    router.get('/marketplace/establishments/mine', authenticate, establishments, controller.establishments);
    router.post('/marketplace/establishments', authenticate, establishments, validateRequest(establishmentSchema), controller.createEstablishment);
    router.patch('/marketplace/establishments/:id', authenticate, establishments, validateRequest(establishmentPatchSchema), controller.updateEstablishment);
    router.post('/marketplace/establishments/:id/publish', authenticate, establishments, empty, controller.establishmentStatus('PUBLISHED'));
    router.post('/marketplace/establishments/:id/archive', authenticate, establishments, empty, controller.establishmentStatus('ARCHIVED'));
    router.get('/marketplace/establishments/:id/venues', authenticate, establishments, controller.establishmentVenues);
    router.post('/marketplace/establishments/:id/venues', authenticate, establishments, validateRequest(venueSchema), controller.createVenue);
    router.get('/marketplace/establishments/:id/blocks', authenticate, establishments, controller.blocks);
    router.post('/marketplace/establishments/:id/blocks', authenticate, establishments, validateRequest(blockSchema), controller.createBlock);
    router.delete('/marketplace/blocks/:id', authenticate, establishments, controller.removeBlock);
    router.patch('/marketplace/venues/:id', authenticate, establishments, validateRequest(venuePatchSchema), controller.updateVenue);
    router.post('/marketplace/venues/:id/publish', authenticate, establishments, empty, controller.venueStatus('PUBLISHED'));
    router.post('/marketplace/venues/:id/archive', authenticate, establishments, empty, controller.venueStatus('ARCHIVED'));

    router.post('/marketplace/quotes', authenticate, quoting, validateRequest(quoteRequestSchema), controller.requestQuote);
    router.get('/marketplace/quotes', authenticate, quoteReaders, controller.quotes);
    router.get('/marketplace/quotes/:id', authenticate, quoteReaders, controller.quote);
    router.post('/marketplace/quotes/:id/respond', authenticate, responding, validateRequest(quoteResponseSchema), controller.respondQuote);
    router.post('/marketplace/quotes/:id/reject', authenticate, responding, controller.rejectQuote);
    router.post('/marketplace/quotes/:id/cancel', authenticate, quoting, empty, controller.cancelQuote);
    router.post('/marketplace/quotes/:id/accept', authenticate, quoting, empty, controller.acceptQuote);

    router.post('/marketplace/reservations', authenticate, booking, validateRequest(reservationSchema), controller.createReservation);
    router.get('/marketplace/reservations', authenticate, reservationReaders, controller.reservations);
    router.get('/marketplace/reservations/:id', authenticate, reservationReaders, controller.reservation);
    router.post('/marketplace/reservations/:id/cancel', authenticate, reservationReaders, controller.cancelReservation);
    router.post('/marketplace/reservations/:id/payments', authenticate, booking, controller.pay);
    // The venue side answers direct bookings; the service also requires membership in the venue's organization.
    const venueSide = requirePermission(P.reservationsManage, P.marketplaceAdmin);
    router.post('/marketplace/reservations/:id/accept', authenticate, venueSide, empty, controller.acceptReservation);
    router.post('/marketplace/reservations/:id/reject', authenticate, venueSide, controller.rejectReservation);
    return router;
}
