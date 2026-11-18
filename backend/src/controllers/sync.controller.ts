import type { Request, Response } from 'express';
import { SyncService } from '../services/sync.service.ts';

export class SyncController {
    constructor(private readonly service: SyncService) {}

    versions = async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: await this.service.versions(req.user),
        });
    };
}

