import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCardCvv,
  formatCardExpiry,
  formatCardNumber,
  purchaseAttempt,
  validateSimulatedCard,
} from "../src/features/concerts/purchaseAttempt";

let counter = 0;
const newKey = () => `key-${++counter}`;
const cart = [{ ticketTypeId: "1", quantity: 2 }];

test("reintento del mismo carrito tras un timeout reutiliza la Idempotency-Key", () => {
  const first = purchaseAttempt(null, cart, newKey);
  const retry = purchaseAttempt(first, [{ ticketTypeId: "1", quantity: 2 }], newKey);
  assert.equal(retry.key, first.key);
  assert.equal(counter, 1, "no se generó una clave nueva");
});

test("un carrito distinto abre un intento nuevo con clave nueva", () => {
  const first = purchaseAttempt(null, cart, newKey);
  const changed = purchaseAttempt(first, [{ ticketTypeId: "1", quantity: 3 }], newKey);
  assert.notEqual(changed.key, first.key);
});

test("el orden de los ítems no cambia la firma del carrito", () => {
  const items = [{ ticketTypeId: "1", quantity: 1 }, { ticketTypeId: "2", quantity: 1 }];
  const first = purchaseAttempt(null, items, newKey);
  const reversed = purchaseAttempt(first, [...items].reverse(), newKey);
  assert.equal(reversed.key, first.key);
});

test("formulario de tarjeta simulada valida formato, vencimiento y longitud de CVV", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.equal(formatCardNumber("4509123456789010"), "4509 1234 5678 9010");
  assert.equal(formatCardExpiry("0828"), "08/28");
  assert.equal(formatCardCvv("123a"), "123");

  assert.equal(
    validateSimulatedCard({ cardNumber: "4509 1234 5678 9010", expiry: "08/28", cvv: "123" }, now),
    null,
  );
  assert.match(
    validateSimulatedCard({ cardNumber: "1234", expiry: "08/28", cvv: "123" }, now) ?? "",
    /13 y 19 dígitos/,
  );
  assert.match(
    validateSimulatedCard({ cardNumber: "4509 1234 5678 9010", expiry: "10/25", cvv: "123" }, now) ?? "",
    /vencida/,
  );
  assert.match(
    validateSimulatedCard({ cardNumber: "4509 1234 5678 9010", expiry: "08/28", cvv: "12" }, now) ?? "",
    /3 o 4 dígitos/,
  );
});
