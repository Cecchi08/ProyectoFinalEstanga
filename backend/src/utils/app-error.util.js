// Error de dominio tipado con código HTTP, código estable de API y detalles opcionales.
export class AppError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        this.name = 'AppError';
    }
}
export const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Credenciales o token inválidos.');
// Para endpoints cuyos datos ya no existen en el esquema: la ruta permanece y explica qué los reemplazó.
export function gone(message) {
    return () => { throw new AppError(410, 'GONE', message); };
}
// Detecta colisiones de clave única en MySQL (ER_DUP_ENTRY).
export function isDuplicate(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}
