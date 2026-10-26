import { ParticipationRepository } from '../repositories/participation.repository.ts';
import { PermissionsService } from './permissions.service.js';
import type { Database, Principal } from '../types/management.types.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';

export class ParticipationService {
    private readonly permissions: PermissionsService;
    constructor(private readonly database: Database) { this.permissions = new PermissionsService(database); }
    assignments(user: Principal, query: PageQuery) {
        return this.database.read(repo => new ParticipationRepository(repo.connection).assignments(user, query));
    }
    async attendees(concertId: string, user: Principal, query: PageQuery) {
        await this.permissions.concert(user, concertId, 'attendees');
        return this.database.read(repo => new ParticipationRepository(repo.connection).attendees(concertId, user, query));
    }
}
