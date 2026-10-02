import type { Request, Response } from 'express';
import { unauthorized } from '../utils/app-error.util.js';
import { RecommendationsService } from '../services/recommendations.service.ts';
import { recommendationsQuerySchema } from '../validators/recommendations.schemas.ts';
import { emptySchema } from '../validators/management.schemas.ts';
const userId = (req: Request) => { if (!req.user) throw unauthorized(); return req.user.id; };
export class RecommendationsController {
    constructor(private readonly service: RecommendationsService) {}
    recommendations = async (req: Request, res: Response) => {
        const { limit } = recommendationsQuerySchema.parse(req.query);
        res.json({ success: true, data: await this.service.recommendations(userId(req), limit) });
    };
    preferences = async (req: Request, res: Response) => {
        emptySchema.parse(req.query);
        res.json({ success: true, data: await this.service.preferences(userId(req)) });
    };
    update = async (req: Request, res: Response) => {
        emptySchema.parse(req.query);
        res.json({ success: true, data: await this.service.setPreference(userId(req), req.body.recommendations_enabled) });
    };
}
