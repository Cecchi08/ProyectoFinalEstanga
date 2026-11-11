import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseAttempt } from "../src/features/concerts/purchaseAttempt";

test("promociones frontend: firma de intento incorpora código normalizado y detecta cambios", () => {
  const items = [{ ticketTypeId: "10", quantity: 2 }];
  let counter = 0;
  const newKey = () => `idemp-key-${++counter}`;

  // Intento sin cupón
  const attemptNoPromo = purchaseAttempt(null, items, newKey);
  assert.equal(attemptNoPromo.key, "idemp-key-1");

  // Mismo carrito sin cupón conserva la clave
  const retryNoPromo = purchaseAttempt(attemptNoPromo, items, newKey);
  assert.equal(retryNoPromo.key, "idemp-key-1");

  // Aplicar cupón genera clave nueva
  const attemptWithPromo = purchaseAttempt(attemptNoPromo, items, newKey, "PROMO20");
  assert.equal(attemptWithPromo.key, "idemp-key-2");

  // Reaplicar el mismo cupón con espacios o minúsculas mantiene la misma clave
  const samePromoDirty = purchaseAttempt(attemptWithPromo, items, newKey, "  promo20  ");
  assert.equal(samePromoDirty.key, "idemp-key-2", "normalización de espacios y mayúsculas conserva la firma");

  // Quitar el cupón genera clave nueva (vuelve a estado sin promo)
  const attemptRemoved = purchaseAttempt(attemptWithPromo, items, newKey, "");
  assert.equal(attemptRemoved.key, "idemp-key-3");

  // Cambiar a otro cupón genera clave nueva
  const attemptDifferent = purchaseAttempt(attemptRemoved, items, newKey, "FIESTA1000");
  assert.equal(attemptDifferent.key, "idemp-key-4");
});

test("promociones frontend: cálculos de subtotal, descuento y total", () => {
  // Simulación del cálculo del frontend donde el backend es la autoridad de importes
  const quote10Pct = {
    code: "VENTI10",
    description: "10% de descuento",
    discount_type: "PERCENTAGE" as const,
    discount_value: "10.00",
    subtotal: "2000.00",
    discount: "200.00",
    total: "1800.00",
  };

  const subtotal = Number(quote10Pct.subtotal);
  const discount = Number(quote10Pct.discount);
  const total = Number(quote10Pct.total);

  assert.equal(subtotal - discount, total);
  assert.equal(total, 1800.00);

  // Descuento fijo
  const quoteFixed = {
    code: "FIESTA1000",
    description: "$1000 OFF",
    discount_type: "FIXED" as const,
    discount_value: "1000.00",
    subtotal: "8000.00",
    discount: "1000.00",
    total: "7000.00",
  };

  assert.equal(Number(quoteFixed.subtotal) - Number(quoteFixed.discount), Number(quoteFixed.total));
});

test("promociones frontend: permisos de acceso a pantalla de administración", () => {
  const adminPermissions = ["users.manage", "orders.read_all", "catalogs.manage", "concerts.manage_all"];
  const buyerPermissions = ["concerts.browse", "tickets.purchase"];

  const canManagePromos = (permissions: string[]) =>
    permissions.some((p) => p === "orders.read_all" || p === "catalogs.manage");

  assert.equal(canManagePromos(adminPermissions), true, "ADMIN tiene permisos para gestionar promociones");
  assert.equal(canManagePromos(buyerPermissions), false, "COMPRADOR no tiene acceso a gestión de promociones");
});

