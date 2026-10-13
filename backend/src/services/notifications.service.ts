import type { Database } from '../types/management.types.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';
import { NotificationsRepository } from '../repositories/notifications.repository.ts';
import { AppError } from '../utils/app-error.util.js';
export class NotificationsService {
    constructor(private readonly database: Database) {}
    list(userId: string, query: PageQuery) {
        return this.database.transaction(repo => new NotificationsRepository(repo.connection).list(userId, query));
    }
    read(userId: string, id?: string) {
        return this.database.transaction(async repo => {
            const affected = await new NotificationsRepository(repo.connection).read(userId, id);
            if (id && !affected) throw new AppError(404, 'NOT_FOUND', 'Notificación inexistente.', undefined);
            return { updated: affected };
        });
    }
}
