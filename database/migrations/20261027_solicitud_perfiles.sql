-- Solicitud de perfiles (ORGANIZADOR, VENUE, EMPRESA_SERVICIOS) aprobada por un ADMIN.
-- Solo crea la tabla nueva: no modifica datos ni tablas existentes.
-- NO APLICADA en Railway. Aplicarla solo con confirmacion explicita y respaldo previo:
-- node scripts/db-migrate.mjs --file ../database/migrations/20261027_solicitud_perfiles.sql --backup <respaldo.sql> --confirm venti
USE venti;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE profile_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  role_id SMALLINT UNSIGNED NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reason VARCHAR(255) NULL,
  decided_by_user_id BIGINT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decision_note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_profile_requests_status (status, created_at),
  KEY idx_profile_requests_user_role (user_id, role_id, status),
  KEY idx_profile_requests_decided_by (decided_by_user_id),
  CONSTRAINT fk_profile_requests_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_requests_role FOREIGN KEY (role_id) REFERENCES roles (id),
  CONSTRAINT fk_profile_requests_decided_by FOREIGN KEY (decided_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;
