import { z } from 'zod';
import { ROLES } from '../types/auth.types.js';
import { idSchema, nameSchema, paginationShape } from './management.schemas.ts';

// GUEST pertenece al flujo de invitado y nunca se otorga ni se revoca manualmente.
export const ASSIGNABLE_ROLES = ROLES.filter(role => role !== 'GUEST') as [string, ...string[]];
export const roleCodeSchema = z.enum(ASSIGNABLE_ROLES);
// Filtros de búsqueda de usuarios en administración.
export const userQuerySchema = z.strictObject({ ...paginationShape, q: nameSchema(190).optional(), role: z.enum(ROLES as [string, ...string[]]).optional(),
    status: z.enum(['ACTIVE', 'BLOCKED', 'DELETED']).optional() });
// Otorgamiento y revocación manual de roles por parte de ADMIN.
export const grantSchema = z.strictObject({ role: roleCodeSchema, reason: z.string().trim().max(255).nullable().optional(), replace: z.boolean().optional() });
export const revokeSchema = z.strictObject({ reason: z.string().trim().max(255).nullable().optional() }).default({});
// Se acepta cualquier código asignable para que el servicio explique qué perfiles requieren ADMIN (403) en vez de un 422 genérico.
export const selfProfileSchema = z.strictObject({ role: roleCodeSchema });
// Filtros del log de auditoría administrativa.
export const auditQuerySchema = z.strictObject({ ...paginationShape, target_user_id: idSchema.optional(), actor_user_id: idSchema.optional(),
    action: z.string().regex(/^[A-Z_]{1,40}$/).optional(), entity_type: z.enum(['USER', 'ORDER', 'SERVICE_PROVIDER', 'ESTABLISHMENT', 'CONCERT', 'RESERVATION', 'PROFILE_REQUEST']).optional(), entity_id: idSchema.optional() });
// Perfiles que solicita una cuenta y decide un ADMIN; se acepta cualquier código asignable para devolver mensajes claros de negocio.
export const profileRequestSchema = z.strictObject({ role: roleCodeSchema, reason: z.string().trim().max(255).nullable().optional() });
export const profileRequestDecisionSchema = z.strictObject({ reason: z.string().trim().min(3).max(255) });
export const profileRequestApprovalSchema = z.strictObject({ reason: z.string().trim().max(255).nullable().optional() }).default({});
export const profileRequestQuerySchema = z.strictObject({ ...paginationShape, status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() });
// Suspender una cuenta exige motivo porque queda registrado para el titular y otros administradores.
export const suspendSchema = z.strictObject({ reason: z.string().trim().min(3).max(255) });
export const reactivateSchema = z.strictObject({ reason: z.string().trim().max(255).nullable().optional() }).default({});
export const organizationQuerySchema = z.strictObject({ ...paginationShape, q: nameSchema(150).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    kind: z.enum(['VENUE', 'SERVICES']).optional() });
export type UserQuery = z.output<typeof userQuerySchema>;
export type AuditQuery = z.output<typeof auditQuerySchema>;
export type ProfileRequestQuery = z.output<typeof profileRequestQuerySchema>;
export type OrganizationQuery = z.output<typeof organizationQuerySchema>;
