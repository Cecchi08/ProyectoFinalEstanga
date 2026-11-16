// Dinero representado en centavos enteros (BigInt) para evitar errores de punto flotante binario.
export const cents = (value: number | string) => {
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)) * (String(value).startsWith('-') ? -1n : 1n);
};
// Formatea centavos BigInt a string decimal con dos decimales.
export const decimal = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
export const MAX_AMOUNT = 999999999999n;
// Ítems de presupuesto redondeados half-up al centavo; el total es subtotal + cargos - descuento.
export function quoteTotals<T extends { quantity: number; unit_price: number }>(items: T[], fees: number, discount: number) {
    const lines = items.map(item => ({ ...item, line: (cents(item.quantity) * cents(item.unit_price) + 50n) / 100n }));
    const subtotal = lines.reduce((sum, item) => sum + item.line, 0n);
    return { lines, subtotal, total: subtotal + cents(fees) - cents(discount) };
}
