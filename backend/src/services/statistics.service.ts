import type { Database, Principal } from '../types/management.types.ts';
import type { StatisticsQuery } from '../validators/statistics.schemas.ts';
import { StatisticsRepository } from '../repositories/statistics.repository.ts';
import { ManagementRepository } from '../repositories/management.repository.ts';
import { AppError } from '../utils/app-error.util.js';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
export class StatisticsService {
    constructor(private readonly database: Database) {}
    summary(user: Principal, query: StatisticsQuery, global: boolean) {
        if (!can(user, global ? P.statisticsGlobal : P.statisticsOwn))
            throw new AppError(403, 'FORBIDDEN', 'Permisos insuficientes.', undefined);
        return this.database.transaction(async db => {
            if (query.concert_id) {
                const concert = await new ManagementRepository(db.connection).concert(query.concert_id);
                if (!concert || (!global && concert.organizer_id !== user.id))
                    throw new AppError(404, 'NOT_FOUND', 'Concierto inexistente.', undefined);
            }
            const repo = new StatisticsRepository(db.connection);
            const summary = await repo.summary(query, global ? undefined : user.id);
            return { ...summary, ...(global ? await repo.users() : {}) };
        });
    }
}
