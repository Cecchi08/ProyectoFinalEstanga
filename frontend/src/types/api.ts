// Global profiles (user_roles). A user may hold several; what each one allows comes from
// role_permissions, so screens gate on permissions, never on these codes.
// Staff is not a profile: it is a per-concert assignment (GET /staff/assignments).
export const ROLES = [
  "ADMIN",
  "COMPRADOR",
  "ARTISTA",
  "ORGANIZADOR",
  "VENUE",
  "EMPRESA_SERVICIOS",
  "GUEST",
] as const;
export type Role = (typeof ROLES)[number];
// GUEST belongs to the guest flow: it is never granted or revoked by hand.
export const ASSIGNABLE_ROLES = ROLES.filter(
  (role) => role !== "GUEST",
) as Exclude<Role, "GUEST">[];
// Profiles a registered person activates alone (POST /me/profiles).
export const SELF_SERVICE_ROLES = ["COMPRADOR", "ARTISTA"] as const;
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administración",
  COMPRADOR: "Comprador",
  ARTISTA: "Artista",
  ORGANIZADOR: "Organizador",
  VENUE: "Espacios",
  EMPRESA_SERVICIOS: "Empresa de servicios",
  GUEST: "Invitado",
};
export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string | null;
  email_verified_at: string | null;
}
export interface Session {
  user: User;
  roles: Role[];
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}
export interface Envelope<T> {
  success: true;
  data: T;
  pagination?: Pagination;
}
export interface Notification {
  id: string;
  type: 'PURCHASE_CONFIRMED' | 'CONCERT_REMINDER' | 'CONCERT_UPDATED' | 'CONCERT_CANCELLED' | 'RECOMMENDATION' | 'POST_EVENT' | 'QUOTE_UPDATE' | 'RESERVATION_UPDATE' | 'SYSTEM';
  title: string; message: string; read_at: string | null; created_at: string;
  concert_id: string | null; purchase_id: string | null; reservation_id: string | null; quote_id: string | null; concert_status: string | null;
  // Service-company quotes (QUOTE_UPDATE): quote_id is only for space quotes.
  service_quote_id: string | null;
}
export interface Notifications { items: Notification[]; unread_count: number }
export interface Statistics {
  tickets_sold: number; revenue: string; attendees: number; tickets_used: number; tickets_pending: number;
  capacity: number; occupancy_percent: number; concerts: number; active_concerts: number; confirmed_purchases: number;
  users?: number; organizers?: number;
  sales_by_day: { date: string; tickets_sold: number; revenue: string }[];
  activity: { status: string; purchases: number }[];
}
export interface Named {
  id: string;
  name: string;
  code?: string;
}
export type Catalog = "genres" | "provinces" | "districts" | "cities";
export interface CatalogItem extends Named {
  slug?: string;
  province_id?: string;
  district_id?: string;
  postal_code?: string | null;
}
export interface TicketType extends Named {
  price: string;
  stock_total: number;
  sale_start: string | null;
  sale_end: string | null;
  max_per_purchase: number | null;
}
export interface Concert extends Named {
  organizer_id: string;
  slug: string;
  artist_name: string;
  // Location: a marketplace space (optionally through a confirmed reservation) or a free-text place.
  venue_id: string | null;
  reservation_id: string | null;
  address_line: string | null;
  city_id: string | null;
  description: string | null;
  image_url: string | null;
  start_datetime: string;
  end_datetime: string | null;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED" | "FINISHED";
  venue_name: string | null;
  city_name: string | null;
  province_name: string | null;
  // Linked artist profiles (id and slug); a concert without links lists artist_name alone.
  artists: ConcertArtist[];
  // Lowest active ticket price (a number in the JSON); null without active ticket types.
  price_from?: number | null;
  genres: Named[];
  ticket_types: TicketType[];
}
export interface OrderPayment {
  id: string;
  amount: string;
  currency: string;
  status: "APPROVED" | "REJECTED" | "REFUNDED";
  provider: "SIMULATED";
  is_simulated: boolean;
  simulated_reference: string;
  processed_at: string;
  refunded_at: string | null;
}
export interface ConcertArtist {
  id?: string;
  name: string;
  slug?: string;
  image_url?: string | null;
}
export interface Purchase {
  id: string;
  status: string;
  total: string;
  created_at: string;
  expires_at: string | null;
  refund_status?: "NONE" | "REFUNDED";
  refunded_at?: string | null;
  payments?: OrderPayment[];
  items?: {
    id: string;
    ticket_type_name: string;
    quantity: number;
    unit_price: string;
  }[];
}
export interface Ticket {
  id: string;
  status: string;
  qr_token: string;
  concert_id: string;
  concert_name: string;
  concert_status: string;
  start_datetime: string;
  venue_name: string | null;
  venue_address: string | null;
  ticket_type_name: string;
}
export interface Attendee {
  ticket_id: string;
  ticket_type_name: string;
  first_name: string;
  last_name: string;
  status: string;
  purchase_status: string;
  used_at: string | null;
}
// Permission codes the API authorizes with (backend/src/utils/access.util.js plus the codes
// seeded in database/venti_shema2.sql). GET /auth/me returns the union of the user's profiles.
export type Permission =
  | "concerts.browse"
  | "concerts.manage"
  | "concerts.manage_all"
  | "concerts.staff.manage"
  | "tickets.purchase"
  | "tickets.validate"
  | "tickets.validate_all"
  | "orders.read_all"
  | "statistics.own"
  | "statistics.global"
  | "catalogs.manage"
  | "users.manage"
  | "marketplace.venues.browse"
  | "marketplace.quotes.request"
  | "marketplace.reservations.create"
  | "marketplace.establishments.manage"
  | "marketplace.quotes.respond"
  | "marketplace.reservations.manage"
  | "marketplace.admin"
  | "artist.profile.manage"
  | "artists.admin"
  | "services.manage"
  | "services.quotes.respond"
  | "services.quotes.request"
  | "services.admin";
// True when the user holds at least one of the codes, like `can` in the backend.
export const can = (
  permissions: readonly Permission[],
  allowed: readonly Permission[],
) => allowed.some((code) => permissions.includes(code));
// ---- Profiles and permissions ----
export interface Access {
  roles: Role[];
  permissions: Permission[];
}
export interface Me extends Access {
  user: User;
}
export interface RoleInfo {
  code: Role;
  name: string;
  description: string | null;
}
export interface SelfProfiles extends Access {
  self_service: (RoleInfo & { active: boolean })[];
  requestable: (RoleInfo & { active: boolean; pending: boolean })[];
  requests: ProfileRequest[];
}
export type ProfileRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export interface ProfileRequest {
  id: string;
  role: Role;
  status: ProfileRequestStatus;
  reason: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
}
// GET /admin/profile-requests (users.manage): the pending queue or any status, with the account it belongs to.
export interface AdminProfileRequest extends ProfileRequest {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  user_status: string;
}
export interface AdminUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string;
  is_guest: boolean;
  email_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
  roles: Role[];
}
export interface RoleChange {
  changed: boolean;
  user: AdminUser;
}
export type AuditAction =
  | "ROLE_GRANTED"
  | "ROLE_REVOKED"
  | "ROLE_SELF_ACTIVATED"
  | "USER_SUSPENDED"
  | "USER_REACTIVATED"
  | "ORDER_PAYMENT_APPROVED"
  | "ORDER_PAYMENT_REJECTED"
  | "ORDER_REFUNDED"
  | "SERVICE_PROVIDER_VERIFIED"
  | "SERVICE_PROVIDER_UNVERIFIED"
  | "ESTABLISHMENT_APPROVED"
  | "ESTABLISHMENT_REJECTED"
  | "CONCERT_PUBLISHED"
  | "CONCERT_CANCELLED"
  | "RESERVATION_REFUNDED"
  | "PROFILE_REQUESTED"
  | "PROFILE_REQUEST_APPROVED"
  | "PROFILE_REQUEST_REJECTED";
export type AuditEntity = "USER" | "ORDER" | "SERVICE_PROVIDER" | "ESTABLISHMENT" | "CONCERT" | "RESERVATION" | "PROFILE_REQUEST";
export interface AuditEntry {
  id: string;
  action: AuditAction;
  actor_user_id: string;
  target_user_id: string | null;
  role: Role | null;
  entity_type: AuditEntity | null;
  entity_id: string | null;
  details: Record<string, unknown> | string | null;
  created_at: string;
}
// ---- Artist profiles ----
export type ArtistStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type MemberRole = "OWNER" | "MEMBER";
export interface ArtistMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  // Only members and artists.admin receive the email.
  email?: string;
  member_role: MemberRole;
  created_at: string;
}
export interface Artist {
  id: string;
  stage_name: string;
  slug: string;
  bio: string | null;
  city_id: string | null;
  city_name: string | null;
  image_url: string | null;
  website: string | null;
  status: ArtistStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  genres: Named[];
}
export interface ArtistDetail extends Artist {
  members: ArtistMember[];
}
// ---- Marketplace ----
export type OccupancyMode = "VENUE" | "ESTABLISHMENT";
export interface Venue extends Named {
  establishment_id: string;
  organization_id: string;
  description: string | null;
  venue_type: string;
  venue_type_name: string;
  capacity_standing: number | null;
  capacity_seated: number | null;
  area_m2: string | null;
  price_per_hour: string;
  currency: string;
  min_booking_minutes: number;
  hold_minutes: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  establishment_name: string;
  establishment_status: string;
  address_line: string;
  city_id: string;
  city_name: string;
  cover_url: string | null;
}
export interface VenueDetail extends Venue {
  amenities: { code: string; name: string }[];
  photos: { id: string; url: string; is_cover: boolean }[];
  opening_hours: OpeningHour[];
}
export interface OpeningHour { day_of_week: number; opens_at: string; closes_at: string }
export interface MarketplaceCatalogs {
  venue_types: (Named & { code: string })[];
  amenities: (Named & { code: string })[];
  occupancy_modes: { code: OccupancyMode; name: string; is_exclusive: boolean; description: string | null }[];
}
export interface Availability {
  venue_id: string;
  from: string;
  to: string;
  mode: OccupancyMode;
  opening_hours: OpeningHour[];
  busy: { source: "RESERVATION" | "BLOCK"; phase: string | null; starts_at: string; ends_at: string; scope: OccupancyMode }[];
  available?: boolean;
}
interface Schedule {
  id: string;
  public_code: string;
  venue_id: string;
  venue_name: string;
  establishment_id: string;
  organization_id: string;
  occupancy_mode: OccupancyMode;
  event_name: string;
  expected_attendance: number | null;
  setup_start_at: string;
  event_start_at: string;
  event_end_at: string;
  teardown_end_at: string;
  status: string;
  total_amount: string | null;
  currency: string;
  created_at: string;
}
export interface Quote extends Schedule {
  requester_user_id: string;
  event_description: string | null;
  subtotal: string | null;
  fees: string | null;
  discount: string | null;
  valid_until: string | null;
  requester_notes: string | null;
  provider_notes: string | null;
  reservation_id: string | null;
  items?: { id: string; description: string; quantity: string; unit_price: string; line_total: string }[];
}
export interface Payment {
  id: string;
  amount: string;
  currency: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REFUNDED";
  provider: "SIMULATED";
  is_simulated: boolean;
  simulated_reference: string;
  processed_at: string | null;
}
export interface Reservation extends Schedule {
  establishment_name: string;
  user_id: string;
  quote_id: string | null;
  hold_expires_at: string | null;
  total_amount: string;
  notes: string | null;
  cancellation_reason: string | null;
  occupancies?: { phase: string; starts_at: string; ends_at: string }[];
  history?: { from_status: string | null; to_status: string; changed_by_user_id: string | null; changed_at: string }[];
  payments?: Payment[];
  // Direct bookings (no quote) are confirmed by the venue after the simulated payment.
  requires_venue_acceptance?: boolean;
  paid?: boolean;
  awaiting_venue?: boolean;
}
export interface PaymentResult { simulated: true; notice: string; payment: Payment; reservation: Reservation }
export interface Organization extends Named { slug: string; legal_name: string | null; tax_id: string | null; member_role: "OWNER" | "ADMIN" | "STAFF" }
export interface Member { user_id: string; first_name: string | null; last_name: string | null; email: string; member_role: "OWNER" | "ADMIN" | "STAFF" }
export interface Establishment extends Named {
  organization_id: string;
  city_id: string;
  description: string | null;
  address_line: string;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  // PENDING_REVIEW: sent by the owner, waiting for an ADMIN; only PUBLISHED is public.
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "ARCHIVED";
  review_note: string | null;
  reviewed_at: string | null;
  venues: number;
}
export interface PendingEstablishment extends Establishment { organization_name: string; city_name: string; updated_at: string }
export interface Block { id: string; venue_id: string | null; reason: string; description: string | null; starts_at: string; ends_at: string }
export interface StaffMember { user_id: string; first_name: string | null; last_name: string | null; email: string }
export interface AdminOrganization extends Named {
  legal_name: string | null;
  tax_id: string | null;
  slug: string;
  email: string | null;
  phone: string | null;
  status: "ACTIVE" | "SUSPENDED";
  created_by_user_id: string | null;
  created_at: string;
  members: number;
  establishments: number;
  owners: string[];
  service_provider: { status: PublicationStatus; is_verified: boolean } | null;
}
export interface ArtistConcerts { upcoming: Concert[]; past: Concert[] }
// ---- Service companies (EMPRESA_SERVICIOS) ----
export type PublicationStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type PricingUnit = "HOUR" | "DAY" | "EVENT" | "UNIT" | "QUOTE";
export interface ServiceCategory { id: string; code: string; name: string }
export interface ServiceOffering extends Named {
  provider_id: string;
  provider_name: string;
  provider_verified: boolean;
  city_id: string | null;
  city_name: string | null;
  coverage_area: string | null;
  category_code: string;
  category_name: string;
  slug: string;
  description: string | null;
  equipment: string | null;
  conditions: string | null;
  pricing_unit: PricingUnit;
  base_price: string | null;
  currency: string;
  status: PublicationStatus;
  published_at: string | null;
}
export interface ServiceProvider extends Named {
  legal_name: string | null;
  slug: string;
  email: string | null;
  phone: string | null;
  organization_status: string;
  description: string | null;
  city_id: string | null;
  city_name: string | null;
  coverage_area: string | null;
  status: PublicationStatus;
  published_at: string | null;
  is_verified: boolean;
  verified_at: string | null;
  published_offerings: number;
  // The viewer's role in the company (GET /services/providers/mine and /:id); null for outsiders.
  member_role?: "OWNER" | "ADMIN" | "STAFF" | null;
  offerings?: ServiceOffering[];
}
// GET /services/offerings/:id/availability: contracted (ACCEPTED) windows. Members also get quote_id and event_name.
export interface ServiceAvailability {
  offering_id: string;
  from: string;
  to: string;
  busy: { starts_at: string; ends_at: string; quote_id?: string; event_name?: string }[];
  available?: boolean;
}
export type ServiceQuoteStatus = "REQUESTED" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";
export interface ServiceQuote {
  id: string;
  public_code: string;
  offering_id: string;
  offering_name: string;
  category_code: string;
  category_name: string;
  provider_id: string;
  provider_name: string;
  requester_user_id: string;
  requester_name: string | null;
  requester_email: string;
  concert_id: string | null;
  concert_name: string | null;
  reservation_id: string | null;
  reservation_code: string | null;
  event_name: string;
  event_start_at: string;
  event_end_at: string;
  location_text: string | null;
  requester_notes: string | null;
  status: ServiceQuoteStatus;
  subtotal: string | null;
  fees: string | null;
  discount: string | null;
  total_amount: string | null;
  currency: string;
  valid_until: string | null;
  provider_notes: string | null;
  responded_at: string | null;
  accepted_at: string | null;
  created_at: string;
  items?: { id: string; description: string; quantity: string; unit_price: string; line_total: string }[];
}
