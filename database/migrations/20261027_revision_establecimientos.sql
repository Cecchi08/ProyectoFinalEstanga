-- Migracion sobre una base cargada con venti_shema2.sql anterior a la revision de establecimientos.
-- APLICADA en Railway el 2026-10-27 (respaldo previo: venti-20261027-pre-revision-establecimientos.sql). NO volver a ejecutarla ahi.
-- En otra base vieja, aplicarla ANTES de desplegar el backend que la usa: ese backend escribe
-- status = 'PENDING_REVIEW', que la base vieja rechaza.
-- No borra datos. Los establecimientos ya PUBLISHED quedan publicados (se consideran aprobados).
-- Se ejecuta UNA vez: los ALTER TABLE ... ADD COLUMN fallan si ya se aplico.
-- Ejecutar con: node scripts/db-migrate.mjs --file ../database/migrations/20261027_revision_establecimientos.sql --backup <respaldo.sql> --confirm venti
USE venti;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- El dueno envia el establecimiento a revision; solo un ADMIN lo publica.
ALTER TABLE establishments
  MODIFY COLUMN status ENUM('DRAFT','PENDING_REVIEW','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN reviewed_at DATETIME NULL AFTER published_at,
  ADD COLUMN reviewed_by_user_id BIGINT UNSIGNED NULL AFTER reviewed_at,
  ADD COLUMN review_note VARCHAR(500) NULL AFTER reviewed_by_user_id,
  ADD KEY idx_establishments_reviewed_by (reviewed_by_user_id),
  ADD CONSTRAINT fk_establishments_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id) ON DELETE SET NULL;
