import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { ManagementService } from '../services/management.service.ts';
import { catalogQuerySchema, cityQuerySchema, concertQuerySchema, idSchema, venueQuerySchema } from '../validators/management.schemas.ts';
import type { Catalog } from '../types/management.types.ts';

const principal = (req: Request) => { if (!req.user) throw unauthorized(); return req.user; };
const id = (req: Request, key = 'id') => idSchema.parse(req.params[key]);
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const page = (res: Response, result: { data: unknown; total: number }, query: { page: number; limit: number }) =>
    res.json({ success: true, data: result.data, pagination: { ...query, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });

export class ManagementController {
    constructor(private readonly service: ManagementService) {}
    catalogList = (kind: Catalog) => async (req: Request, res: Response) => {
        const schema = kind === 'cities' ? cityQuerySchema : kind === 'venues' ? venueQuerySchema : catalogQuerySchema;
        const query = schema.parse(req.query);
        page(res, await this.service.catalogList(kind, query), { page: query.page, limit: query.limit });
    };
    catalogGet = (kind: Catalog) => async (req: Request, res: Response) => { ok(res, await this.service.catalogGet(kind, id(req))); };
    catalogCreate = (kind: Catalog) => async (req: Request, res: Response) => { ok(res, await this.service.catalogSave(kind, req.body, principal(req)), 201); };
    catalogUpdate = (kind: Catalog) => async (req: Request, res: Response) => { ok(res, await this.service.catalogSave(kind, req.body, principal(req), id(req))); };
    catalogDelete = (kind: Catalog) => async (req: Request, res: Response) => { await this.service.catalogDelete(kind, id(req), principal(req)); res.sendStatus(204); };
    concertTypes = async (_req: Request, res: Response) => { ok(res, await this.service.concertTypes()); };
    concertList = async (req: Request, res: Response) => {
        const query = concertQuerySchema.parse(req.query);
        page(res, await this.service.concertList(query, req.user), { page: query.page, limit: query.limit });
    };
    concertGet = async (req: Request, res: Response) => { ok(res, await this.service.concertGet(id(req), req.user)); };
    concertCreate = async (req: Request, res: Response) => { ok(res, await this.service.concertCreate(req.body, principal(req)), 201); };
    concertUpdate = async (req: Request, res: Response) => { ok(res, await this.service.concertUpdate(id(req), req.body, principal(req))); };
    concertDelete = async (req: Request, res: Response) => { await this.service.concertDelete(id(req), principal(req)); res.sendStatus(204); };
    transition = (action: 'publish' | 'cancel') => async (req: Request, res: Response) => { ok(res, await this.service.concertTransition(id(req), action, principal(req))); };
    ticketList = async (req: Request, res: Response) => { ok(res, await this.service.ticketList(id(req, 'concertId'), req.user)); };
    ticketCreate = async (req: Request, res: Response) => { ok(res, await this.service.ticketCreate(id(req, 'concertId'), req.body, principal(req)), 201); };
    ticketUpdate = async (req: Request, res: Response) => { ok(res, await this.service.ticketUpdate(id(req), req.body, principal(req))); };
    ticketDelete = async (req: Request, res: Response) => { await this.service.ticketDelete(id(req), principal(req)); res.sendStatus(204); };
}
