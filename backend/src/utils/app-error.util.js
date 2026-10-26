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
// For endpoints whose data no longer exists in the schema: the route stays and explains what replaced it.
export function gone(message) {
    return () => { throw new AppError(410, 'GONE', message); };
}
export function isDuplicate(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}
