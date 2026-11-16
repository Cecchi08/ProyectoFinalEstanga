import { randomBytes } from 'node:crypto';

// Genera un token criptográficamente seguro de 32 bytes (64 caracteres hexadecimales)
// que identifica de forma única a cada entrada digital y se codifica en su código QR.
export const createQrToken = (): string => randomBytes(32).toString('hex');
