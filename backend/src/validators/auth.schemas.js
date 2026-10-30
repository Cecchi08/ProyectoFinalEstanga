import { z } from 'zod';
export const emailSchema = z.string().trim().toLowerCase().max(190).pipe(z.email());
export const passwordSchema = z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'La contraseña no puede superar 72 bytes UTF-8.');
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
// People: Unicode letters (accents, ñ), spaces, apostrophe, dot and hyphen; never digits or control characters.
// Same rule in frontend/src/utils/validation.ts.
const name = z.string().trim().min(1).max(80).regex(/^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u, 'Usá solo letras, espacios, apóstrofos, puntos o guiones.');
export const phoneSchema = z.string().trim().regex(/^\+?[\d\s()-]{6,30}$/, 'Teléfono inválido.');
export const registerSchema = z.strictObject({ first_name: name, last_name: name, email: emailSchema, password: passwordSchema });
// Campos seguros del perfil propio: nunca email, contraseña, roles, permisos ni estado.
export const profileUpdateSchema = z.strictObject({
    first_name: name.optional(),
    last_name: name.optional(),
    display_name: z.string().trim().min(1).max(150).nullable().optional(),
    phone: phoneSchema.nullable().optional(),
}).refine(value => Object.keys(value).length > 0, 'Indique al menos un campo a modificar.');
export const loginSchema =z.strictObject({ email: emailSchema, password: z.string().min(1).max(72).refine(v => Buffer.byteLength(v) <= 72) });
export const refreshSchema = z.strictObject({ refreshToken: tokenSchema });
export const emailRequestSchema = z.strictObject({ email: emailSchema });
export const verifySchema = z.strictObject({ token: tokenSchema });
export const resetSchema = z.strictObject({ token: tokenSchema, password: passwordSchema });
export const providerSchema = z.enum(['google', 'github', 'facebook']);
export const oauthStartSchema = z.strictObject({ mode: z.enum(['web', 'mobile']).default('web'), codeChallenge: z.string().regex(/^[\w-]{43}$/).optional() })
    .refine(v => v.mode !== 'mobile' || Boolean(v.codeChallenge), 'Mobile requiere codeChallenge S256.');
export const oauthCallbackSchema = z.object({ state: tokenSchema, code: z.string().min(1).max(4096).optional(), error: z.string().max(200).optional() })
    .refine(v => Boolean(v.code) !== Boolean(v.error), 'Callback OAuth inválido.');
export const oauthExchangeSchema = z.strictObject({ code: tokenSchema, codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/) });
