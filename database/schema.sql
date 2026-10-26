CREATE DATABASE IF NOT EXISTS venti CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE venti;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE roles (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

CREATE TABLE permissions (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  role_id SMALLINT UNSIGNED NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_permission (permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NULL,
  email_verified_at DATETIME NULL,
  password_hash VARCHAR(255) NULL,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  display_name VARCHAR(150) NULL,
  phone VARCHAR(30) NULL,
  avatar_url VARCHAR(500) NULL,
  is_guest TINYINT(1) NOT NULL DEFAULT 0,
  guest_token_hash CHAR(64) NULL,
  status ENUM('ACTIVE','BLOCKED','DELETED') NOT NULL DEFAULT 'ACTIVE',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_guest_token (guest_token_hash),
  KEY idx_users_status (status),
  CONSTRAINT chk_users_is_guest CHECK (is_guest IN (0,1)),
  CONSTRAINT chk_users_email_required CHECK (is_guest = 1 OR email IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id SMALLINT UNSIGNED NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB;

CREATE TABLE oauth_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('GOOGLE','APPLE','FACEBOOK') NOT NULL,
  provider_user_id VARCHAR(191) NOT NULL,
  provider_email VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_oauth_provider_subject (provider, provider_user_id),
  UNIQUE KEY uq_oauth_user_provider (user_id, provider),
  CONSTRAINT fk_oauth_accounts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE auth_refresh_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  device_info VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id),
  KEY idx_refresh_tokens_expires (expires_at),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_hash (token_hash),
  KEY idx_password_reset_user (user_id),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE device_push_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  expo_push_token VARCHAR(255) NOT NULL,
  platform ENUM('IOS','ANDROID','WEB') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_tokens_token (expo_push_token),
  KEY idx_push_tokens_user (user_id, is_active),
  CONSTRAINT fk_push_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE provinces (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(10) NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_provinces_code (code),
  UNIQUE KEY uq_provinces_name (name)
) ENGINE=InnoDB;

CREATE TABLE districts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  province_id SMALLINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_districts_province_name (province_id, name),
  UNIQUE KEY uq_districts_id_province (id, province_id),
  CONSTRAINT fk_districts_province FOREIGN KEY (province_id) REFERENCES provinces (id)
) ENGINE=InnoDB;

CREATE TABLE cities (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  province_id SMALLINT UNSIGNED NOT NULL,
  district_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  postal_code VARCHAR(10) NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cities_district_name (district_id, name),
  KEY idx_cities_district_province (district_id, province_id),
  KEY idx_cities_province (province_id),
  CONSTRAINT fk_cities_province FOREIGN KEY (province_id) REFERENCES provinces (id),
  CONSTRAINT fk_cities_district_province FOREIGN KEY (district_id, province_id) REFERENCES districts (id, province_id),
  CONSTRAINT chk_cities_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_cities_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

CREATE TABLE marketplace_cities (
  city_id INT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (city_id),
  CONSTRAINT fk_marketplace_cities_city FOREIGN KEY (city_id) REFERENCES cities (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE organizations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  legal_name VARCHAR(200) NULL,
  tax_id VARCHAR(20) NULL,
  slug VARCHAR(160) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  status ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_organizations_slug (slug),
  UNIQUE KEY uq_organizations_tax_id (tax_id),
  KEY idx_organizations_created_by (created_by_user_id),
  CONSTRAINT fk_organizations_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE organization_members (
  organization_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  member_role ENUM('OWNER','ADMIN','STAFF') NOT NULL DEFAULT 'STAFF',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id),
  KEY idx_organization_members_user (user_id),
  CONSTRAINT fk_org_members_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_org_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE establishments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  city_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(170) NOT NULL,
  description TEXT NULL,
  address_line VARCHAR(255) NOT NULL,
  postal_code VARCHAR(10) NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(255) NULL,
  website VARCHAR(255) NULL,
  status ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_establishments_slug (slug),
  KEY idx_establishments_city (city_id),
  KEY idx_establishments_organization (organization_id),
  KEY idx_establishments_status_city (status, city_id),
  CONSTRAINT fk_establishments_organization FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_establishments_city FOREIGN KEY (city_id) REFERENCES cities (id),
  CONSTRAINT chk_establishments_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_establishments_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT chk_establishments_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE venue_types (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_venue_types_code (code)
) ENGINE=InnoDB;

CREATE TABLE venues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  establishment_id BIGINT UNSIGNED NOT NULL,
  venue_type_id SMALLINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(170) NOT NULL,
  description TEXT NULL,
  capacity_standing INT UNSIGNED NULL,
  capacity_seated INT UNSIGNED NULL,
  area_m2 DECIMAL(8,2) NULL,
  price_per_hour DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  min_booking_minutes INT UNSIGNED NOT NULL DEFAULT 60,
  hold_minutes INT UNSIGNED NOT NULL DEFAULT 30,
  status ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_venues_slug (slug),
  UNIQUE KEY uq_venues_establishment_name (establishment_id, name),
  UNIQUE KEY uq_venues_id_establishment (id, establishment_id),
  KEY idx_venues_type (venue_type_id),
  KEY idx_venues_status (status),
  KEY idx_venues_capacity (capacity_standing),
  KEY idx_venues_price (price_per_hour),
  CONSTRAINT fk_venues_establishment FOREIGN KEY (establishment_id) REFERENCES establishments (id),
  CONSTRAINT fk_venues_type FOREIGN KEY (venue_type_id) REFERENCES venue_types (id),
  CONSTRAINT chk_venues_price CHECK (price_per_hour >= 0),
  CONSTRAINT chk_venues_area CHECK (area_m2 IS NULL OR area_m2 > 0),
  CONSTRAINT chk_venues_min_booking CHECK (min_booking_minutes > 0),
  CONSTRAINT chk_venues_hold CHECK (hold_minutes BETWEEN 5 AND 10080),
  CONSTRAINT chk_venues_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE amenities (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_amenities_code (code)
) ENGINE=InnoDB;

CREATE TABLE venue_amenities (
  venue_id BIGINT UNSIGNED NOT NULL,
  amenity_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (venue_id, amenity_id),
  KEY idx_venue_amenities_amenity (amenity_id),
  CONSTRAINT fk_venue_amenities_venue FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE,
  CONSTRAINT fk_venue_amenities_amenity FOREIGN KEY (amenity_id) REFERENCES amenities (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE venue_photos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  venue_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(500) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_cover TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_venue_photos_venue (venue_id, sort_order),
  CONSTRAINT fk_venue_photos_venue FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE venue_opening_hours (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  venue_id BIGINT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_venue_hours (venue_id, day_of_week, opens_at),
  CONSTRAINT fk_venue_hours_venue FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE,
  CONSTRAINT chk_venue_hours_day CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT chk_venue_hours_range CHECK (opens_at <> closes_at)
) ENGINE=InnoDB;

CREATE TABLE occupancy_modes (
  code VARCHAR(20) NOT NULL,
  name VARCHAR(80) NOT NULL,
  is_exclusive TINYINT(1) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (code),
  CONSTRAINT chk_occupancy_modes_exclusive CHECK (is_exclusive IN (0,1))
) ENGINE=InnoDB;

CREATE TABLE reservation_statuses (
  code VARCHAR(20) NOT NULL,
  name VARCHAR(80) NOT NULL,
  is_hold TINYINT(1) NOT NULL,
  blocks_space TINYINT(1) NOT NULL,
  is_final TINYINT(1) NOT NULL,
  sort_order TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (code),
  CONSTRAINT chk_res_status_flags CHECK (is_hold IN (0,1) AND blocks_space IN (0,1) AND is_final IN (0,1)),
  CONSTRAINT chk_res_status_hold_blocks CHECK (is_hold = 0 OR blocks_space = 1)
) ENGINE=InnoDB;

CREATE TABLE quotes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_code VARCHAR(20) NOT NULL,
  venue_id BIGINT UNSIGNED NOT NULL,
  requester_user_id BIGINT UNSIGNED NOT NULL,
  requester_organization_id BIGINT UNSIGNED NULL,
  occupancy_mode_code VARCHAR(20) NOT NULL DEFAULT 'VENUE',
  event_name VARCHAR(200) NOT NULL,
  event_description TEXT NULL,
  expected_attendance INT UNSIGNED NULL,
  setup_start_at DATETIME NOT NULL,
  event_start_at DATETIME NOT NULL,
  event_end_at DATETIME NOT NULL,
  teardown_end_at DATETIME NOT NULL,
  status ENUM('REQUESTED','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  subtotal DECIMAL(12,2) NULL,
  fees DECIMAL(12,2) NULL,
  discount DECIMAL(12,2) NULL,
  total_amount DECIMAL(12,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  valid_until DATETIME NULL,
  requester_notes TEXT NULL,
  provider_notes TEXT NULL,
  responded_by_user_id BIGINT UNSIGNED NULL,
  responded_at DATETIME NULL,
  accepted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quotes_public_code (public_code),
  UNIQUE KEY uq_quotes_id_venue (id, venue_id),
  KEY idx_quotes_venue_status (venue_id, status),
  KEY idx_quotes_requester (requester_user_id, status),
  KEY idx_quotes_organization (requester_organization_id),
  KEY idx_quotes_mode (occupancy_mode_code),
  KEY idx_quotes_responded_by (responded_by_user_id),
  CONSTRAINT fk_quotes_venue FOREIGN KEY (venue_id) REFERENCES venues (id),
  CONSTRAINT fk_quotes_requester FOREIGN KEY (requester_user_id) REFERENCES users (id),
  CONSTRAINT fk_quotes_organization FOREIGN KEY (requester_organization_id) REFERENCES organizations (id) ON DELETE SET NULL,
  CONSTRAINT fk_quotes_mode FOREIGN KEY (occupancy_mode_code) REFERENCES occupancy_modes (code),
  CONSTRAINT fk_quotes_responded_by FOREIGN KEY (responded_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_quotes_times CHECK (setup_start_at <= event_start_at AND event_start_at < event_end_at AND event_end_at <= teardown_end_at),
  CONSTRAINT chk_quotes_amounts CHECK ((subtotal IS NULL OR subtotal >= 0) AND (fees IS NULL OR fees >= 0) AND (discount IS NULL OR discount >= 0) AND (total_amount IS NULL OR total_amount >= 0)),
  CONSTRAINT chk_quotes_sent_has_total CHECK (status IN ('REQUESTED','CANCELLED','REJECTED','EXPIRED') OR total_amount IS NOT NULL),
  CONSTRAINT chk_quotes_accepted CHECK (status <> 'ACCEPTED' OR accepted_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE quote_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quote_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_quote_items_quote (quote_id, sort_order),
  CONSTRAINT fk_quote_items_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE CASCADE,
  CONSTRAINT chk_quote_items_values CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0)
) ENGINE=InnoDB;

CREATE TABLE reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_code VARCHAR(20) NOT NULL,
  venue_id BIGINT UNSIGNED NOT NULL,
  establishment_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  quote_id BIGINT UNSIGNED NULL,
  status_code VARCHAR(20) NOT NULL DEFAULT 'HOLD',
  occupancy_mode_code VARCHAR(20) NOT NULL DEFAULT 'VENUE',
  event_name VARCHAR(200) NOT NULL,
  expected_attendance INT UNSIGNED NULL,
  setup_start_at DATETIME NOT NULL,
  event_start_at DATETIME NOT NULL,
  event_end_at DATETIME NOT NULL,
  teardown_end_at DATETIME NOT NULL,
  hold_expires_at DATETIME NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  notes TEXT NULL,
  confirmed_at DATETIME NULL,
  completed_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  cancelled_by_user_id BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(255) NULL,
  expired_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reservations_public_code (public_code),
  UNIQUE KEY uq_reservations_occupancy_parent (id, venue_id, establishment_id, occupancy_mode_code),
  KEY idx_reservations_venue_establishment (venue_id, establishment_id),
  KEY idx_reservations_venue_status (venue_id, status_code),
  KEY idx_reservations_establishment_time (establishment_id, setup_start_at, teardown_end_at),
  KEY idx_reservations_user (user_id, status_code),
  KEY idx_reservations_quote_venue (quote_id, venue_id),
  KEY idx_reservations_status_hold (status_code, hold_expires_at),
  KEY idx_reservations_mode (occupancy_mode_code),
  KEY idx_reservations_cancelled_by (cancelled_by_user_id),
  CONSTRAINT fk_reservations_venue_establishment FOREIGN KEY (venue_id, establishment_id) REFERENCES venues (id, establishment_id),
  CONSTRAINT fk_reservations_establishment FOREIGN KEY (establishment_id) REFERENCES establishments (id),
  CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_reservations_quote_venue FOREIGN KEY (quote_id, venue_id) REFERENCES quotes (id, venue_id),
  CONSTRAINT fk_reservations_status FOREIGN KEY (status_code) REFERENCES reservation_statuses (code),
  CONSTRAINT fk_reservations_mode FOREIGN KEY (occupancy_mode_code) REFERENCES occupancy_modes (code),
  CONSTRAINT fk_reservations_cancelled_by FOREIGN KEY (cancelled_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_reservations_times CHECK (setup_start_at <= event_start_at AND event_start_at < event_end_at AND event_end_at <= teardown_end_at),
  CONSTRAINT chk_reservations_amount CHECK (total_amount >= 0),
  CONSTRAINT chk_reservations_hold_expiry CHECK (status_code <> 'HOLD' OR hold_expires_at IS NOT NULL),
  CONSTRAINT chk_reservations_confirmed_at CHECK (status_code NOT IN ('CONFIRMED','COMPLETED') OR confirmed_at IS NOT NULL),
  CONSTRAINT chk_reservations_completed_at CHECK (status_code <> 'COMPLETED' OR completed_at IS NOT NULL),
  CONSTRAINT chk_reservations_cancelled_at CHECK (status_code <> 'CANCELLED' OR cancelled_at IS NOT NULL),
  CONSTRAINT chk_reservations_expired_at CHECK (status_code <> 'EXPIRED' OR expired_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE reservation_occupancies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED NOT NULL,
  establishment_id BIGINT UNSIGNED NOT NULL,
  occupancy_mode_code VARCHAR(20) NOT NULL,
  phase ENUM('SETUP','EVENT','TEARDOWN') NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_occupancies_reservation_phase (reservation_id, phase),
  KEY idx_occupancies_parent (reservation_id, venue_id, establishment_id, occupancy_mode_code),
  KEY idx_occupancies_establishment_time (establishment_id, starts_at, ends_at),
  KEY idx_occupancies_venue_time (venue_id, starts_at, ends_at),
  CONSTRAINT fk_occupancies_reservation FOREIGN KEY (reservation_id, venue_id, establishment_id, occupancy_mode_code) REFERENCES reservations (id, venue_id, establishment_id, occupancy_mode_code) ON DELETE CASCADE,
  CONSTRAINT chk_occupancies_range CHECK (starts_at < ends_at)
) ENGINE=InnoDB;

CREATE TABLE venue_blocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  establishment_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED NULL,
  reason ENUM('MAINTENANCE','PRIVATE_USE','HOLIDAY','OTHER') NOT NULL DEFAULT 'OTHER',
  description VARCHAR(255) NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_venue_blocks_establishment_time (establishment_id, starts_at, ends_at),
  KEY idx_venue_blocks_venue_establishment (venue_id, establishment_id),
  KEY idx_venue_blocks_created_by (created_by_user_id),
  CONSTRAINT fk_venue_blocks_establishment FOREIGN KEY (establishment_id) REFERENCES establishments (id) ON DELETE CASCADE,
  CONSTRAINT fk_venue_blocks_venue FOREIGN KEY (venue_id, establishment_id) REFERENCES venues (id, establishment_id) ON DELETE CASCADE,
  CONSTRAINT fk_venue_blocks_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_venue_blocks_range CHECK (starts_at < ends_at)
) ENGINE=InnoDB;

CREATE TABLE reservation_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_res_history_reservation (reservation_id, changed_at),
  KEY idx_res_history_user (changed_by_user_id),
  CONSTRAINT fk_res_history_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE,
  CONSTRAINT fk_res_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id BIGINT UNSIGNED NOT NULL,
  payer_user_id BIGINT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  status ENUM('PENDING','APPROVED','REJECTED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  provider ENUM('SIMULATED') NOT NULL DEFAULT 'SIMULATED',
  is_simulated TINYINT(1) NOT NULL DEFAULT 1,
  simulated_reference VARCHAR(40) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_reference (simulated_reference),
  KEY idx_payments_reservation (reservation_id, status),
  KEY idx_payments_payer (payer_user_id),
  CONSTRAINT fk_payments_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id),
  CONSTRAINT fk_payments_payer FOREIGN KEY (payer_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_payments_simulated CHECK (is_simulated = 1),
  CONSTRAINT chk_payments_amount CHECK (amount >= 0),
  CONSTRAINT chk_payments_processed CHECK (status = 'PENDING' OR processed_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE genres (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_genres_name (name),
  UNIQUE KEY uq_genres_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE user_genre_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  genre_id SMALLINT UNSIGNED NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, genre_id),
  KEY idx_user_genres_genre (genre_id),
  CONSTRAINT fk_user_genres_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_genres_genre FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE CASCADE,
  CONSTRAINT chk_user_genres_weight CHECK (weight >= 0)
) ENGINE=InnoDB;

CREATE TABLE concerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organizer_user_id BIGINT UNSIGNED NOT NULL,
  organization_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL,
  artist_name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  image_url VARCHAR(500) NULL,
  city_id INT UNSIGNED NULL,
  venue_id BIGINT UNSIGNED NULL,
  reservation_id BIGINT UNSIGNED NULL,
  venue_name VARCHAR(200) NULL,
  address_line VARCHAR(255) NULL,
  doors_open_at DATETIME NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  status ENUM('DRAFT','PUBLISHED','CANCELLED','FINISHED') NOT NULL DEFAULT 'DRAFT',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_concerts_slug (slug),
  KEY idx_concerts_status_start (status, starts_at),
  KEY idx_concerts_organizer (organizer_user_id),
  KEY idx_concerts_organization (organization_id),
  KEY idx_concerts_city_start (city_id, starts_at),
  KEY idx_concerts_venue (venue_id),
  KEY idx_concerts_reservation (reservation_id),
  KEY idx_concerts_artist (artist_name),
  CONSTRAINT fk_concerts_organizer FOREIGN KEY (organizer_user_id) REFERENCES users (id),
  CONSTRAINT fk_concerts_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL,
  CONSTRAINT fk_concerts_city FOREIGN KEY (city_id) REFERENCES cities (id),
  CONSTRAINT fk_concerts_venue FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE SET NULL,
  CONSTRAINT fk_concerts_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE SET NULL,
  CONSTRAINT chk_concerts_times CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT chk_concerts_doors CHECK (doors_open_at IS NULL OR doors_open_at <= starts_at),
  CONSTRAINT chk_concerts_published CHECK (status = 'DRAFT' OR published_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE concert_genres (
  concert_id BIGINT UNSIGNED NOT NULL,
  genre_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (concert_id, genre_id),
  KEY idx_concert_genres_genre (genre_id),
  CONSTRAINT fk_concert_genres_concert FOREIGN KEY (concert_id) REFERENCES concerts (id) ON DELETE CASCADE,
  CONSTRAINT fk_concert_genres_genre FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE concert_staff (
  concert_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  staff_role ENUM('VALIDATOR') NOT NULL DEFAULT 'VALIDATOR',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (concert_id, user_id),
  KEY idx_concert_staff_user (user_id),
  CONSTRAINT fk_concert_staff_concert FOREIGN KEY (concert_id) REFERENCES concerts (id) ON DELETE CASCADE,
  CONSTRAINT fk_concert_staff_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ticket_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  concert_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  price DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  quantity_total INT UNSIGNED NOT NULL,
  quantity_sold INT UNSIGNED NOT NULL DEFAULT 0,
  max_per_order SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  sales_start_at DATETIME NULL,
  sales_end_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ticket_types_concert_name (concert_id, name),
  UNIQUE KEY uq_ticket_types_id_concert (id, concert_id),
  CONSTRAINT fk_ticket_types_concert FOREIGN KEY (concert_id) REFERENCES concerts (id),
  CONSTRAINT chk_ticket_types_price CHECK (price >= 0),
  CONSTRAINT chk_ticket_types_stock CHECK (quantity_sold <= quantity_total),
  CONSTRAINT chk_ticket_types_max CHECK (max_per_order > 0),
  CONSTRAINT chk_ticket_types_sales CHECK (sales_start_at IS NULL OR sales_end_at IS NULL OR sales_start_at < sales_end_at)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_code VARCHAR(20) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  buyer_email VARCHAR(255) NULL,
  buyer_name VARCHAR(200) NULL,
  status ENUM('PENDING','CONFIRMED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  confirmation_method ENUM('INTERNAL') NOT NULL DEFAULT 'INTERNAL',
  expires_at DATETIME NULL,
  confirmed_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_public_code (public_code),
  KEY idx_orders_user (user_id, created_at),
  KEY idx_orders_status (status, expires_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_orders_amount CHECK (total_amount >= 0),
  CONSTRAINT chk_orders_confirmed CHECK (status <> 'CONFIRMED' OR confirmed_at IS NOT NULL),
  CONSTRAINT chk_orders_cancelled CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  ticket_type_id BIGINT UNSIGNED NOT NULL,
  concert_id BIGINT UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_items_order_type (order_id, ticket_type_id),
  KEY idx_order_items_ticket_type (ticket_type_id, concert_id),
  KEY idx_order_items_concert (concert_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_ticket_type FOREIGN KEY (ticket_type_id, concert_id) REFERENCES ticket_types (id, concert_id),
  CONSTRAINT chk_order_items_values CHECK (quantity > 0 AND unit_price >= 0 AND line_total = quantity * unit_price)
) ENGINE=InnoDB;

CREATE TABLE tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_item_id BIGINT UNSIGNED NOT NULL,
  concert_id BIGINT UNSIGNED NOT NULL,
  ticket_type_id BIGINT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  attendee_name VARCHAR(200) NULL,
  qr_token CHAR(64) NOT NULL,
  status ENUM('VALID','USED','CANCELLED') NOT NULL DEFAULT 'VALID',
  used_at DATETIME NULL,
  validated_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tickets_qr_token (qr_token),
  KEY idx_tickets_order_item (order_item_id),
  KEY idx_tickets_concert_status (concert_id, status),
  KEY idx_tickets_type_concert (ticket_type_id, concert_id),
  KEY idx_tickets_owner (owner_user_id),
  KEY idx_tickets_validated_by (validated_by_user_id),
  CONSTRAINT fk_tickets_order_item FOREIGN KEY (order_item_id) REFERENCES order_items (id),
  CONSTRAINT fk_tickets_ticket_type FOREIGN KEY (ticket_type_id, concert_id) REFERENCES ticket_types (id, concert_id),
  CONSTRAINT fk_tickets_owner FOREIGN KEY (owner_user_id) REFERENCES users (id),
  CONSTRAINT fk_tickets_validated_by FOREIGN KEY (validated_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_tickets_used CHECK (status <> 'USED' OR used_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE ticket_validations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id BIGINT UNSIGNED NULL,
  concert_id BIGINT UNSIGNED NOT NULL,
  scanned_token VARCHAR(255) NOT NULL,
  result ENUM('ACCEPTED','ALREADY_USED','CANCELLED','WRONG_CONCERT','NOT_FOUND') NOT NULL,
  validated_by_user_id BIGINT UNSIGNED NULL,
  device_info VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ticket_validations_concert (concert_id, created_at),
  KEY idx_ticket_validations_ticket (ticket_id),
  KEY idx_ticket_validations_user (validated_by_user_id),
  CONSTRAINT fk_ticket_validations_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE SET NULL,
  CONSTRAINT fk_ticket_validations_concert FOREIGN KEY (concert_id) REFERENCES concerts (id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_validations_user FOREIGN KEY (validated_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE recommendations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  concert_id BIGINT UNSIGNED NOT NULL,
  score DECIMAL(6,3) NOT NULL,
  reason ENUM('GENRE','ARTIST','CITY','PAST_ATTENDANCE','POPULAR') NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dismissed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recommendations_user_concert (user_id, concert_id),
  KEY idx_recommendations_user_score (user_id, score),
  KEY idx_recommendations_concert (concert_id),
  CONSTRAINT fk_recommendations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_recommendations_concert FOREIGN KEY (concert_id) REFERENCES concerts (id) ON DELETE CASCADE,
  CONSTRAINT chk_recommendations_score CHECK (score >= 0)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('PURCHASE_CONFIRMED','CONCERT_REMINDER','CONCERT_UPDATED','CONCERT_CANCELLED','RECOMMENDATION','POST_EVENT','QUOTE_UPDATE','RESERVATION_UPDATE','SYSTEM') NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(1000) NULL,
  data JSON NULL,
  concert_id BIGINT UNSIGNED NULL,
  order_id BIGINT UNSIGNED NULL,
  reservation_id BIGINT UNSIGNED NULL,
  quote_id BIGINT UNSIGNED NULL,
  relevance_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  push_sent_at DATETIME NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_feed (user_id, read_at, created_at),
  KEY idx_notifications_user_relevance (user_id, relevance_score),
  KEY idx_notifications_concert (concert_id),
  KEY idx_notifications_order (order_id),
  KEY idx_notifications_reservation (reservation_id),
  KEY idx_notifications_quote (quote_id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_concert FOREIGN KEY (concert_id) REFERENCES concerts (id) ON DELETE SET NULL,
  CONSTRAINT fk_notifications_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL,
  CONSTRAINT fk_notifications_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE SET NULL,
  CONSTRAINT fk_notifications_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW v_blocked_slots AS
SELECT
  'RESERVATION' AS source,
  o.id AS source_id,
  o.reservation_id,
  o.establishment_id,
  o.venue_id,
  m.is_exclusive,
  o.phase,
  o.starts_at,
  o.ends_at
FROM reservation_occupancies o
JOIN reservations r ON r.id = o.reservation_id
JOIN reservation_statuses s ON s.code = r.status_code
JOIN occupancy_modes m ON m.code = o.occupancy_mode_code
WHERE s.blocks_space = 1
  AND NOT (s.is_hold = 1 AND r.hold_expires_at <= UTC_TIMESTAMP())
UNION ALL
SELECT
  'BLOCK' AS source,
  b.id AS source_id,
  NULL AS reservation_id,
  b.establishment_id,
  b.venue_id,
  IF(b.venue_id IS NULL, 1, 0) AS is_exclusive,
  NULL AS phase,
  b.starts_at,
  b.ends_at
FROM venue_blocks b;

DELIMITER $$

CREATE PROCEDURE sp_assert_slot_free(
  IN p_establishment_id BIGINT UNSIGNED,
  IN p_venue_id BIGINT UNSIGNED,
  IN p_is_exclusive TINYINT,
  IN p_starts_at DATETIME,
  IN p_ends_at DATETIME,
  IN p_exclude_reservation_id BIGINT UNSIGNED,
  IN p_check_blocks TINYINT
)
BEGIN
  DECLARE v_lock BIGINT UNSIGNED;
  DECLARE v_conflicts INT DEFAULT 0;

  SELECT id INTO v_lock FROM establishments WHERE id = p_establishment_id FOR UPDATE;

  SELECT COUNT(*) INTO v_conflicts
  FROM reservation_occupancies o
  JOIN reservations r ON r.id = o.reservation_id
  JOIN reservation_statuses s ON s.code = r.status_code
  JOIN occupancy_modes m ON m.code = o.occupancy_mode_code
  WHERE o.establishment_id = p_establishment_id
    AND o.starts_at < p_ends_at
    AND o.ends_at > p_starts_at
    AND s.blocks_space = 1
    AND NOT (s.is_hold = 1 AND r.hold_expires_at <= UTC_TIMESTAMP())
    AND (p_exclude_reservation_id IS NULL OR o.reservation_id <> p_exclude_reservation_id)
    AND (p_is_exclusive = 1 OR m.is_exclusive = 1 OR o.venue_id = p_venue_id)
  FOR SHARE;

  IF v_conflicts > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SLOT_CONFLICT: la franja se superpone con otra reserva activa';
  END IF;

  IF p_check_blocks = 1 THEN
    SELECT COUNT(*) INTO v_conflicts
    FROM venue_blocks b
    WHERE b.establishment_id = p_establishment_id
      AND b.starts_at < p_ends_at
      AND b.ends_at > p_starts_at
      AND (p_is_exclusive = 1 OR b.venue_id IS NULL OR b.venue_id = p_venue_id)
    FOR SHARE;

    IF v_conflicts > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SLOT_BLOCKED: la franja esta bloqueada por el establecimiento';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_reservations_bi
BEFORE INSERT ON reservations
FOR EACH ROW
BEGIN
  DECLARE v_venue_status VARCHAR(20);
  DECLARE v_est_status VARCHAR(20);
  DECLARE v_hold_minutes INT UNSIGNED;

  IF NEW.status_code <> 'HOLD' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_STATUS: una reserva nueva debe crearse en HOLD';
  END IF;

  SELECT v.status, e.status, v.hold_minutes
    INTO v_venue_status, v_est_status, v_hold_minutes
  FROM venues v
  JOIN establishments e ON e.id = v.establishment_id
  WHERE v.id = NEW.venue_id;

  IF v_venue_status IS NULL OR v_venue_status <> 'PUBLISHED' OR v_est_status <> 'PUBLISHED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VENUE_NOT_AVAILABLE: el espacio o su establecimiento no estan publicados';
  END IF;

  IF NEW.hold_expires_at IS NULL THEN
    SET NEW.hold_expires_at = UTC_TIMESTAMP() + INTERVAL v_hold_minutes MINUTE;
  END IF;

  SET NEW.confirmed_at = NULL, NEW.completed_at = NULL, NEW.cancelled_at = NULL, NEW.expired_at = NULL;
END$$

CREATE TRIGGER trg_reservations_ai
AFTER INSERT ON reservations
FOR EACH ROW
BEGIN
  INSERT INTO reservation_status_history (reservation_id, from_status, to_status, changed_by_user_id)
  VALUES (NEW.id, NULL, NEW.status_code, COALESCE(@venti_user_id, NEW.user_id));
END$$

CREATE TRIGGER trg_reservations_bu
BEFORE UPDATE ON reservations
FOR EACH ROW
BEGIN
  DECLARE v_old_final TINYINT;
  DECLARE v_event_count INT DEFAULT 0;

  IF NOT (NEW.venue_id <=> OLD.venue_id)
     OR NOT (NEW.establishment_id <=> OLD.establishment_id)
     OR NOT (NEW.occupancy_mode_code <=> OLD.occupancy_mode_code)
     OR NOT (NEW.setup_start_at <=> OLD.setup_start_at)
     OR NOT (NEW.event_start_at <=> OLD.event_start_at)
     OR NOT (NEW.event_end_at <=> OLD.event_end_at)
     OR NOT (NEW.teardown_end_at <=> OLD.teardown_end_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMMUTABLE_RESERVATION: espacio, modalidad y horarios no se pueden modificar; cancelar y crear otra reserva';
  END IF;

  IF NEW.status_code <> OLD.status_code THEN
    SELECT is_final INTO v_old_final FROM reservation_statuses WHERE code = OLD.status_code;

    IF v_old_final = 1 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_TRANSITION: la reserva esta en un estado final';
    END IF;

    IF OLD.status_code = 'HOLD' AND NEW.status_code = 'CONFIRMED' THEN
      IF OLD.hold_expires_at <= UTC_TIMESTAMP() THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'HOLD_EXPIRED: el HOLD vencio y no puede confirmarse';
      END IF;
      SELECT COUNT(*) INTO v_event_count FROM reservation_occupancies WHERE reservation_id = OLD.id AND phase = 'EVENT';
      IF v_event_count = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'MISSING_OCCUPANCY: la reserva no tiene tramo EVENT';
      END IF;
      SET NEW.confirmed_at = COALESCE(NEW.confirmed_at, UTC_TIMESTAMP());
    ELSEIF OLD.status_code = 'HOLD' AND NEW.status_code = 'EXPIRED' THEN
      SET NEW.expired_at = COALESCE(NEW.expired_at, UTC_TIMESTAMP());
    ELSEIF OLD.status_code IN ('HOLD','CONFIRMED') AND NEW.status_code = 'CANCELLED' THEN
      SET NEW.cancelled_at = COALESCE(NEW.cancelled_at, UTC_TIMESTAMP());
    ELSEIF OLD.status_code = 'CONFIRMED' AND NEW.status_code = 'COMPLETED' THEN
      SET NEW.completed_at = COALESCE(NEW.completed_at, UTC_TIMESTAMP());
    ELSE
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_TRANSITION: transicion de estado no permitida';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_reservations_au
AFTER UPDATE ON reservations
FOR EACH ROW
BEGIN
  IF NEW.status_code <> OLD.status_code THEN
    INSERT INTO reservation_status_history (reservation_id, from_status, to_status, changed_by_user_id)
    VALUES (NEW.id, OLD.status_code, NEW.status_code, @venti_user_id);
  END IF;
END$$

CREATE TRIGGER trg_occupancies_bi
BEFORE INSERT ON reservation_occupancies
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_setup DATETIME;
  DECLARE v_start DATETIME;
  DECLARE v_end DATETIME;
  DECLARE v_teardown DATETIME;
  DECLARE v_exclusive TINYINT;

  SELECT r.status_code, r.setup_start_at, r.event_start_at, r.event_end_at, r.teardown_end_at
    INTO v_status, v_setup, v_start, v_end, v_teardown
  FROM reservations r
  WHERE r.id = NEW.reservation_id;

  IF v_status <> 'HOLD' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_STATUS: solo se agregan tramos a reservas en HOLD';
  END IF;

  IF (NEW.phase = 'SETUP' AND NOT (NEW.starts_at = v_setup AND NEW.ends_at = v_start))
     OR (NEW.phase = 'EVENT' AND NOT (NEW.starts_at = v_start AND NEW.ends_at = v_end))
     OR (NEW.phase = 'TEARDOWN' AND NOT (NEW.starts_at = v_end AND NEW.ends_at = v_teardown)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_OCCUPANCY_RANGE: el tramo no coincide con los horarios de la reserva';
  END IF;

  SELECT is_exclusive INTO v_exclusive FROM occupancy_modes WHERE code = NEW.occupancy_mode_code;

  CALL sp_assert_slot_free(NEW.establishment_id, NEW.venue_id, v_exclusive, NEW.starts_at, NEW.ends_at, NEW.reservation_id, 1);
END$$

CREATE TRIGGER trg_occupancies_bu
BEFORE UPDATE ON reservation_occupancies
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMMUTABLE_OCCUPANCY: los tramos de ocupacion no se modifican';
END$$

CREATE TRIGGER trg_occupancies_bd
BEFORE DELETE ON reservation_occupancies
FOR EACH ROW
BEGIN
  DECLARE v_blocks TINYINT;
  SELECT s.blocks_space INTO v_blocks
  FROM reservations r
  JOIN reservation_statuses s ON s.code = r.status_code
  WHERE r.id = OLD.reservation_id;
  IF v_blocks = 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OCCUPANCY_IN_USE: no se borran tramos de una reserva que bloquea el espacio';
  END IF;
END$$

CREATE TRIGGER trg_venue_blocks_bi
BEFORE INSERT ON venue_blocks
FOR EACH ROW
BEGIN
  CALL sp_assert_slot_free(NEW.establishment_id, NEW.venue_id, IF(NEW.venue_id IS NULL, 1, 0), NEW.starts_at, NEW.ends_at, NULL, 0);
END$$

CREATE TRIGGER trg_venue_blocks_bu
BEFORE UPDATE ON venue_blocks
FOR EACH ROW
BEGIN
  CALL sp_assert_slot_free(NEW.establishment_id, NEW.venue_id, IF(NEW.venue_id IS NULL, 1, 0), NEW.starts_at, NEW.ends_at, NULL, 0);
END$$

CREATE PROCEDURE sp_create_reservation_hold(
  IN p_venue_id BIGINT UNSIGNED,
  IN p_user_id BIGINT UNSIGNED,
  IN p_quote_id BIGINT UNSIGNED,
  IN p_occupancy_mode_code VARCHAR(20),
  IN p_event_name VARCHAR(200),
  IN p_expected_attendance INT UNSIGNED,
  IN p_setup_start_at DATETIME,
  IN p_event_start_at DATETIME,
  IN p_event_end_at DATETIME,
  IN p_teardown_end_at DATETIME,
  IN p_total_amount DECIMAL(12,2),
  OUT p_reservation_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_establishment_id BIGINT UNSIGNED;
  DECLARE v_currency CHAR(3);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT establishment_id, currency INTO v_establishment_id, v_currency FROM venues WHERE id = p_venue_id;

  IF v_establishment_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VENUE_NOT_FOUND: el espacio no existe';
  END IF;

  INSERT INTO reservations (
    public_code, venue_id, establishment_id, user_id, quote_id, status_code, occupancy_mode_code,
    event_name, expected_attendance, setup_start_at, event_start_at, event_end_at, teardown_end_at,
    total_amount, currency
  ) VALUES (
    CONCAT('R-', UPPER(HEX(RANDOM_BYTES(6)))), p_venue_id, v_establishment_id, p_user_id, p_quote_id, 'HOLD',
    COALESCE(p_occupancy_mode_code, 'VENUE'), p_event_name, p_expected_attendance,
    p_setup_start_at, p_event_start_at, p_event_end_at, p_teardown_end_at,
    COALESCE(p_total_amount, 0), v_currency
  );

  SET p_reservation_id = LAST_INSERT_ID();

  IF p_setup_start_at < p_event_start_at THEN
    INSERT INTO reservation_occupancies (reservation_id, venue_id, establishment_id, occupancy_mode_code, phase, starts_at, ends_at)
    VALUES (p_reservation_id, p_venue_id, v_establishment_id, COALESCE(p_occupancy_mode_code, 'VENUE'), 'SETUP', p_setup_start_at, p_event_start_at);
  END IF;

  INSERT INTO reservation_occupancies (reservation_id, venue_id, establishment_id, occupancy_mode_code, phase, starts_at, ends_at)
  VALUES (p_reservation_id, p_venue_id, v_establishment_id, COALESCE(p_occupancy_mode_code, 'VENUE'), 'EVENT', p_event_start_at, p_event_end_at);

  IF p_event_end_at < p_teardown_end_at THEN
    INSERT INTO reservation_occupancies (reservation_id, venue_id, establishment_id, occupancy_mode_code, phase, starts_at, ends_at)
    VALUES (p_reservation_id, p_venue_id, v_establishment_id, COALESCE(p_occupancy_mode_code, 'VENUE'), 'TEARDOWN', p_event_end_at, p_teardown_end_at);
  END IF;

  COMMIT;
END$$

CREATE PROCEDURE sp_simulate_payment(
  IN p_reservation_id BIGINT UNSIGNED,
  IN p_payer_user_id BIGINT UNSIGNED,
  IN p_approve TINYINT,
  OUT p_payment_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_amount DECIMAL(12,2);
  DECLARE v_currency CHAR(3);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SET @venti_user_id = NULL;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT status_code, total_amount, currency INTO v_status, v_amount, v_currency
  FROM reservations WHERE id = p_reservation_id FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RESERVATION_NOT_FOUND: la reserva no existe';
  END IF;

  IF v_status <> 'HOLD' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_STATUS: solo se puede pagar una reserva en HOLD';
  END IF;

  INSERT INTO payments (reservation_id, payer_user_id, amount, currency, status, provider, is_simulated, simulated_reference, processed_at)
  VALUES (p_reservation_id, p_payer_user_id, v_amount, v_currency, IF(p_approve = 1, 'APPROVED', 'REJECTED'), 'SIMULATED', 1,
          CONCAT('SIM-', UPPER(HEX(RANDOM_BYTES(8)))), UTC_TIMESTAMP());

  SET p_payment_id = LAST_INSERT_ID();

  IF p_approve = 1 THEN
    SET @venti_user_id = p_payer_user_id;
    UPDATE reservations SET status_code = 'CONFIRMED' WHERE id = p_reservation_id;
    SET @venti_user_id = NULL;
  END IF;

  COMMIT;
END$$

CREATE PROCEDURE sp_expire_holds()
BEGIN
  UPDATE reservations
  SET status_code = 'EXPIRED'
  WHERE status_code = 'HOLD'
    AND hold_expires_at <= UTC_TIMESTAMP();
END$$

CREATE PROCEDURE sp_complete_reservations()
BEGIN
  UPDATE reservations
  SET status_code = 'COMPLETED'
  WHERE status_code = 'CONFIRMED'
    AND teardown_end_at <= UTC_TIMESTAMP();
END$$

CREATE EVENT IF NOT EXISTS ev_reservations_maintenance
ON SCHEDULE EVERY 1 MINUTE
DO
BEGIN
  CALL sp_expire_holds();
  CALL sp_complete_reservations();
END$$

DELIMITER ;

INSERT INTO roles (code, name, description) VALUES
  ('ADMIN', 'Administrador', 'Acceso total a la plataforma'),
  ('ORGANIZER', 'Organizador', 'Publica conciertos, vende entradas y gestiona establecimientos'),
  ('CUSTOMER', 'Cliente', 'Usuario registrado que compra entradas y reserva espacios'),
  ('GUEST', 'Invitado', 'Usuario sin registro completo');

INSERT INTO permissions (code, description) VALUES
  ('users.manage', 'Gestionar usuarios y roles'),
  ('concerts.browse', 'Ver conciertos publicados'),
  ('concerts.manage', 'Crear y editar conciertos propios'),
  ('tickets.purchase', 'Comprar entradas'),
  ('tickets.validate', 'Validar entradas por QR'),
  ('orders.read_all', 'Ver todas las compras'),
  ('marketplace.venues.browse', 'Buscar y ver espacios'),
  ('marketplace.quotes.request', 'Solicitar presupuestos'),
  ('marketplace.reservations.create', 'Crear reservas y simular pagos'),
  ('marketplace.establishments.manage', 'Gestionar establecimientos y espacios de su organizacion'),
  ('marketplace.quotes.respond', 'Responder presupuestos de su organizacion'),
  ('marketplace.reservations.manage', 'Gestionar reservas de sus espacios'),
  ('marketplace.admin', 'Administrar todo el marketplace');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
WHERE r.code = 'ADMIN';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'concerts.browse','concerts.manage','tickets.purchase','tickets.validate',
  'marketplace.venues.browse','marketplace.quotes.request','marketplace.reservations.create',
  'marketplace.establishments.manage','marketplace.quotes.respond','marketplace.reservations.manage')
WHERE r.code = 'ORGANIZER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'concerts.browse','tickets.purchase','marketplace.venues.browse',
  'marketplace.quotes.request','marketplace.reservations.create')
WHERE r.code = 'CUSTOMER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'concerts.browse','tickets.purchase','marketplace.venues.browse')
WHERE r.code = 'GUEST';

INSERT INTO reservation_statuses (code, name, is_hold, blocks_space, is_final, sort_order) VALUES
  ('HOLD', 'Reserva temporal', 1, 1, 0, 1),
  ('CONFIRMED', 'Confirmada', 0, 1, 0, 2),
  ('COMPLETED', 'Completada', 0, 1, 1, 3),
  ('CANCELLED', 'Cancelada', 0, 0, 1, 4),
  ('EXPIRED', 'Vencida', 0, 0, 1, 5);

INSERT INTO occupancy_modes (code, name, is_exclusive, description) VALUES
  ('VENUE', 'Solo el espacio', 0, 'Ocupa unicamente el espacio reservado; otros espacios del establecimiento siguen disponibles'),
  ('ESTABLISHMENT', 'Establecimiento completo', 1, 'Ocupa todo el establecimiento durante la franja');

INSERT INTO venue_types (code, name) VALUES
  ('CONCERT_HALL', 'Sala de conciertos'),
  ('REHEARSAL_ROOM', 'Sala de ensayo'),
  ('RECORDING_STUDIO', 'Estudio de grabacion'),
  ('BAR_STAGE', 'Bar con escenario'),
  ('THEATER', 'Teatro'),
  ('AUDITORIUM', 'Auditorio'),
  ('OPEN_AIR', 'Espacio al aire libre'),
  ('EVENT_HALL', 'Salon de eventos');

INSERT INTO amenities (code, name) VALUES
  ('PA_SYSTEM', 'Sistema de sonido'),
  ('LIGHTING', 'Iluminacion'),
  ('BACKLINE', 'Backline'),
  ('STAGE', 'Escenario'),
  ('GREEN_ROOM', 'Camarines'),
  ('BAR', 'Barra'),
  ('PARKING', 'Estacionamiento'),
  ('ACCESSIBILITY', 'Accesibilidad'),
  ('AIR_CONDITIONING', 'Aire acondicionado'),
  ('SOUND_ENGINEER', 'Tecnico de sonido'),
  ('WIFI', 'Wi-Fi'),
  ('SECURITY', 'Seguridad');

INSERT INTO genres (name, slug) VALUES
  ('Rock', 'rock'),
  ('Pop', 'pop'),
  ('Electronica', 'electronica'),
  ('Jazz', 'jazz'),
  ('Blues', 'blues'),
  ('Folklore', 'folklore'),
  ('Tango', 'tango'),
  ('Cumbia', 'cumbia'),
  ('Trap', 'trap'),
  ('Hip Hop', 'hip-hop'),
  ('Reggae', 'reggae'),
  ('Metal', 'metal'),
  ('Indie', 'indie'),
  ('Clasica', 'clasica'),
  ('Cuarteto', 'cuarteto');

INSERT INTO provinces (code, name) VALUES
  ('AR-B', 'Buenos Aires'),
  ('AR-C', 'Ciudad Autonoma de Buenos Aires'),
  ('AR-K', 'Catamarca'),
  ('AR-H', 'Chaco'),
  ('AR-U', 'Chubut'),
  ('AR-X', 'Cordoba'),
  ('AR-W', 'Corrientes'),
  ('AR-E', 'Entre Rios'),
  ('AR-P', 'Formosa'),
  ('AR-Y', 'Jujuy'),
  ('AR-L', 'La Pampa'),
  ('AR-F', 'La Rioja'),
  ('AR-M', 'Mendoza'),
  ('AR-N', 'Misiones'),
  ('AR-Q', 'Neuquen'),
  ('AR-R', 'Rio Negro'),
  ('AR-A', 'Salta'),
  ('AR-J', 'San Juan'),
  ('AR-D', 'San Luis'),
  ('AR-Z', 'Santa Cruz'),
  ('AR-S', 'Santa Fe'),
  ('AR-G', 'Santiago del Estero'),
  ('AR-V', 'Tierra del Fuego'),
  ('AR-T', 'Tucuman');

INSERT INTO districts (province_id, name)
SELECT id, 'General Pueyrredon' FROM provinces WHERE code = 'AR-B';

INSERT INTO cities (province_id, district_id, name, postal_code)
SELECT d.province_id, d.id, c.name, c.postal_code
FROM districts d
JOIN provinces p ON p.id = d.province_id AND p.code = 'AR-B'
JOIN (
  SELECT 'Mar del Plata' AS name, '7600' AS postal_code
  UNION ALL SELECT 'Batan', NULL
  UNION ALL SELECT 'Sierra de los Padres', NULL
  UNION ALL SELECT 'Estacion Chapadmalal', NULL
) c
WHERE d.name = 'General Pueyrredon';

INSERT INTO marketplace_cities (city_id, sort_order)
SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.id)
FROM cities c
JOIN districts d ON d.id = c.district_id
WHERE d.name = 'General Pueyrredon';
