export const scanMessage = (code: string): string =>
  ({
    VALID: "Entrada válida · Ingreso registrado",
    ALREADY_USED: "Entrada ya utilizada",
    INVALID: "Entrada inválida",
    VALIDATION_ERROR: "Código QR inválido o no corresponde a este concierto",
    CANCELLED: "Entrada cancelada",
    WRONG_CONCERT: "Concierto incorrecto",
    STAFF_NOT_ASSIGNED: "Sin permiso: no estás asignado a este concierto",
    FORBIDDEN: "Sin permiso para validar entradas",
  })[code] ?? "No se pudo validar. Revisá la conexión y volvé a intentar.";
