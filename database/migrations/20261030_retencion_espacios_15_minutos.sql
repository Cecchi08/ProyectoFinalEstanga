-- Retención temporal de espacios unificada en 15 minutos (antes configurable por espacio, 5 a 10080, default 30).
-- trg_reservations_bi sigue calculando hold_expires_at desde venues.hold_minutes: no cambia ningún trigger ni procedimiento.
-- Las reservas HOLD ya creadas conservan su vencimiento; solo las nuevas usan 15 minutos.
-- Aplicar una sola vez sobre Railway, con backup previo. Orden: UPDATE antes de recrear el CHECK.
UPDATE venues SET hold_minutes = 15 WHERE hold_minutes <> 15;
ALTER TABLE venues
  ALTER COLUMN hold_minutes SET DEFAULT 15,
  DROP CHECK chk_venues_hold;
ALTER TABLE venues
  ADD CONSTRAINT chk_venues_hold CHECK (hold_minutes = 15);
