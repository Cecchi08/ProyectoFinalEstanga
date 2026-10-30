// Idempotency-Key de un intento de compra: se conserva mientras el carrito no cambie, para que un reintento
// tras un timeout devuelva la compra original en vez de crear otra reserva. Un carrito distinto abre un intento nuevo.
export type PurchaseAttempt = { key: string; signature: string };

export function purchaseAttempt(
  previous: PurchaseAttempt | null,
  items: { ticketTypeId: string; quantity: number }[],
  newKey: () => string,
): PurchaseAttempt {
  const signature = JSON.stringify(
    [...items]
      .sort((a, b) => a.ticketTypeId.localeCompare(b.ticketTypeId))
      .map((item) => [item.ticketTypeId, item.quantity]),
  );
  if (previous && previous.signature === signature) return previous;
  return { key: newKey(), signature };
}
