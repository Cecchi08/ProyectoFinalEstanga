import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { ServicesService } from '../services/services.service.ts';
import { idSchema } from '../validators/management.schemas.ts';
import { offeringQuerySchema, providerQuerySchema, serviceCancelSchema, serviceNotesSchema, serviceQuoteListSchema } from '../validators/services.schemas.ts';

const principal = (req: Request) => { if (!req.user) throw unauthorized(); return req.user; };
const id = (req: Request) => idSchema.parse(req.params.id);
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const page = (res: Response, result: { data: unknown; total: number }, query: { page: number; limit: number }) =>
    res.json({ success: true, data: result.data, pagination: { page: query.page, limit: query.limit, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });

export class ServicesController {
    constructor(private readonly service: ServicesService) {}
    categories = async (_req: Request, res: Response) => { ok(res, await this.service.categories()); };
    providers = async (req: Request, res: Response) => { const query = providerQuerySchema.parse(req.query); page(res, await this.service.providers(query), query); };
    offerings = async (req: Request, res: Response) => { const query = offeringQuerySchema.parse(req.query); page(res, await this.service.offerings(query), query); };
    provider = async (req: Request, res: Response) => { ok(res, await this.service.provider(id(req), req.user)); };
    offering = async (req: Request, res: Response) => { ok(res, await this.service.offering(id(req), req.user)); };
    mine = async (req: Request, res: Response) => { ok(res, await this.service.mine(principal(req))); };
    createProvider = async (req: Request, res: Response) => { ok(res, await this.service.createProvider(req.body, principal(req)), 201); };
    updateProvider = async (req: Request, res: Response) => { ok(res, await this.service.updateProvider(id(req), req.body, principal(req))); };
    providerStatus = (status: 'PUBLISHED' | 'ARCHIVED') => async (req: Request, res: Response) => { ok(res, await this.service.providerStatus(id(req), status, principal(req))); };
    verify = (verified: boolean) => async (req: Request, res: Response) => { ok(res, await this.service.verify(id(req), verified, principal(req))); };
    createOffering = async (req: Request, res: Response) => { ok(res, await this.service.createOffering(id(req), req.body, principal(req)), 201); };
    updateOffering = async (req: Request, res: Response) => { ok(res, await this.service.updateOffering(id(req), req.body, principal(req))); };
    offeringStatus = (status: 'PUBLISHED' | 'ARCHIVED') => async (req: Request, res: Response) => { ok(res, await this.service.offeringStatus(id(req), status, principal(req))); };
    requestQuote = async (req: Request, res: Response) => { ok(res, await this.service.requestQuote(req.body, principal(req)), 201); };
    quotes = async (req: Request, res: Response) => { const query = serviceQuoteListSchema.parse(req.query); page(res, await this.service.quotes(principal(req), query), query); };
    quote = async (req: Request, res: Response) => { ok(res, await this.service.quote(id(req), principal(req))); };
    respondQuote = async (req: Request, res: Response) => { ok(res, await this.service.respondQuote(id(req), req.body, principal(req))); };
    rejectQuote = async (req: Request, res: Response) => {
        ok(res, await this.service.closeQuote(id(req), 'reject', serviceNotesSchema.parse(req.body ?? {}).provider_notes, principal(req)));
    };
    cancelQuote = async (req: Request, res: Response) => {
        ok(res, await this.service.closeQuote(id(req), 'cancel', serviceCancelSchema.parse(req.body ?? {}).reason, principal(req)));
    };
    acceptQuote = async (req: Request, res: Response) => { ok(res, await this.service.acceptQuote(id(req), principal(req))); };
}
