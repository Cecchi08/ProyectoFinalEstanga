import type { PoolConnection } from 'mysql2/promise';

export type AuditAction = 'ROLE_GRANTED' | 'ROLE_REVOKED' | 'ROLE_SELF_ACTIVATED' | 'USER_SUSPENDED' | 'USER_REACTIVATED'
    | 'ORDER_PAYMENT_APPROVED' | 'ORDER_PAYMENT_REJECTED' | 'ORDER_REFUNDED' | 'SERVICE_PROVIDER_VERIFIED' | 'SERVICE_PROVIDER_UNVERIFIED'
    | 'ESTABLISHMENT_APPROVED' | 'ESTABLISHMENT_REJECTED' | 'CONCERT_PUBLISHED' | 'CONCERT_CANCELLED' | 'RESERVATION_REFUNDED'
    | 'PROFILE_REQUESTED' | 'PROFILE_REQUEST_APPROVED' | 'PROFILE_REQUEST_REJECTED';
export interface AuditEntry {
    actor: string; action: AuditAction; target?: string | null; roleId?: string | null;
    entity?: { type: 'USER' | 'ORDER' | 'SERVICE_PROVIDER' | 'ESTABLISHMENT' | 'CONCERT' | 'RESERVATION' | 'PROFILE_REQUEST'; id: string }; details: Record<string, unknown>;
}

// Written in the caller's transaction: the audited change and its row commit (or roll back) together.
export async function audit(connection: PoolConnection, entry: AuditEntry): Promise<void> {
    await connection.execute(`INSERT INTO admin_audit_log (actor_user_id, action, target_user_id, role_id, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [entry.actor, entry.action, entry.target ?? null, entry.roleId ?? null,
        entry.entity?.type ?? null, entry.entity?.id ?? null, JSON.stringify(entry.details)]);
}
