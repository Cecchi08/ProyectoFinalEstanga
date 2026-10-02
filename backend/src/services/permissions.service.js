import { AppError } from '../utils/app-error.util.js';
export function assertConcertOwner(principal, ownerId) {
    if (principal.roles.includes('ADMIN') || (principal.roles.includes('ORGANIZER') && String(ownerId) === principal.id))
        return;
    throw new AppError(403, 'FORBIDDEN', 'No tenés permisos sobre este concierto.');
}
export class PermissionsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async concert(principal, concertId, scope) {
        await this.db.read(async (repo) => {
            const ownerId = await repo.concertOwner(concertId);
            if (!ownerId)
                throw new AppError(404, 'CONCERT_NOT_FOUND', 'Concierto inexistente.');
            if (principal.roles.includes('ADMIN'))
                return;
            if (scope === 'owner')
                return assertConcertOwner(principal, ownerId);
            if (scope === 'staff' && principal.roles.includes('STAFF') && await repo.staffAssigned(concertId, principal.id))
                return;
            throw new AppError(403, 'FORBIDDEN', 'No tenés permisos sobre este concierto.');
        });
    }
}
