import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseAttempt } from "../src/features/concerts/purchaseAttempt";

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
