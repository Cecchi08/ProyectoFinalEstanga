-- Retención temporal de espacios unificada en 15 minutos (antes configurable por espacio, 5 a 10080, default 30).
-- trg_reservations_bi sigue calculando hold_expires_at desde venues.hold_minutes: no cambia ningún trigger ni procedimiento.
-- Las reservas HOLD ya creadas conservan su vencimiento; solo las nuevas usan 15 minutos.
-- APLICADA en Railway el 2026-11-02 (respaldo previo: venti-20261102-pre-migraciones-y-seed.sql). NO volver a ejecutarla ahí.
-- Para otra base, aplicarla una sola vez con: node scripts/db-migrate.mjs --file ../database/migrations/20261030_retencion_espacios_15_minutos.sql --backup <respaldo.sql> --confirm <base>
USE venti;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

UPDATE venues SET hold_minutes = 15 WHERE hold_minutes <> 15;
ALTER TABLE venues
  ALTER COLUMN hold_minutes SET DEFAULT 15,
  DROP CHECK chk_venues_hold;
ALTER TABLE venues
  ADD CONSTRAINT chk_venues_hold CHECK (hold_minutes = 15);
