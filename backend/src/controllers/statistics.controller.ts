import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { idSchema } from '../validators/management.schemas.ts';
import { statisticsQuerySchema } from '../validators/statistics.schemas.ts';
import { StatisticsService } from '../services/statistics.service.ts';
export class StatisticsController {
    constructor(private readonly service: StatisticsService) {}
    summary = (global: boolean) => async (req: Request, res: Response) => {
        if (!req.user) throw unauthorized();
        const query = statisticsQuerySchema.parse(req.query);
        if (req.params.id) query.concert_id = idSchema.parse(req.params.id);
        res.json({ success: true, data: await this.service.summary(req.user, query, global) });
    };
}
