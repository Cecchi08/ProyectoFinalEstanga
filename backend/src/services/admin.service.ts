import { AppError } from '../utils/app-error.util.js';
import { AdminRepository } from '../repositories/admin.repository.ts';
import { MysqlAuthRepository } from '../repositories/mysql.repository.js';
import { SELF_SERVICE_ROLES } from '../types/auth.types.js';
import type { Database, Principal } from '../types/management.types.ts';
import type { AuditQuery, UserQuery } from '../validators/admin.schemas.ts';

const fail = (status: number, code: string, message: string): never => { throw new AppError(status, code, message, undefined); };
const SELF_SERVICE = new Set(SELF_SERVICE_ROLES);

// Role changes take effect on the user's next request: the principal is rebuilt from user_roles every time.
export class AdminService {
    constructor(private readonly db: Database) {}
    private run<T>(write: boolean, work: (repo: AdminRepository) => Promise<T>): Promise<T> {
        const execute = (repo: { connection: ConstructorParameters<typeof AdminRepository>[0] }) => work(new AdminRepository(repo.connection));
        return write ? this.db.transaction(execute) : this.db.read(execute);
    }
    users(query: UserQuery) { return this.run(false, repo => repo.users(query)); }
    user(id: string) { return this.run(false, async repo => await repo.user(id) ?? fail(404, 'NOT_FOUND', 'Usuario inexistente.')); }
    auditLog(query: AuditQuery) { return this.run(false, repo => repo.auditLog(query)); }
    // The change and its audit row commit together: a role change is never left unrecorded.
    grant(userId: string, role: string, reason: string | null | undefined, actor: Principal) {
        return this.run(true, async repo => {
            const target = await this.lock(repo, role, userId);
            if (target.user.is_guest || target.user.status !== 'ACTIVE') fail(422, 'USER_NOT_ELIGIBLE', 'Solo se asignan perfiles a cuentas registradas y activas.');
            const changed = await repo.grant(userId, target.role.id) === 1;
            if (changed) await repo.audit({ actor: actor.id, action: 'ROLE_GRANTED', target: userId, roleId: target.role.id,
                details: { role, reason: reason ?? null, target_email: target.user.email } });
            return { changed, user: await repo.user(userId) };
        });
    }
    revoke(userId: string, role: string, reason: string | null | undefined, actor: Principal) {
        return this.run(true, async repo => {
            const target = await this.lock(repo, role, userId);
            if (!await repo.hasRole(userId, target.role.id)) fail(404, 'ROLE_NOT_GRANTED', 'La cuenta no tiene ese perfil.');
            if (role === 'ADMIN' && target.user.status === 'ACTIVE' && await repo.activeHolders(target.role.id) <= 1)
                fail(409, 'LAST_ADMIN', 'La plataforma necesita al menos un ADMIN activo.');
            // Login refuses accounts without roles (NO_ROLES); removing the last one would lock the user out.
            if (await repo.roleCount(userId) <= 1) fail(409, 'LAST_ROLE', 'La cuenta debe conservar al menos un perfil.');
            await repo.revoke(userId, target.role.id);
            await repo.audit({ actor: actor.id, action: 'ROLE_REVOKED', target: userId, roleId: target.role.id,
                details: { role, reason: reason ?? null, target_email: target.user.email } });
            return { changed: true, user: await repo.user(userId) };
        });
    }
    // Self-service profiles (SELF_SERVICE_ROLES): the person activates them for their own account, audited like an admin grant.
    profiles(user: Principal) {
        const held = new Set(user.roles);
        return this.run(false, async repo => ({
            roles: user.roles, permissions: user.permissions,
            self_service: (await repo.roleCatalog(SELF_SERVICE_ROLES)).map(role => ({ ...role, active: held.has(String(role.code)) })),
        }));
    }
    activate(role: string, user: Principal) {
        return this.run(true, async repo => {
            if (!SELF_SERVICE.has(role)) fail(403, 'ADMIN_APPROVAL_REQUIRED', 'Ese perfil lo activa un ADMIN.');
            const target = await this.lock(repo, role, user.id);
            if (target.user.is_guest || target.user.status !== 'ACTIVE') fail(422, 'USER_NOT_ELIGIBLE', 'Solo una cuenta registrada y activa activa perfiles.');
            const changed = await repo.grant(user.id, target.role.id) === 1;
            if (changed) await repo.audit({ actor: user.id, action: 'ROLE_SELF_ACTIVATED', target: user.id, roleId: target.role.id,
                details: { role, self_service: true, target_email: target.user.email } });
            // Same transaction and connection: the response already reflects the new grants.
            const access = await new MysqlAuthRepository(repo.connection).access(user.id);
            return { changed, ...access };
        });
    }
    private async lock(repo: AdminRepository, role: string, userId: string) {
        const lockedRole = await repo.lockRole(role) ?? fail(422, 'UNKNOWN_ROLE', 'Perfil inexistente.');
        const user = await repo.lockUser(userId) ?? fail(404, 'NOT_FOUND', 'Usuario inexistente.');
        return { role: lockedRole, user };
    }
}
