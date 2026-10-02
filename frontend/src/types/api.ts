export type Role = "USER" | "ORGANIZER" | "STAFF" | "ADMIN";
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
export interface Named {
  id: string;
  name: string;
  code?: string;
}
export type Catalog = "artists" | "genres" | "venues" | "cities" | "provinces";
export interface CatalogItem extends Named {
  description?: string | null;
  image_url?: string | null;
  genres?: Named[];
  province_id?: string;
  city_id?: string;
  address?: string;
  capacity?: number | null;
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
  venue_id: string;
  concert_type_id: string;
  description: string | null;
  image_url: string | null;
  start_datetime: string;
  end_datetime: string | null;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED" | "FINISHED";
  venue_name: string;
  city_name: string;
  province_name: string;
  artists: Named[];
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
  venue_name: string;
  venue_address: string;
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
export const hasRoles = (roles: readonly Role[], allowed: readonly Role[]) =>
  allowed.some((role) => roles.includes(role));
