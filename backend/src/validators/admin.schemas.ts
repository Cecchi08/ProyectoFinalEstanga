import { z } from 'zod';
import { ROLES } from '../types/auth.types.js';
import { idSchema, nameSchema, paginationShape } from './management.schemas.ts';

// GUEST belongs to the guest flow and is never granted or revoked by hand.
export const ASSIGNABLE_ROLES = ROLES.filter(role => role !== 'GUEST') as [string, ...string[]];
export const roleCodeSchema = z.enum(ASSIGNABLE_ROLES);
export const userQuerySchema = z.strictObject({ ...paginationShape, q: nameSchema(190).optional(), role: z.enum(ROLES as [string, ...string[]]).optional(),
    status: z.enum(['ACTIVE', 'BLOCKED', 'DELETED']).optional() });
export const grantSchema = z.strictObject({ role: roleCodeSchema, reason: z.string().trim().max(255).nullable().optional() });
export const revokeSchema = z.strictObject({ reason: z.string().trim().max(255).nullable().optional() }).default({});
// Any assignable code is accepted so the service can explain which profiles need an ADMIN (403) instead of a bare 422.
export const selfProfileSchema = z.strictObject({ role: roleCodeSchema });
export const auditQuerySchema = z.strictObject({ ...paginationShape, target_user_id: idSchema.optional(), actor_user_id: idSchema.optional(),
    action: z.string().regex(/^[A-Z_]{1,40}$/).optional(), entity_type: z.enum(['USER', 'ORDER', 'SERVICE_PROVIDER', 'ESTABLISHMENT', 'CONCERT', 'RESERVATION']).optional(), entity_id: idSchema.optional() });
// Suspending needs a reason: it is the record the account owner and other admins will read.
export const suspendSchema = z.strictObject({ reason: z.string().trim().min(3).max(255) });
export const reactivateSchema = z.strictObject({ reason: z.string().trim().max(255).nullable().optional() }).default({});
export const organizationQuerySchema = z.strictObject({ ...paginationShape, q: nameSchema(150).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    kind: z.enum(['VENUE', 'SERVICES']).optional() });
export type UserQuery = z.output<typeof userQuerySchema>;
export type AuditQuery = z.output<typeof auditQuerySchema>;
export type OrganizationQuery = z.output<typeof organizationQuerySchema>;
