import { AppError } from '../utils/app-error.util.js';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
// Verifica que el usuario sea dueño del concierto o administrador con acceso global.
export function assertConcertOwner(principal, ownerId) {
    if (can(principal, P.concertsManageAll) || (can(principal, P.concertsManage) && String(ownerId) === principal.id))
        return;
    throw new AppError(403, 'FORBIDDEN', 'No tenés permisos sobre este concierto.');
}
// Servicio de autorización por recurso (concierto, staff y asistentes).
export class PermissionsService {
    db;
    constructor(db) {
        this.db = db;
    }
    // Comprueba el alcance solicitado ('owner', 'staff' o 'attendees') para el concierto indicado.
    async concert(principal, concertId, scope) {
        await this.db.read(async (repo) => {
            const ownerId = await repo.concertOwner(concertId);
            if (!ownerId)
                throw new AppError(404, 'CONCERT_NOT_FOUND', 'Concierto inexistente.');
            if (can(principal, P.concertsManageAll))
                return;
            // La validación global de QR (ADMIN) también habilita las herramientas de staff en cualquier concierto.
            if (scope === 'staff' && can(principal, P.ticketsValidateAll))
                return;
            if (scope === 'owner')
                return assertConcertOwner(principal, ownerId);
            if (scope === 'attendees' && can(principal, P.concertsManage) && String(ownerId) === principal.id)
                return assertConcertOwner(principal, ownerId);
            // Staff no es un rol global: la asignación por concierto en concert_staff otorga el acceso.
            if ((scope === 'staff' || scope === 'attendees') && await repo.staffAssigned(concertId, principal.id))
                return;
            throw new AppError(403, 'FORBIDDEN', 'No tenés permisos sobre este concierto.');
        });
    }
}
