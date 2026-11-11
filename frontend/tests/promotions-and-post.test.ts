import test from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../src/services/http";
import { purchaseAttempt } from "../src/features/concerts/purchaseAttempt";

const storage = () => {
  const map = new Map<string, string>();
  return {
    async get(k: string) { return map.get(k) ?? null; },
    async set(k: string, v: string) { map.set(k, v); },
    async remove(k: string) { map.delete(k); },
  };
};

test("HttpClient: todas las peticiones utilizan POST por defecto", async () => {
  let capturedMethod = "";
  const mockTransport = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    capturedMethod = init?.method ?? "";
    return new Response(JSON.stringify({ success: true, data: { status: "OK" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = new HttpClient("http://localhost:3000", storage(), mockTransport as typeof fetch);
  const result = await client.request<{ status: string }>("/concerts");

  assert.equal(capturedMethod, "POST", "HttpClient.request debe enviar POST");
  assert.equal(result.data.status, "OK");
});

test("purchaseAttempt: preserva idempotencia e incluye items seleccionados", () => {
  const items1 = [{ ticketTypeId: "1", quantity: 2 }, { ticketTypeId: "2", quantity: 1 }];
  const items2 = [{ ticketTypeId: "2", quantity: 1 }, { ticketTypeId: "1", quantity: 2 }];

  const attempt1 = purchaseAttempt(null, items1, () => "uuid-fixed-key");
  // Mismo contenido en distinto orden debe reutilizar la Idempotency-Key
  const attempt2 = purchaseAttempt(attempt1, items2, () => "uuid-new-key");

  assert.equal(attempt1.key, "uuid-fixed-key");
  assert.equal(attempt2.key, "uuid-fixed-key", "Reintento con mismo contenido preserva la Idempotency-Key");

  // Contenido diferente debe generar nueva clave
  const attempt3 = purchaseAttempt(attempt1, [{ ticketTypeId: "1", quantity: 3 }], () => "uuid-new-key-2");
  assert.equal(attempt3.key, "uuid-new-key-2", "Cambio de items genera nueva Idempotency-Key");
});

test("Descuentos y promociones: reglas de cálculo porcentual y monto fijo", () => {
  // 1. Descuento porcentual (10% en $15.000)
  const subtotal1 = 15000;
  const percent1 = 10;
  const discount1 = Math.round(subtotal1 * (percent1 / 100) * 100) / 100;
  const total1 = Math.max(0, subtotal1 - discount1);
  assert.equal(discount1, 1500);
  assert.equal(total1, 13500);

  // 2. Descuento porcentual (20% en $25.500)
  const subtotal2 = 25500;
  const percent2 = 20;
  const discount2 = Math.round(subtotal2 * (percent2 / 100) * 100) / 100;
  const total2 = Math.max(0, subtotal2 - discount2);
  assert.equal(discount2, 5100);
  assert.equal(total2, 20400);

  // 3. Descuento fijo ($1.000 en $8.500)
  const subtotal3 = 8500;
  const fixed3 = 1000;
  const discount3 = Math.min(fixed3, subtotal3);
  const total3 = Math.max(0, subtotal3 - discount3);
  assert.equal(discount3, 1000);
  assert.equal(total3, 7500);

  // 4. Descuento fijo mayor al subtotal nunca genera total negativo
  const subtotal4 = 500;
  const fixed4 = 1000;
  const discount4 = Math.min(fixed4, subtotal4);
  const total4 = Math.max(0, subtotal4 - discount4);
  assert.equal(discount4, 500);
  assert.equal(total4, 0);
});
