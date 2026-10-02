-- ============================================================
-- VENTI - MySQL 8.0+
-- ETAPA 1: esquema normalizado en 3FN
-- Sincronizado con VENTI_ETAPA_1 corregido
-- ============================================================

CREATE DATABASE IF NOT EXISTS venti
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE venti;

-- La aplicación backend debe conectarse usando UTC (mysql2 timezone: 'Z').
SET time_zone = '+00:00';

-- ============================================================
-- AUTENTICACION / USUARIOS / ROLES
-- ============================================================

CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    avatar_url VARCHAR(500) NULL,
    email_verified_at DATETIME NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE roles (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE user_roles (
    user_id BIGINT UNSIGNED NOT NULL,
    role_id TINYINT UNSIGNED NOT NULL,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE TABLE organizer_profiles (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    display_name VARCHAR(120) NOT NULL,
    description TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_organizer_profiles_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE oauth_providers (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE oauth_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    provider_id TINYINT UNSIGNED NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_oauth_provider_account (provider_id, provider_user_id),
    UNIQUE KEY uq_oauth_user_provider (user_id, provider_id),
    CONSTRAINT fk_oauth_accounts_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_oauth_accounts_provider
        FOREIGN KEY (provider_id) REFERENCES oauth_providers(id) ON DELETE RESTRICT
);

CREATE TABLE refresh_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_refresh_tokens_user_expires (user_id, expires_at),
    CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE email_verification_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_verification_user_expires (user_id, expires_at),
    CONSTRAINT fk_email_verification_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE password_reset_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_reset_user_expires (user_id, expires_at),
    CONSTRAINT fk_password_reset_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- UBICACIONES
-- ============================================================

CREATE TABLE provinces (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE cities (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    province_id SMALLINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    UNIQUE KEY uq_city_province (province_id, name),
    CONSTRAINT fk_cities_province
        FOREIGN KEY (province_id) REFERENCES provinces(id) ON DELETE RESTRICT
);

CREATE TABLE venues (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    city_id INT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    capacity INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_venue_city_name_address (city_id, name, address),
    CONSTRAINT fk_venues_city
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE RESTRICT,
    CONSTRAINT chk_venues_capacity
        CHECK (capacity IS NULL OR capacity > 0)
);

-- ============================================================
-- ARTISTAS / GENEROS
-- ============================================================

CREATE TABLE artists (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    description TEXT NULL,
    image_url VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE genres (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE artist_genres (
    artist_id BIGINT UNSIGNED NOT NULL,
    genre_id SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (artist_id, genre_id),
    CONSTRAINT fk_artist_genres_artist
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    CONSTRAINT fk_artist_genres_genre
        FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

-- ============================================================
-- CONCIERTOS
-- ============================================================

CREATE TABLE concert_types (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE concert_statuses (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE concerts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organizer_id BIGINT UNSIGNED NOT NULL,
    venue_id BIGINT UNSIGNED NOT NULL,
    concert_type_id TINYINT UNSIGNED NOT NULL,
    status_id TINYINT UNSIGNED NOT NULL,
    name VARCHAR(180) NOT NULL,
    description TEXT NULL,
    image_url VARCHAR(500) NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NULL,
    published_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_concerts_start_datetime (start_datetime),
    INDEX idx_concerts_venue (venue_id),
    INDEX idx_concerts_organizer (organizer_id),
    INDEX idx_concerts_status (status_id),
    CONSTRAINT fk_concerts_organizer
        FOREIGN KEY (organizer_id) REFERENCES organizer_profiles(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_concerts_venue
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_concerts_type
        FOREIGN KEY (concert_type_id) REFERENCES concert_types(id) ON DELETE RESTRICT,
    CONSTRAINT fk_concerts_status
        FOREIGN KEY (status_id) REFERENCES concert_statuses(id) ON DELETE RESTRICT,
    CONSTRAINT chk_concerts_dates
        CHECK (end_datetime IS NULL OR end_datetime > start_datetime)
);

CREATE TABLE concert_artists (
    concert_id BIGINT UNSIGNED NOT NULL,
    artist_id BIGINT UNSIGNED NOT NULL,
    billing_order SMALLINT UNSIGNED NULL,
    PRIMARY KEY (concert_id, artist_id),
    CONSTRAINT fk_concert_artists_concert
        FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    CONSTRAINT fk_concert_artists_artist
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE RESTRICT
);

CREATE TABLE concert_genres (
    concert_id BIGINT UNSIGNED NOT NULL,
    genre_id SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (concert_id, genre_id),
    CONSTRAINT fk_concert_genres_concert
        FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    CONSTRAINT fk_concert_genres_genre
        FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE RESTRICT
);

-- ============================================================
-- TIPOS DE ENTRADA / COMPRAS / TICKETS
-- ============================================================

CREATE TABLE ticket_types (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    concert_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    stock_total INT UNSIGNED NOT NULL,
    sale_start DATETIME NULL,
    sale_end DATETIME NULL,
    max_per_purchase SMALLINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ticket_type_concert_name (concert_id, name),
    INDEX idx_ticket_types_concert (concert_id),
    CONSTRAINT fk_ticket_types_concert
        FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    CONSTRAINT chk_ticket_types_price
        CHECK (price >= 0),
    CONSTRAINT chk_ticket_types_stock
        CHECK (stock_total >= 0),
    CONSTRAINT chk_ticket_types_sale_dates
        CHECK (sale_start IS NULL OR sale_end IS NULL OR sale_end > sale_start),
    CONSTRAINT chk_ticket_types_max_per_purchase
        CHECK (max_per_purchase IS NULL OR max_per_purchase > 0)
);

CREATE TABLE purchase_statuses (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE purchases (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    status_id TINYINT UNSIGNED NOT NULL,
    expires_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_purchases_user_created (user_id, created_at),
    INDEX idx_purchases_status_expires (status_id, expires_at),
    CONSTRAINT fk_purchases_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_purchases_status
        FOREIGN KEY (status_id) REFERENCES purchase_statuses(id) ON DELETE RESTRICT
);

CREATE TABLE purchase_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_id BIGINT UNSIGNED NOT NULL,
    ticket_type_id BIGINT UNSIGNED NOT NULL,
    quantity SMALLINT UNSIGNED NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    UNIQUE KEY uq_purchase_ticket_type (purchase_id, ticket_type_id),
    INDEX idx_purchase_items_ticket_type (ticket_type_id),
    CONSTRAINT fk_purchase_items_purchase
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_items_ticket_type
        FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE RESTRICT,
    CONSTRAINT chk_purchase_items_quantity
        CHECK (quantity > 0),
    CONSTRAINT chk_purchase_items_unit_price
        CHECK (unit_price >= 0)
);

CREATE TABLE ticket_statuses (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE tickets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_item_id BIGINT UNSIGNED NOT NULL,
    qr_token CHAR(64) NOT NULL UNIQUE,
    status_id TINYINT UNSIGNED NOT NULL,
    used_at DATETIME NULL,
    used_by_user_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tickets_purchase_item (purchase_item_id),
    INDEX idx_tickets_status (status_id),
    INDEX idx_tickets_used_by_user (used_by_user_id),
    CONSTRAINT fk_tickets_purchase_item
        FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_status
        FOREIGN KEY (status_id) REFERENCES ticket_statuses(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_used_by_user
        FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_tickets_validation_pair
        CHECK (
            (used_at IS NULL AND used_by_user_id IS NULL)
            OR
            (used_at IS NOT NULL AND used_by_user_id IS NOT NULL)
        )
);

-- IMPORTANTE:
-- No existe stock_available. El stock disponible se calcula en una transaccion:
-- stock_total - unidades comprometidas por compras CONFIRMED o por
-- PENDING/RESERVED no expiradas. El backend bloquea ticket_types con
-- SELECT ... FOR UPDATE antes de calcular y crear la compra.
--
-- Los tickets se generan, uno por unidad, cuando la compra se confirma.
-- qr_token debe generarse con crypto.randomBytes(32).toString('hex').

-- ============================================================
-- STAFF
-- ============================================================

CREATE TABLE staff_assignments (
    concert_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    assigned_by_user_id BIGINT UNSIGNED NOT NULL,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (concert_id, user_id),
    INDEX idx_staff_assignments_user (user_id),
    CONSTRAINT fk_staff_assignments_concert
        FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    CONSTRAINT fk_staff_assignments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_staff_assignments_assigned_by
        FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- ============================================================
-- FAVORITOS / PREFERENCIAS
-- ============================================================

CREATE TABLE favorites (
    user_id BIGINT UNSIGNED NOT NULL,
    concert_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, concert_id),
    INDEX idx_favorites_concert (concert_id),
    CONSTRAINT fk_favorites_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_favorites_concert
        FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE
);

CREATE TABLE user_preferences (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    recommendations_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_preferences_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Venti Discover NO tiene tabla propia.
-- Las recomendaciones se calculan al vuelo usando historial de tickets,
-- favoritos, concert_genres, artist_genres, venues y cities.
-- Si en el futuro hace falta cache, se agregara mediante una migracion.

-- ============================================================
-- NOTIFICACIONES
-- ============================================================

CREATE TABLE notification_types (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    type_id TINYINT UNSIGNED NOT NULL,
    concert_id BIGINT UNSIGNED NULL,
    purchase_id BIGINT UNSIGNED NULL,
    title VARCHAR(160) NOT NULL,
    message VARCHAR(500) NOT NULL,
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notifications_user_created (user_id, created_at),
    INDEX idx_notifications_concert (concert_id),
    INDEX idx_notifications_purchase (purchase_id),
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_type
        FOREIGN KEY (type_id) REFERENCES notification_types(id) ON DELETE RESTRICT,
    CONSTRAINT fk_notifications_concert
        FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_purchase
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
);

-- ============================================================
-- DATOS INICIALES / CATALOGOS NECESARIOS PARA EL CODIGO
-- ============================================================

INSERT INTO roles (code, name) VALUES
('USER', 'Usuario'),
('ORGANIZER', 'Organizador'),
('STAFF', 'Staff'),
('ADMIN', 'Administrador');

INSERT INTO oauth_providers (code, name) VALUES
('GOOGLE', 'Google'),
('GITHUB', 'GitHub'),
('FACEBOOK', 'Facebook');

INSERT INTO concert_types (code, name) VALUES
('CONCERT', 'Concierto'),
('FESTIVAL', 'Festival'),
('LIVE_SHOW', 'Show musical');

INSERT INTO concert_statuses (code, name) VALUES
('DRAFT', 'Borrador'),
('PUBLISHED', 'Publicado'),
('CANCELLED', 'Cancelado'),
('FINISHED', 'Finalizado');

INSERT INTO purchase_statuses (code, name) VALUES
('PENDING', 'Pendiente'),
('RESERVED', 'Reservada'),
('CONFIRMED', 'Confirmada'),
('CANCELLED', 'Cancelada'),
('EXPIRED', 'Expirada'),
('REFUNDED', 'Reembolsada');

INSERT INTO ticket_statuses (code, name) VALUES
('ACTIVE', 'Activa'),
('USED', 'Utilizada'),
('CANCELLED', 'Cancelada'),
('REFUNDED', 'Reembolsada');

INSERT INTO notification_types (code, name) VALUES
('RECOMMENDATION', 'Recomendacion'),
('PURCHASE_CONFIRMED', 'Compra confirmada'),
('CONCERT_REMINDER', 'Concierto proximo'),
('SCHEDULE_CHANGE', 'Cambio de horario'),
('CONCERT_CANCELLED', 'Concierto cancelado'),
('IMPORTANT_INFO', 'Informacion importante');
