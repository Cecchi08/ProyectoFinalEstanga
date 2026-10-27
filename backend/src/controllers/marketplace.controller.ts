import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { MarketplaceService } from '../services/marketplace.service.ts';
import { idSchema } from '../validators/management.schemas.ts';
import { availabilityQuerySchema, cancelSchema, listQuerySchema, memberPatchSchema, notesSchema, paymentSchema, rejectSchema, venueQuerySchema } from '../validators/marketplace.schemas.ts';

const principal = (req: Request) => { if (!req.user) throw unauthorized(); return req.user; };
const id = (req: Request) => idSchema.parse(req.params.id);
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const page = (res: Response, result: { data: unknown; total: number }, query: { page: number; limit: number }) =>
    res.json({ success: true, data: result.data, pagination: { page: query.page, limit: query.limit, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });

export class MarketplaceController {
    constructor(private readonly service: MarketplaceService) {}
    cities = async (_req: Request, res: Response) => { ok(res, await this.service.cities()); };
    catalogs = async (_req: Request, res: Response) => { ok(res, await this.service.catalogs()); };
    venues = async (req: Request, res: Response) => {
        const query = venueQuerySchema.parse(req.query);
        page(res, await this.service.venues(query), query);
    };
    venue = async (req: Request, res: Response) => { ok(res, await this.service.venue(id(req), req.user)); };
    availability = async (req: Request, res: Response) => { ok(res, await this.service.availability(id(req), availabilityQuerySchema.parse(req.query), req.user)); };
    createOrganization = async (req: Request, res: Response) => { ok(res, await this.service.createOrganization(req.body, principal(req)), 201); };
    organizations = async (req: Request, res: Response) => { ok(res, await this.service.organizations(principal(req))); };
    members = async (req: Request, res: Response) => { ok(res, await this.service.members(id(req), principal(req))); };
    addMember = async (req: Request, res: Response) => { ok(res, await this.service.addMember(id(req), req.body, principal(req)), 201); };
    updateMember = async (req: Request, res: Response) => {
        ok(res, await this.service.updateMember(id(req), idSchema.parse(req.params.userId), memberPatchSchema.parse(req.body).member_role, principal(req)));
    };
    removeMember = async (req: Request, res: Response) => {
        await this.service.removeMember(id(req), idSchema.parse(req.params.userId), principal(req)); res.sendStatus(204);
    };
    establishments = async (req: Request, res: Response) => { ok(res, await this.service.establishments(principal(req))); };
    createEstablishment = async (req: Request, res: Response) => { ok(res, await this.service.createEstablishment(req.body, principal(req)), 201); };
    updateEstablishment = async (req: Request, res: Response) => { ok(res, await this.service.updateEstablishment(id(req), req.body, principal(req))); };
    establishmentStatus = (status: 'PUBLISHED' | 'ARCHIVED') => async (req: Request, res: Response) => {
        ok(res, await this.service.establishmentStatus(id(req), status, principal(req)));
    };
    pendingEstablishments = async (_req: Request, res: Response) => { ok(res, await this.service.pendingEstablishments()); };
    reviewEstablishment = (approve: boolean) => async (req: Request, res: Response) => {
        ok(res, await this.service.reviewEstablishment(id(req), approve, approve ? undefined : rejectSchema.parse(req.body).reason, principal(req)));
    };
    establishmentVenues = async (req: Request, res: Response) => { ok(res, await this.service.establishmentVenues(id(req), principal(req))); };
    createVenue = async (req: Request, res: Response) => { ok(res, await this.service.createVenue(id(req), req.body, principal(req)), 201); };
    updateVenue = async (req: Request, res: Response) => { ok(res, await this.service.updateVenue(id(req), req.body, principal(req))); };
    venueStatus = (status: 'PUBLISHED' | 'ARCHIVED') => async (req: Request, res: Response) => { ok(res, await this.service.venueStatus(id(req), status, principal(req))); };
    blocks = async (req: Request, res: Response) => { ok(res, await this.service.blocks(id(req), principal(req))); };
    createBlock = async (req: Request, res: Response) => { ok(res, await this.service.createBlock(id(req), req.body, principal(req)), 201); };
    removeBlock = async (req: Request, res: Response) => { await this.service.removeBlock(id(req), principal(req)); res.sendStatus(204); };
    requestQuote = async (req: Request, res: Response) => { ok(res, await this.service.requestQuote(req.body, principal(req)), 201); };
    quotes = async (req: Request, res: Response) => {
        const query = listQuerySchema.parse(req.query);
        page(res, await this.service.quotes(principal(req), query), query);
    };
    quote = async (req: Request, res: Response) => { ok(res, await this.service.quote(id(req), principal(req))); };
    respondQuote = async (req: Request, res: Response) => { ok(res, await this.service.respondQuote(id(req), req.body, principal(req))); };
    rejectQuote = async (req: Request, res: Response) => {
        ok(res, await this.service.closeQuote(id(req), 'reject', notesSchema.parse(req.body).provider_notes, principal(req)));
    };
    cancelQuote = async (req: Request, res: Response) => { ok(res, await this.service.closeQuote(id(req), 'cancel', undefined, principal(req))); };
    acceptQuote = async (req: Request, res: Response) => { ok(res, await this.service.acceptQuote(id(req), principal(req)), 201); };
    createReservation = async (req: Request, res: Response) => { ok(res, await this.service.createReservation(req.body, principal(req)), 201); };
    reservations = async (req: Request, res: Response) => {
        const query = listQuerySchema.parse(req.query);
        page(res, await this.service.reservations(principal(req), query), query);
    };
    reservation = async (req: Request, res: Response) => { ok(res, await this.service.reservation(id(req), principal(req))); };
    cancelReservation = async (req: Request, res: Response) => {
        ok(res, await this.service.cancelReservation(id(req), cancelSchema.parse(req.body).reason, principal(req)));
    };
    acceptReservation = async (req: Request, res: Response) => { ok(res, await this.service.acceptReservation(id(req), principal(req))); };
    rejectReservation = async (req: Request, res: Response) => {
        ok(res, await this.service.rejectReservation(id(req), rejectSchema.parse(req.body).reason, principal(req)));
    };
    pay = async (req: Request, res: Response) => { ok(res, await this.service.pay(id(req), paymentSchema.parse(req.body).outcome, principal(req)), 201); };
}
