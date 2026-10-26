import { AppError } from '../utils/app-error.util.js';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
export function assertConcertOwner(principal, ownerId) {
    if (can(principal, P.concertsManageAll) || (can(principal, P.concertsManage) && String(ownerId) === principal.id))
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
            if (can(principal, P.concertsManageAll))
                return;
            // Global QR validation (ADMIN) also reaches the staff tools of any concert.
            if (scope === 'staff' && can(principal, P.ticketsValidate))
                return;
            if (scope === 'owner')
                return assertConcertOwner(principal, ownerId);
            if (scope === 'attendees' && can(principal, P.concertsManage) && String(ownerId) === principal.id)
                return assertConcertOwner(principal, ownerId);
            // Staff is not a global role: the per-concert assignment in concert_staff grants access.
            if ((scope === 'staff' || scope === 'attendees') && await repo.staffAssigned(concertId, principal.id))
                return;
            throw new AppError(403, 'FORBIDDEN', 'No tenés permisos sobre este concierto.');
        });
    }
}
