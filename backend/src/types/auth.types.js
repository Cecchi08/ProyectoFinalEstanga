// Global profiles; a user may hold several. What each one allows comes from role_permissions.
export const ROLES = ['ADMIN', 'COMPRADOR', 'ARTISTA', 'ORGANIZADOR', 'VENUE', 'EMPRESA_SERVICIOS', 'GUEST'];
export const DEFAULT_ROLE = 'COMPRADOR';
// Profiles a registered person activates alone. ORGANIZADOR, VENUE and EMPRESA_SERVICIOS involve a business and are granted by an ADMIN.
export const SELF_SERVICE_ROLES = ['COMPRADOR', 'ARTISTA'];
// Profiles that involve a business: requested by the person, granted only by an ADMIN after review.
export const REQUESTABLE_ROLES = ['ORGANIZADOR', 'VENUE', 'EMPRESA_SERVICIOS'];
export function publicUser(user) {
    const { password_hash: _password, ...safe } = user;
    return safe;
}
