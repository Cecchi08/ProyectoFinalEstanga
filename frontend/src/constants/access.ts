// Single source of role codes/labels and permission codes in the app: the API has no GET /roles.
// Keep in sync with backend/src/types/auth.types.js, backend/src/utils/access.util.js and docs/PERMISOS.md.
export const ROLES = ["ADMIN", "COMPRADOR", "ARTISTA", "ORGANIZADOR", "VENUE", "EMPRESA_SERVICIOS", "GUEST"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  COMPRADOR: "Comprador",
  ARTISTA: "Artista",
  ORGANIZADOR: "Organizador",
  VENUE: "Venue",
  EMPRESA_SERVICIOS: "Empresa de servicios",
  GUEST: "Invitado",
};
export const roleLabel = (code: string) => ROLE_LABELS[code as Role] ?? code;
// A person activates these alone (POST /me/profiles); an ADMIN grants the rest.
export const SELF_SERVICE_ROLES: readonly Role[] = ["COMPRADOR", "ARTISTA"];
// GUEST belongs to the guest flow and is never granted or revoked by hand.
export const ASSIGNABLE_ROLES: readonly Role[] = ROLES.filter((role) => role !== "GUEST");

export const P = {
  concertsManage: "concerts.manage",
  concertsManageAll: "concerts.manage_all",
  concertsStaffManage: "concerts.staff.manage",
  ticketsPurchase: "tickets.purchase",
  ticketsValidate: "tickets.validate",
  ordersReadAll: "orders.read_all",
  statisticsOwn: "statistics.own",
  statisticsGlobal: "statistics.global",
  catalogsManage: "catalogs.manage",
  usersManage: "users.manage",
  quotesRequest: "marketplace.quotes.request",
  reservationsCreate: "marketplace.reservations.create",
  establishmentsManage: "marketplace.establishments.manage",
  quotesRespond: "marketplace.quotes.respond",
  reservationsManage: "marketplace.reservations.manage",
  marketplaceAdmin: "marketplace.admin",
  artistProfileManage: "artist.profile.manage",
  artistsAdmin: "artists.admin",
} as const;
export type Permission = (typeof P)[keyof typeof P];
// Any of the codes. The backend enforces the same rule; the UI only hides what would be refused.
export const can = (permissions: readonly string[], codes: Permission | readonly Permission[]) =>
  (typeof codes === "string" ? [codes] : codes).some((code) => permissions.includes(code));
// Screens grouped under /admin: any of these opens the section.
export const ADMIN_PERMISSIONS: readonly Permission[] = [P.usersManage, P.catalogsManage, P.statisticsGlobal, P.concertsManageAll];
