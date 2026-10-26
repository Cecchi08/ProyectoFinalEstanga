import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { AdminService } from '../services/admin.service.ts';
import { idSchema } from '../validators/management.schemas.ts';
import { auditQuerySchema, organizationQuerySchema, reactivateSchema, revokeSchema, roleCodeSchema, userQuerySchema } from '../validators/admin.schemas.ts';

const principal = (req: Request) => { if (!req.user) throw unauthorized(); return req.user; };
const id = (req: Request) => idSchema.parse(req.params.id);
const page = (res: Response, result: { data: unknown; total: number }, query: { page: number; limit: number }) =>
    res.json({ success: true, data: result.data, pagination: { page: query.page, limit: query.limit, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });

export class AdminController {
    constructor(private readonly service: AdminService) {}
    users = async (req: Request, res: Response) => { const query = userQuerySchema.parse(req.query); page(res, await this.service.users(query), query); };
    user = async (req: Request, res: Response) => { res.json({ success: true, data: await this.service.user(id(req)) }); };
    grant = async (req: Request, res: Response) => {
        const result = await this.service.grant(id(req), req.body.role, req.body.reason, principal(req));
        res.status(result.changed ? 201 : 200).json({ success: true, data: result });
    };
    revoke = async (req: Request, res: Response) => {
        const { reason } = revokeSchema.parse(req.body ?? {});
        res.json({ success: true, data: await this.service.revoke(id(req), roleCodeSchema.parse(req.params.role), reason, principal(req)) });
    };
    profiles = async (req: Request, res: Response) => { res.json({ success: true, data: await this.service.profiles(principal(req)) }); };
    activate = async (req: Request, res: Response) => {
        const result = await this.service.activate(req.body.role, principal(req));
        res.status(result.changed ? 201 : 200).json({ success: true, data: result });
    };
    audit = async (req: Request, res: Response) => { const query = auditQuerySchema.parse(req.query); page(res, await this.service.auditLog(query), query); };
    suspend = async (req: Request, res: Response) => { res.json({ success: true, data: await this.service.suspend(id(req), req.body.reason, principal(req)) }); };
    reactivate = async (req: Request, res: Response) => {
        res.json({ success: true, data: await this.service.reactivate(id(req), reactivateSchema.parse(req.body ?? {}).reason, principal(req)) });
    };
    organizations = async (req: Request, res: Response) => {
        const query = organizationQuerySchema.parse(req.query); page(res, await this.service.organizations(query), query);
    };
}
