import { AppError } from '../utils/app-error.util.js';
import { ManagementRepository } from '../repositories/management.repository.ts';
import { ParticipationRepository } from '../repositories/participation.repository.ts';
import { PermissionsService } from './permissions.service.js';
import type { Database, Principal } from '../types/management.types.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';

export class ParticipationService {
    private readonly permissions: PermissionsService;
    constructor(private readonly database: Database) { this.permissions = new PermissionsService(database); }
    favorites(user: Principal, query: PageQuery & { concert_id?: string }) {
        return this.database.read(repo => new ParticipationRepository(repo.connection).favorites(user, query));
    }
    async favorite(concertId: string, user: Principal, add: boolean) {
        await this.database.transaction(async repo => {
            const concert = await new ManagementRepository(repo.connection).concert(concertId, true);
            if (!concert || (add && concert.status !== 'PUBLISHED' && !user.roles.includes('ADMIN') &&
                !(user.roles.includes('ORGANIZER') && user.id === concert.organizer_id)))
                throw new AppError(404, 'NOT_FOUND', 'Concierto inexistente.', undefined);
            const favorites = new ParticipationRepository(repo.connection);
            if (add) await favorites.addFavorite(user.id, concertId);
            else await favorites.removeFavorite(user.id, concertId);
        });
        return { concert_id: concertId, favorite: add };
    }
    assignments(user: Principal, query: PageQuery) {
        return this.database.read(repo => new ParticipationRepository(repo.connection).assignments(user, query));
    }
    async attendees(concertId: string, user: Principal, query: PageQuery) {
        await this.permissions.concert(user, concertId, 'attendees');
        return this.database.read(repo => new ParticipationRepository(repo.connection).attendees(concertId, user, query));
    }
}
