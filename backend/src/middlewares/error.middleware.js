import { ZodError } from 'zod';
import { AppError } from '../utils/app-error.util.js';
export const notFound = () => { throw new AppError(404, 'NOT_FOUND', 'Ruta inexistente.'); };
export function errorHandler() {
    return (error, _req, res, _next) => {
        if (res.headersSent) {
            _next(error);
            return;
        }
        if (error instanceof ZodError) {
            res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos.',
                    details: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) } });
            return;
        }
        if (error instanceof AppError) {
            res.status(error.status).json({ success: false, error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
            return;
        }
        if (typeof error === 'object' && error !== null && 'type' in error) {
            const messages = { 'entity.parse.failed': 'JSON inválido.', 'entity.too.large': 'El cuerpo excede el tamaño permitido.', 'encoding.unsupported': 'Codificación no soportada.' };
            const message = messages[String(error.type)];
            if (message) {
                res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message } });
                return;
            }
        }
        // Do not log driver errors: they can contain SQL parameters, email addresses and hashes.
        console.error('[INTERNAL_ERROR]', error instanceof Error ? error.name : 'UnknownError');
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } });
    };
}
