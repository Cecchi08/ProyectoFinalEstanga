import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { CommerceService } from '../services/commerce.service.ts';
import { idSchema } from '../validators/management.schemas.ts';
import { pageSchema } from '../validators/commerce.schemas.ts';

const principal = (req: Request) => { if (!req.user) throw unauthorized(); return req.user; };
const id = (req: Request) => idSchema.parse(req.params.id);
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

export class CommerceController {
    constructor(private readonly service: CommerceService) {}
    create = async (req: Request, res: Response) => { ok(res, await this.service.create(req.body, principal(req)), 201); };
    purchase = async (req: Request, res: Response) => { ok(res, await this.service.purchase(id(req), principal(req))); };
    ticket = async (req: Request, res: Response) => { ok(res, await this.service.ticket(id(req), principal(req))); };
    transition = (action: 'confirm' | 'cancel') => async (req: Request, res: Response) => {
        ok(res, await this.service.transition(id(req), action, principal(req)));
    };
    list = (kind: 'purchases' | 'tickets') => async (req: Request, res: Response) => {
        const query = pageSchema.parse(req.query);
        const result = await this.service[kind](principal(req), query);
        res.json({ success: true, data: result.data, pagination: { ...query, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });
    };
    validate = async (req: Request, res: Response) => { ok(res, await this.service.validate(req.body, principal(req))); };
}
