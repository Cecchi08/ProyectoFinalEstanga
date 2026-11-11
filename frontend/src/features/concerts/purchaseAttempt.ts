// Idempotency-Key de un intento de compra: se conserva mientras el carrito no cambie, para que un reintento
// tras un timeout devuelva la compra original en vez de crear otra reserva. Un carrito distinto abre un intento nuevo.
export type PurchaseAttempt = { key: string; signature: string };

export function purchaseAttempt(
  previous: PurchaseAttempt | null,
  items: { ticketTypeId: string; quantity: number }[],
  newKey: () => string,
  promotionCode?: string,
): PurchaseAttempt {
  const normalizedPromo = promotionCode?.trim().toUpperCase() || "";
  const signature = JSON.stringify({
    items: [...items]
      .sort((a, b) => a.ticketTypeId.localeCompare(b.ticketTypeId))
      .map((item) => [item.ticketTypeId, item.quantity]),
    promo: normalizedPromo,
  });
  if (previous && previous.signature === signature) return previous;
  return { key: newKey(), signature };
}

export type SimulatedCardInput = {
  cardNumber: string;
  expiry: string;
  cvv: string;
};

export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function formatCardExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function formatCardCvv(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

// Validación académica del formulario de tarjeta: verifica formato, campos obligatorios y vigencia sin enviar datos al servidor.
export function validateSimulatedCard(input: SimulatedCardInput, now = new Date()): string | null {
  const digits = input.cardNumber.replace(/\D/g, "");
  if (!digits) return "Ingresá el número de tarjeta.";
  if (digits.length < 13 || digits.length > 19) {
    return "El número de tarjeta debe tener entre 13 y 19 dígitos.";
  }

  const expiryRaw = input.expiry.trim();
  if (!expiryRaw) return "Ingresá la fecha de vencimiento en formato MM/AA.";
  const match = /^(\d{2})\/(\d{2})$/.exec(expiryRaw);
  if (!match) return "La fecha de vencimiento debe respetar el formato MM/AA.";
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) {
    return "El mes de vencimiento debe estar entre 01 y 12.";
  }
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return "La tarjeta ingresada se encuentra vencida.";
  }

  const cvvDigits = input.cvv.replace(/\D/g, "");
  if (!cvvDigits) return "Ingresá el código de seguridad (CVV).";
  if (cvvDigits.length < 3 || cvvDigits.length > 4) {
    return "El código de seguridad (CVV) debe tener 3 o 4 dígitos.";
  }

  return null;
}
