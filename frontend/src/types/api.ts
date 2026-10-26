import type { Role } from "../constants/access";
// Staff is not a role: it is a per-concert assignment (GET /staff/assignments).
export type { Role };
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
  // Derived from artist_name; kept as a list for existing screens.
  artists: { name: string }[];
  genres: Named[];
  ticket_types: TicketType[];
}
export interface Purchase {
  id: string;
  status: string;
  total: string;
  created_at: string;
  expires_at: string | null;
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
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  venues: number;
}
export interface Block { id: string; venue_id: string | null; reason: string; description: string | null; starts_at: string; ends_at: string }
export interface StaffMember { user_id: string; first_name: string | null; last_name: string | null; email: string }
// ---- Profiles, admin and artists ----
// GET /auth/me: roles and the union of their permissions, as the API checks them.
export interface Me { user: User; roles: Role[]; permissions: string[] }
export interface SelfProfiles {
  roles: Role[];
  permissions: string[];
  self_service: { code: Role; name: string; description: string | null; active: boolean }[];
}
export interface AdminUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  status: "ACTIVE" | "BLOCKED" | "DELETED";
  is_guest: boolean;
  created_at: string;
  roles: Role[];
}
export interface AuditEntry {
  id: string;
  action: "ROLE_GRANTED" | "ROLE_REVOKED" | "ROLE_SELF_ACTIVATED";
  actor_user_id: string | null;
  target_user_id: string | null;
  role: Role | null;
  details: { role?: string; reason?: string | null; target_email?: string | null; self_service?: boolean } | null;
  created_at: string;
}
export interface ArtistMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string;
  member_role: "OWNER" | "MEMBER";
}
export interface ArtistProfile {
  id: string;
  stage_name: string;
  slug: string;
  bio: string | null;
  city_id: string | null;
  city_name: string | null;
  image_url: string | null;
  website: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  published_at: string | null;
  genres: Named[];
  members?: ArtistMember[];
}
