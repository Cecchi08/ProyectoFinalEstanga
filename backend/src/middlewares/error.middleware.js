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
        // Registro seguro para diagnóstico: nombre, código y stack en logs privados del servidor.
        // Se anonimizan correos y parámetros entrecomillados para evitar fugar datos sensibles o SQL.
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        const errorCode = error && typeof error === 'object' && 'code' in error && error.code ? ` (${String(error.code).slice(0, 50)})` : '';
        const rawMessage = error instanceof Error ? error.message : String(error ?? '');
        const safeMessage = rawMessage
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
            .replace(/'[^']*'/g, "'[REDACTED]'");
        console.error(`[INTERNAL_ERROR] ${errorName}${errorCode}: ${safeMessage}`);
        if (error instanceof Error && error.stack) {
            console.error('[INTERNAL_ERROR_STACK]', error.stack);
        }
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } });
    };
}
