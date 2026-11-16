import { AppError, unauthorized } from '../utils/app-error.util.js';
import { can } from '../utils/access.util.js';
// Verifica el token Bearer de acceso y reconstruye el Principal vigente desde la base de datos.
export function authenticate(tokens, auth) {
    return async (req, _res, next) => {
        const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
        if (!match?.[1])
            throw unauthorized();
        const claims = tokens.verify(match[1]);
        req.user = await auth.principal(claims.id);
        next();
    };
}
// Exige al menos uno de los códigos de permiso indicados. Como el Principal se reconstruye en cada
// petición desde la base, revocar un rol o permiso surte efecto de inmediato.
export function requirePermission(...codes) {
    return (req, _res, next) => {
        if (!req.user)
            throw unauthorized();
        if (!can(req.user, ...codes))
            throw new AppError(403, 'FORBIDDEN', 'Permisos insuficientes.');
        next();
    };
}
// Middleware de alcance por concierto (dueño organizador o staff asignado).
function concertGuard(service, scope, parameter) {
    return async (req, _res, next) => {
        if (!req.user)
            throw unauthorized();
        const id = req.params[parameter];
        if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id))
            throw new AppError(422, 'VALIDATION_ERROR', 'ID de concierto inválido.');
        await service.concert(req.user, id, scope);
        next();
    };
}
export const authorizeConcertOwner = (service, parameter = 'concertId') => concertGuard(service, 'owner', parameter);
export const authorizeStaffAssignment = (service, parameter = 'concertId') => concertGuard(service, 'staff', parameter);
