// Client-side checks that mirror the server validators (backend/src/validators). They only help: the API always
// validates again and answers 422. Each rule receives the raw value and returns a message or null.
export type Rule = (value: string) => string | null;

// Same patterns as the backend: city (management.schemas.ts), person names and phone (auth.schemas.js).
export const CITY_PATTERN = /^[\p{L}\p{M}]+(?: +[\p{L}\p{M}]+)*$/u;
export const PERSON_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;
export const PHONE_PATTERN = /^\+?[\d\s()-]{6,30}$/;

const maxLength = (max: number): Rule => (value) => (value.trim().length <= max ? null : `Máximo ${max} caracteres.`);
const pattern = (regex: RegExp, message: string): Rule => (value) => (regex.test(value.trim()) ? null : message);
const isUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
const validDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
};

export const rules = {
  required: (value: string) => (value.trim() ? null : "Este campo es obligatorio."),
  city: [pattern(CITY_PATTERN, "La ciudad solo admite letras y espacios."), maxLength(120)],
  personName: [pattern(PERSON_NAME_PATTERN, "Usá solo letras, espacios, apóstrofos, puntos o guiones."), maxLength(80)],
  email: [pattern(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Ingresá un email válido (nombre@dominio.com)."), maxLength(190)],
  phone: [pattern(PHONE_PATTERN, "Teléfono inválido: solo números, espacios, +, guiones y paréntesis (6 a 30).")],
  url: [(value: string) => (isUrl(value) ? null : "Ingresá una URL que empiece con http:// o https://."), maxLength(500)],
  urlLines: [(value: string) => (value.split("\n").map((line) => line.trim()).filter(Boolean).every(isUrl) ? null : "Cada línea debe ser una URL http:// o https://.")],
  price: [(value: string) => {
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(value.trim())) return "Ingresá un importe con punto decimal y hasta dos decimales (ej. 1500.50).";
    return Number(value) <= 9999999999.99 ? null : "Importe demasiado alto.";
  }],
  decimal: [(value: string) => (/^\d{1,6}(\.\d{1,2})?$/.test(value.trim()) ? null : "Ingresá un número con punto decimal (ej. 120.5).")],
  hoursLines: [(value: string) =>
    value.split("\n").map((line) => line.trim()).filter(Boolean)
      .every((line) => /^[1-7] ([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(line))
      ? null
      : 'Cada línea: día (1 a 7) y franja HH:MM-HH:MM, ej. "1 10:00-23:00".'],
  integer: [(value: string) => (/^\d{1,10}$/.test(value.trim()) && Number(value) <= 4294967295 ? null : "Ingresá un número entero sin decimales.")],
  date: [(value: string) => (validDate(value) ? null : "Usá el formato AAAA-MM-DD con una fecha existente.")],
  time: [pattern(/^([01]\d|2[0-3]):[0-5]\d$/, "Usá el formato HH:MM (00:00 a 23:59).")],
  isoDateTime: [(value: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value.trim()) && !Number.isNaN(Date.parse(value.trim()))
      ? null
      : "Usá fecha y hora ISO con zona, ej. 2027-03-15T21:00:00-03:00."],
  cuit: [pattern(/^\d{2}-?\d{8}-?\d$/, "CUIT inválido (ej. 30-71234567-9).")],
  postalCode: [pattern(/^[A-Za-z0-9 -]{3,10}$/, "Código postal inválido (ej. 7600 o B7600ABC).")],
  newPassword: [(value: string) => (value.length >= 12 ? null : "La contraseña debe tener al menos 12 caracteres."),
    (value: string) => (new TextEncoder().encode(value).length <= 72 ? null : "La contraseña no puede superar 72 bytes.")],
  text: (max: number) => [maxLength(max)],
} satisfies Record<string, Rule | Rule[] | ((max: number) => Rule[])>;

// Type rules from the field label: the app's labels already state the format ("Fecha (AAAA-MM-DD)", "Precio", ...).
export function inferRules(label: string): Rule[] {
  const text = label.toLowerCase();
  if (text === "nombre" || text === "apellido") return rules.personName;
  if (text.startsWith("ciudad")) return rules.city;
  if (text.includes("email")) return rules.email;
  if (text.includes("teléfono")) return rules.phone;
  if (text.includes("una url por línea")) return rules.urlLines;
  if (text.startsWith("horarios")) return rules.hoursLines;
  if (text.includes("superficie")) return rules.decimal;
  if (text.includes("url") || text.includes("sitio web")) return rules.url;
  if (text.includes("precio") || text.includes("descuento") || text.includes("cargos") || text.includes("importe")) return rules.price;
  if (text.includes("(aaaa-mm-dd)")) return rules.date;
  if (text.includes("(hh:mm")) return rules.time;
  if (text.includes("(iso")) return rules.isoDateTime;
  if (text.includes("cuit")) return rules.cuit;
  if (text.includes("código postal")) return rules.postalCode;
  if (text.includes("mínimo 12")) return rules.newPassword;
  if (/(cupo|capacidad|cantidad|máximo por compra|asistentes|minutos|^id |\bid de )/.test(text)) return rules.integer;
  if (text.includes("descripción") || text.includes("biografía") || text.includes("notas") || text.includes("condiciones") || text.includes("equipamiento") || text.includes("detalle"))
    return rules.text(16000);
  return rules.text(255);
}

// Empty optional fields are not checked; required ones must have content first.
export function fieldError(value: string, options: { required?: boolean; rules?: Rule[] }): string | null {
  if (!value.trim()) return options.required ? rules.required(value) : null;
  for (const rule of options.rules ?? []) {
    const message = rule(value);
    if (message) return message;
  }
  return null;
}
