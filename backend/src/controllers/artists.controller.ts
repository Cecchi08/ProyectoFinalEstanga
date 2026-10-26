import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { ArtistsService } from '../services/artists.service.ts';
import { idSchema } from '../validators/management.schemas.ts';
import { artistMemberPatchSchema, artistQuerySchema } from '../validators/artists.schemas.ts';

const principal = (req: Request) => { if (!req.user) throw unauthorized(); return req.user; };
const id = (req: Request, key = 'id') => idSchema.parse(req.params[key]);
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

export class ArtistsController {
    constructor(private readonly service: ArtistsService) {}
    list = async (req: Request, res: Response) => {
        const query = artistQuerySchema.parse(req.query); const result = await this.service.list(query);
        res.json({ success: true, data: result.data, pagination: { page: query.page, limit: query.limit, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });
    };
    mine = async (req: Request, res: Response) => { ok(res, await this.service.mine(principal(req))); };
    concerts = async (req: Request, res: Response) => { ok(res, await this.service.concerts(id(req), req.user)); };
    get = async (req: Request, res: Response) => { ok(res, await this.service.get(id(req), req.user)); };
    create = async (req: Request, res: Response) => { ok(res, await this.service.create(req.body, principal(req)), 201); };
    update = async (req: Request, res: Response) => { ok(res, await this.service.update(id(req), req.body, principal(req))); };
    status = (status: 'PUBLISHED' | 'ARCHIVED') => async (req: Request, res: Response) => { ok(res, await this.service.status(id(req), status, principal(req))); };
    members = async (req: Request, res: Response) => { ok(res, await this.service.members(id(req), principal(req))); };
    addMember = async (req: Request, res: Response) => { ok(res, await this.service.addMember(id(req), req.body, principal(req)), 201); };
    updateMember = async (req: Request, res: Response) => {
        ok(res, await this.service.updateMember(id(req), id(req, 'userId'), artistMemberPatchSchema.parse(req.body).member_role, principal(req)));
    };
    removeMember = async (req: Request, res: Response) => { await this.service.removeMember(id(req), id(req, 'userId'), principal(req)); res.sendStatus(204); };
}
