import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export const randomToken = () => randomBytes(32).toString('hex');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const pkceChallenge = (verifier) => createHash('sha256').update(verifier).digest('base64url');
export function equalSecret(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
}
