-- Migracion sobre una base cargada con venti_shema2.sql (version anterior a perfiles y pagos).
-- No borra datos. Se ejecuta UNA vez: los ALTER TABLE ... ADD COLUMN fallan si ya se aplico.
-- Ejecutar con: node scripts/db-migrate.mjs --file ../database/migrations/20261026_perfiles_y_pagos.sql --backup <respaldo.sql> --confirm venti
-- (o con el cliente mysql / Workbench: usa DELIMITER).
USE venti;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. Auditoria: referencia al recurso afectado (compras, cuentas).
ALTER TABLE admin_audit_log
  ADD COLUMN entity_type VARCHAR(30) NULL AFTER role_id,
  ADD COLUMN entity_id BIGINT UNSIGNED NULL AFTER entity_type,
  ADD KEY idx_audit_entity (entity_type, entity_id);

-- 2. Compras: estado de reembolso y registro del pago simulado.
ALTER TABLE orders
  ADD COLUMN refund_status ENUM('NONE','REFUNDED') NOT NULL DEFAULT 'NONE' AFTER cancelled_at,
  ADD COLUMN refunded_at DATETIME NULL AFTER refund_status,
  ADD CONSTRAINT chk_orders_refunded CHECK (refund_status = 'NONE' OR (refunded_at IS NOT NULL AND status = 'CANCELLED'));

CREATE TABLE order_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  payer_user_id BIGINT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  status ENUM('APPROVED','REJECTED','REFUNDED') NOT NULL,
  provider ENUM('SIMULATED') NOT NULL DEFAULT 'SIMULATED',
  is_simulated TINYINT(1) NOT NULL DEFAULT 1,
  simulated_reference VARCHAR(40) NOT NULL,
  processed_at DATETIME NOT NULL,
  refunded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_payments_reference (simulated_reference),
  KEY idx_order_payments_order (order_id, status),
  KEY idx_order_payments_payer (payer_user_id),
  CONSTRAINT fk_order_payments_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_order_payments_payer FOREIGN KEY (payer_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_order_payments_simulated CHECK (is_simulated = 1),
  CONSTRAINT chk_order_payments_amount CHECK (amount >= 0),
  CONSTRAINT chk_order_payments_refunded CHECK (status <> 'REFUNDED' OR refunded_at IS NOT NULL)
) ENGINE=InnoDB;

-- 3. Artistas reales en conciertos.
CREATE TABLE concert_artists (
  concert_id BIGINT UNSIGNED NOT NULL,
  artist_profile_id BIGINT UNSIGNED NOT NULL,
  billing_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (concert_id, artist_profile_id),
  KEY idx_concert_artists_artist (artist_profile_id),
  CONSTRAINT fk_concert_artists_concert FOREIGN KEY (concert_id) REFERENCES concerts (id) ON DELETE CASCADE,
  CONSTRAINT fk_concert_artists_artist FOREIGN KEY (artist_profile_id) REFERENCES artist_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. EMPRESA_SERVICIOS.
CREATE TABLE service_categories (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_categories_code (code)
) ENGINE=InnoDB;

CREATE TABLE service_providers (
  organization_id BIGINT UNSIGNED NOT NULL,
  description TEXT NULL,
  city_id INT UNSIGNED NULL,
  coverage_area VARCHAR(255) NULL,
  status ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  published_at DATETIME NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  verified_at DATETIME NULL,
  verified_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id),
  KEY idx_service_providers_status_city (status, city_id),
  KEY idx_service_providers_city (city_id),
  KEY idx_service_providers_verified_by (verified_by_user_id),
  CONSTRAINT fk_service_providers_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_service_providers_city FOREIGN KEY (city_id) REFERENCES cities (id),
  CONSTRAINT fk_service_providers_verified_by FOREIGN KEY (verified_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_service_providers_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
  CONSTRAINT chk_service_providers_verified CHECK (is_verified = 0 OR verified_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE service_offerings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  category_id SMALLINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(170) NOT NULL,
  description TEXT NULL,
  equipment TEXT NULL,
  conditions TEXT NULL,
  pricing_unit ENUM('HOUR','DAY','EVENT','UNIT','QUOTE') NOT NULL DEFAULT 'QUOTE',
  base_price DECIMAL(12,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  status ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_offerings_slug (slug),
  KEY idx_service_offerings_provider (organization_id, status),
  KEY idx_service_offerings_category (category_id, status),
  CONSTRAINT fk_service_offerings_provider FOREIGN KEY (organization_id) REFERENCES service_providers (organization_id) ON DELETE CASCADE,
  CONSTRAINT fk_service_offerings_category FOREIGN KEY (category_id) REFERENCES service_categories (id),
  CONSTRAINT chk_service_offerings_price CHECK (base_price IS NULL OR base_price >= 0),
  CONSTRAINT chk_service_offerings_pricing CHECK (pricing_unit = 'QUOTE' OR base_price IS NOT NULL),
  CONSTRAINT chk_service_offerings_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE service_quotes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_code VARCHAR(20) NOT NULL,
  offering_id BIGINT UNSIGNED NOT NULL,
  organization_id BIGINT UNSIGNED NOT NULL,
  requester_user_id BIGINT UNSIGNED NOT NULL,
  concert_id BIGINT UNSIGNED NULL,
  reservation_id BIGINT UNSIGNED NULL,
  event_name VARCHAR(200) NOT NULL,
  event_start_at DATETIME NOT NULL,
  event_end_at DATETIME NOT NULL,
  location_text VARCHAR(255) NULL,
  requester_notes TEXT NULL,
  status ENUM('REQUESTED','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  subtotal DECIMAL(12,2) NULL,
  fees DECIMAL(12,2) NULL,
  discount DECIMAL(12,2) NULL,
  total_amount DECIMAL(12,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  valid_until DATETIME NULL,
  provider_notes TEXT NULL,
  responded_by_user_id BIGINT UNSIGNED NULL,
  responded_at DATETIME NULL,
  accepted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_quotes_public_code (public_code),
  KEY idx_service_quotes_provider (organization_id, status),
  KEY idx_service_quotes_requester (requester_user_id, status),
  KEY idx_service_quotes_offering (offering_id),
  KEY idx_service_quotes_concert (concert_id),
  KEY idx_service_quotes_reservation (reservation_id),
  KEY idx_service_quotes_responded_by (responded_by_user_id),
  CONSTRAINT fk_service_quotes_offering FOREIGN KEY (offering_id) REFERENCES service_offerings (id),
  CONSTRAINT fk_service_quotes_provider FOREIGN KEY (organization_id) REFERENCES service_providers (organization_id),
  CONSTRAINT fk_service_quotes_requester FOREIGN KEY (requester_user_id) REFERENCES users (id),
  CONSTRAINT fk_service_quotes_concert FOREIGN KEY (concert_id) REFERENCES concerts (id) ON DELETE SET NULL,
  CONSTRAINT fk_service_quotes_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE SET NULL,
  CONSTRAINT fk_service_quotes_responded_by FOREIGN KEY (responded_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_service_quotes_times CHECK (event_start_at < event_end_at),
  CONSTRAINT chk_service_quotes_amounts CHECK ((subtotal IS NULL OR subtotal >= 0) AND (fees IS NULL OR fees >= 0) AND (discount IS NULL OR discount >= 0) AND (total_amount IS NULL OR total_amount >= 0)),
  CONSTRAINT chk_service_quotes_sent_has_total CHECK (status IN ('REQUESTED','CANCELLED','REJECTED','EXPIRED') OR total_amount IS NOT NULL),
  CONSTRAINT chk_service_quotes_accepted CHECK (status <> 'ACCEPTED' OR accepted_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE service_quote_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_quote_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_service_quote_items_quote (service_quote_id, sort_order),
  CONSTRAINT fk_service_quote_items_quote FOREIGN KEY (service_quote_id) REFERENCES service_quotes (id) ON DELETE CASCADE,
  CONSTRAINT chk_service_quote_items_values CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0)
) ENGINE=InnoDB;

-- 5. Permisos nuevos y grants. tickets.validate deja de otorgarse por perfil: lo da concert_staff.
INSERT IGNORE INTO permissions (code, description) VALUES
  ('tickets.validate_all', 'Validar entradas por QR de cualquier concierto'),
  ('services.quotes.request', 'Pedir cotizaciones a empresas de servicios'),
  ('services.admin', 'Administrar y verificar cualquier empresa de servicios');

UPDATE permissions SET description = 'Validar entradas por QR de los conciertos asignados (concert_staff); no se asigna por perfil'
WHERE code = 'tickets.validate';
UPDATE permissions SET description = 'Gestionar la empresa de servicios propia y su catalogo' WHERE code = 'services.manage';
UPDATE permissions SET description = 'Responder cotizaciones de servicios de su empresa' WHERE code = 'services.quotes.respond';
UPDATE roles SET description = 'Ofrece servicios para eventos y responde cotizaciones' WHERE code = 'EMPRESA_SERVICIOS';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'ADMIN' AND p.code <> 'tickets.validate';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'services.quotes.request'
WHERE r.code IN ('ORGANIZADOR','VENUE');

DELETE rp FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'tickets.validate';

INSERT IGNORE INTO service_categories (code, name) VALUES
  ('CLEANING', 'Limpieza'),
  ('SOUND', 'Sonido'),
  ('LIGHTING', 'Iluminacion'),
  ('SECURITY', 'Seguridad'),
  ('STAGING', 'Montaje y desmontaje'),
  ('EQUIPMENT_RENTAL', 'Equipamiento y alquiler tecnico'),
  ('CATERING', 'Catering'),
  ('PHOTO_VIDEO', 'Foto y video'),
  ('TRANSPORT', 'Transporte');

-- 6. Reservas: el pago simulado de una reserva directa ya no la confirma (la acepta el espacio),
--    y un HOLD pagado que vence devuelve el pago.
DROP PROCEDURE IF EXISTS sp_simulate_payment;
DROP PROCEDURE IF EXISTS sp_expire_holds;

DELIMITER $$

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
  DECLARE v_quote_id BIGINT UNSIGNED;
  DECLARE v_setup DATETIME;
  DECLARE v_hold_expires DATETIME;
  DECLARE v_paid INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SET @venti_user_id = NULL;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT status_code, total_amount, currency, quote_id, setup_start_at, hold_expires_at
    INTO v_status, v_amount, v_currency, v_quote_id, v_setup, v_hold_expires
  FROM reservations WHERE id = p_reservation_id FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RESERVATION_NOT_FOUND: la reserva no existe';
  END IF;

  IF v_status <> 'HOLD' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_STATUS: solo se puede pagar una reserva en HOLD';
  END IF;

  IF v_hold_expires <= UTC_TIMESTAMP() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'HOLD_EXPIRED: el HOLD vencio y no puede pagarse';
  END IF;

  SELECT COUNT(*) INTO v_paid FROM payments WHERE reservation_id = p_reservation_id AND status = 'APPROVED';
  IF v_paid > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ALREADY_PAID: la reserva ya tiene un pago aprobado';
  END IF;

  INSERT INTO payments (reservation_id, payer_user_id, amount, currency, status, provider, is_simulated, simulated_reference, processed_at)
  VALUES (p_reservation_id, p_payer_user_id, v_amount, v_currency, IF(p_approve = 1, 'APPROVED', 'REJECTED'), 'SIMULATED', 1,
          CONCAT('SIM-', UPPER(HEX(RANDOM_BYTES(8)))), UTC_TIMESTAMP());

  SET p_payment_id = LAST_INSERT_ID();

  -- El pago confirma la compra, no la reserva. Con presupuesto aceptado el espacio ya acepto las condiciones y
  -- la reserva se confirma. Una reserva directa queda en HOLD hasta que el espacio la acepta: el HOLD se extiende
  -- hasta 48 horas (nunca despues del armado) para que el espacio responda; si no responde, vence y se reembolsa.
  IF p_approve = 1 THEN
    SET @venti_user_id = p_payer_user_id;
    IF v_quote_id IS NOT NULL THEN
      UPDATE reservations SET status_code = 'CONFIRMED' WHERE id = p_reservation_id;
    ELSE
      UPDATE reservations SET hold_expires_at = GREATEST(hold_expires_at, LEAST(v_setup, UTC_TIMESTAMP() + INTERVAL 48 HOUR))
      WHERE id = p_reservation_id;
    END IF;
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

  -- Un HOLD pagado que el espacio no acepto a tiempo devuelve el pago simulado.
  UPDATE payments p
  JOIN reservations r ON r.id = p.reservation_id
  SET p.status = 'REFUNDED'
  WHERE r.status_code = 'EXPIRED'
    AND p.status = 'APPROVED';
END$$

DELIMITER ;
