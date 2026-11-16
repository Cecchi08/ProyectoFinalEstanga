import type { Database } from '../types/management.types.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';
import { NotificationsRepository } from '../repositories/notifications.repository.ts';
import { AppError } from '../utils/app-error.util.js';
// Servicio de notificaciones: consulta el buzón del usuario y marca avisos como leídos.
export class NotificationsService {
    constructor(private readonly database: Database) {}
    // Lista paginada de notificaciones y contador de no leídas.
    list(userId: string, query: PageQuery) {
        return this.database.transaction(repo => new NotificationsRepository(repo.connection).list(userId, query));
    }
    // Marca una notificación puntual (o todas las no leídas si no se pasa id) como leída.
    read(userId: string, id?: string) {
        return this.database.transaction(async repo => {
            const affected = await new NotificationsRepository(repo.connection).read(userId, id);
            if (id && !affected) throw new AppError(404, 'NOT_FOUND', 'Notificación inexistente.', undefined);
            return { updated: affected };
        });
    }
}
