import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationTarget } from "../src/utils/notificationTarget";

test("notificationTarget resuelve el recurso exacto para cada tipo de avisos", () => {
  assert.deepEqual(notificationTarget({ proposal_id: "p-101" } as any), {
    title: "Ver propuesta",
    path: "/proposals/p-101",
  });

  assert.deepEqual(notificationTarget({ service_quote_id: "sq-14" } as any), {
    title: "Ver cotización",
    path: "/services/quotes/sq-14",
  });

  assert.deepEqual(notificationTarget({ reservation_id: "r-8", quote_id: "q-5" } as any), {
    title: "Ver reserva",
    path: "/marketplace/reservations/r-8",
  });

  assert.deepEqual(notificationTarget({ quote_id: "q-5" } as any), {
    title: "Ver presupuesto",
    path: "/marketplace/quotes/q-5",
  });

  assert.deepEqual(notificationTarget({ purchase_id: "o-22" } as any), {
    title: "Ver compra",
    path: "/purchases/o-22",
  });

  assert.deepEqual(notificationTarget({ concert_id: "c-3", concert_status: "PUBLISHED" } as any), {
    title: "Ver concierto",
    path: "/concerts/c-3",
  });

  assert.equal(notificationTarget({ type: "SYSTEM" } as any), null);
});
