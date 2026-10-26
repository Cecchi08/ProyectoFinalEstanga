import { z } from 'zod';
import { ROLES } from '../types/auth.types.js';
import { idSchema, nameSchema, paginationShape } from './management.schemas.ts';

// GUEST belongs to the guest flow and is never granted or revoked by hand.
export const ASSIGNABLE_ROLES = ROLES.filter(role => role !== 'GUEST') as [string, ...string[]];
export const roleCodeSchema = z.enum(ASSIGNABLE_ROLES);
export const userQuerySchema = z.strictObject({ ...paginationShape, q: nameSchema(190).optional(), role: z.enum(ROLES as [string, ...string[]]).optional() });
export const grantSchema = z.strictObject({ role: roleCodeSchema, reason: z.string().trim().max(255).nullable().optional() });
export const revokeSchema = z.strictObject({ reason: z.string().trim().max(255).nullable().optional() }).default({});
// Any assignable code is accepted so the service can explain which profiles need an ADMIN (403) instead of a bare 422.
export const selfProfileSchema = z.strictObject({ role: roleCodeSchema });
export const auditQuerySchema = z.strictObject({ ...paginationShape, target_user_id: idSchema.optional(), actor_user_id: idSchema.optional() });
export type UserQuery = z.output<typeof userQuerySchema>;
export type AuditQuery = z.output<typeof auditQuerySchema>;
