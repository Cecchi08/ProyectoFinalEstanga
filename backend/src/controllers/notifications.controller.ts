import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { idSchema, emptySchema } from '../validators/management.schemas.ts';
import { pageSchema } from '../validators/commerce.schemas.ts';
import { NotificationsService } from '../services/notifications.service.ts';
const userId = (req: Request) => { if (!req.user) throw unauthorized(); return req.user.id; };
export class NotificationsController {
    constructor(private readonly service: NotificationsService) {}
    list = async (req: Request, res: Response) => {
        const query = pageSchema.parse(req.query);
        const { items, unread_count, total } = await this.service.list(userId(req), query);
        res.json({ success: true, data: { items, unread_count }, pagination: { ...query, total, total_pages: Math.ceil(total / query.limit) } });
    };
    read = async (req: Request, res: Response) => {
        emptySchema.parse(req.query); emptySchema.parse(req.body ?? {});
        res.json({ success: true, data: await this.service.read(userId(req), req.params.id ? idSchema.parse(req.params.id) : undefined) });
    };
}
