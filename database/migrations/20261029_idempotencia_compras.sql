-- Idempotencia de POST /purchases (Idempotency-Key por usuario).
-- Compatible con compras existentes: las filas previas quedan con NULL, que la restricción única admite.
-- Aplicar una sola vez sobre Railway, con backup previo. No ejecutar de nuevo (ADD COLUMN falla si ya existe).
ALTER TABLE orders
  ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER refunded_at,
  ADD COLUMN request_hash CHAR(64) NULL AFTER idempotency_key,
  ADD UNIQUE KEY uq_orders_idempotency (user_id, idempotency_key);
