// Códigos de permiso validados por la API. Las asignaciones por rol viven en MySQL (role_permissions);
// backups/schema.sql las siembra. La propiedad y membresías (dueño del concierto, concert_staff,
// organization_members) se verifican además encima de estos permisos. tickets.validate nunca se otorga por rol:
// MysqlAuthRepository.access lo agrega dinámicamente mientras el usuario tenga asignación en concert_staff.
export const PERMISSIONS = Object.freeze({
    concertsManage: 'concerts.manage',
    concertsManageAll: 'concerts.manage_all',
    concertsStaffManage: 'concerts.staff.manage',
    ticketsPurchase: 'tickets.purchase',
    ticketsValidate: 'tickets.validate',
    ticketsValidateAll: 'tickets.validate_all',
    ordersReadAll: 'orders.read_all',
    statisticsOwn: 'statistics.own',
    statisticsGlobal: 'statistics.global',
    catalogsManage: 'catalogs.manage',
    usersManage: 'users.manage',
    venuesBrowse: 'marketplace.venues.browse',
    quotesRequest: 'marketplace.quotes.request',
    reservationsCreate: 'marketplace.reservations.create',
    establishmentsManage: 'marketplace.establishments.manage',
    quotesRespond: 'marketplace.quotes.respond',
    reservationsManage: 'marketplace.reservations.manage',
    marketplaceAdmin: 'marketplace.admin',
    artistProfileManage: 'artist.profile.manage',
    artistsAdmin: 'artists.admin',
    servicesManage: 'services.manage',
    serviceQuotesRespond: 'services.quotes.respond',
    serviceQuotesRequest: 'services.quotes.request',
    servicesAdmin: 'services.admin',
});
// Devuelve true si el Principal posee al menos uno de los permisos indicados.
export const can = (principal, ...codes) => Boolean(principal?.permissions?.some(code => codes.includes(code)));
