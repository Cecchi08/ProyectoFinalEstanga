-- Idempotencia de POST /purchases (Idempotency-Key por usuario).
-- Compatible con compras existentes: las filas previas quedan con NULL, que la restricción única admite.
-- APLICADA en Railway el 2026-11-02 (respaldo previo: venti-20261102-pre-migraciones-y-seed.sql). NO volver a ejecutarla ahí.
-- Para otra base, aplicarla una sola vez con: node scripts/db-migrate.mjs --file ../database/migrations/20261029_idempotencia_compras.sql --backup <respaldo.sql> --confirm <base>
USE venti;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE orders
  ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER refunded_at,
  ADD COLUMN request_hash CHAR(64) NULL AFTER idempotency_key,
  ADD UNIQUE KEY uq_orders_idempotency (user_id, idempotency_key);
