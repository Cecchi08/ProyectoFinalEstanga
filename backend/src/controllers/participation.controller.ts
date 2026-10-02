import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { ParticipationService } from '../services/participation.service.ts';
import { idSchema } from '../validators/management.schemas.ts';
import { pageSchema, type PageQuery } from '../validators/commerce.schemas.ts';
import { favoritesQuerySchema } from '../validators/participation.schemas.ts';

const principal = (req: Request) => { if (!req.user) throw unauthorized(); return req.user; };
const page = (res: Response, result: { data: unknown; total: number }, query: PageQuery) =>
    res.json({ success: true, data: result.data, pagination: { page: query.page, limit: query.limit, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });
export class ParticipationController {
    constructor(private readonly service: ParticipationService) {}
    favorites = async (req: Request, res: Response) => {
        const query = favoritesQuerySchema.parse(req.query);
        page(res, await this.service.favorites(principal(req), query), query);
    };
    favorite = (add: boolean) => async (req: Request, res: Response) => {
        const data = await this.service.favorite(idSchema.parse(req.params.concertId), principal(req), add);
        if (add) res.json({ success: true, data }); else res.status(204).end();
    };
    assignments = async (req: Request, res: Response) => {
        const query = pageSchema.parse(req.query);
        page(res, await this.service.assignments(principal(req), query), query);
    };
    attendees = async (req: Request, res: Response) => {
        const query = pageSchema.parse(req.query);
        page(res, await this.service.attendees(idSchema.parse(req.params.id), principal(req), query), query);
    };
}
