// Permission codes checked by the API. The grants per role live in the database (role_permissions);
// database/venti_shema2.sql seeds them. Ownership and memberships (concert owner, concert_staff,
// organization_members) are still checked on top of these. tickets.validate is never granted by a role:
// MysqlAuthRepository.access adds it while the user holds a concert_staff assignment.
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
// True when the principal holds at least one of the codes.
export const can = (principal, ...codes) => Boolean(principal?.permissions?.some(code => codes.includes(code)));
