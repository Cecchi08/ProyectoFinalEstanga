import { randomBytes } from 'node:crypto';

export const createQrToken = (): string => randomBytes(32).toString('hex');
