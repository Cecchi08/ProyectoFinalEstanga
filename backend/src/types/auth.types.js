// Perfiles globales; un usuario puede tener varios. Lo que habilita cada uno proviene de role_permissions.
export const ROLES = ['ADMIN', 'COMPRADOR', 'ARTISTA', 'ORGANIZADOR', 'VENUE', 'EMPRESA_SERVICIOS', 'GUEST'];
export const DEFAULT_ROLE = 'COMPRADOR';
// Perfiles que una persona registrada activa por sí sola. ORGANIZADOR, VENUE y EMPRESA_SERVICIOS involucran negocio y los otorga un ADMIN.
export const SELF_SERVICE_ROLES = ['COMPRADOR', 'ARTISTA'];
// Perfiles que involucran actividad comercial: los solicita el usuario y los aprueba un ADMIN tras revisión.
export const REQUESTABLE_ROLES = ['ORGANIZADOR', 'VENUE', 'EMPRESA_SERVICIOS'];
// Remueve password_hash antes de devolver el usuario al cliente.
export function publicUser(user) {
    const { password_hash: _password, ...safe } = user;
    return safe;
}
