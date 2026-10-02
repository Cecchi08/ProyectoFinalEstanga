import bcrypt from 'bcrypt';
import { publicUser } from '../types/auth.types.js';
import { AppError, isDuplicate, unauthorized } from '../utils/app-error.util.js';
import { hashToken, randomToken } from '../utils/token.util.js';
const genericMessage = 'Si la cuenta cumple los requisitos, recibirás un email con instrucciones.';
export class AuthService {
    db;
    env;
    jwt;
    mailer;
    dummyHash;
    constructor(db, env, jwt, mailer) {
        this.db = db;
        this.env = env;
        this.jwt = jwt;
        this.mailer = mailer;
        this.dummyHash = bcrypt.hash(randomToken(), env.BCRYPT_ROUNDS);
    }
    active(user) {
        if (!user?.is_active)
            throw unauthorized();
    }
    verified(user) {
        if (this.env.REQUIRE_EMAIL_VERIFICATION && !user.email_verified_at)
            throw new AppError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verificá tu email antes de iniciar sesión.');
    }
    async issue(repo, user) {
        const roles = await repo.roles(user.id);
        if (!roles.length)
            throw new AppError(403, 'NO_ROLES', 'La cuenta no tiene permisos asignados.');
        const refreshToken = randomToken();
        await repo.insertToken('refresh', user.id, hashToken(refreshToken), new Date(Date.now() + this.env.REFRESH_TOKEN_EXPIRES_DAYS * 86400000));
        return { user: publicUser(user), roles, accessToken: this.jwt.sign(user.id, roles), refreshToken, tokenType: 'Bearer', expiresIn: this.jwt.expiresIn };
    }
    async emailToken(repo, user, kind) {
        const token = randomToken();
        const ttl = kind === 'verification' ? this.env.EMAIL_VERIFICATION_EXPIRES_HOURS * 3600000 : this.env.PASSWORD_RESET_EXPIRES_MINUTES * 60000;
        await repo.invalidateUserTokens(kind, user.id);
        await repo.insertToken(kind, user.id, hashToken(token), new Date(Date.now() + ttl));
        return { to: user.email, kind, token };
    }
    async register(input) {
        const password_hash = await bcrypt.hash(input.password, this.env.BCRYPT_ROUNDS);
        try {
            const result = await this.db.transaction(async (repo) => {
                if (await repo.findUserByEmail(input.email))
                    throw new AppError(409, 'EMAIL_UNAVAILABLE', 'El email no está disponible.');
                const user = await repo.createUser({ first_name: input.first_name, last_name: input.last_name, email: input.email, password_hash, email_verified_at: null });
                await repo.initializeUser(user.id);
                const mail = await this.emailToken(repo, user, 'verification');
                return { user: publicUser(user), roles: await repo.roles(user.id), mail };
            });
            this.mailer.enqueue(result.mail);
            return { user: result.user, roles: result.roles, message: 'Cuenta creada. Revisá tu email para verificarla.' };
        }
        catch (error) {
            if (isDuplicate(error))
                throw new AppError(409, 'EMAIL_UNAVAILABLE', 'El email no está disponible.');
            throw error;
        }
    }
    async login(email, password) {
        const snapshot = await this.db.read(repo => repo.findUserByEmail(email));
        const valid = await bcrypt.compare(password, snapshot?.password_hash ?? await this.dummyHash);
        if (!valid || !snapshot?.password_hash)
            throw unauthorized();
        return this.db.transaction(async (repo) => {
            const user = await repo.findUserById(snapshot.id, true);
            this.active(user);
            if (user.password_hash !== snapshot.password_hash)
                throw unauthorized();
            this.verified(user);
            return this.issue(repo, user);
        });
    }
    async lockedToken(repo, kind, raw) {
        const hash = hashToken(raw);
        const initial = await repo.findToken(kind, hash);
        if (!initial)
            throw unauthorized();
        // Every operation locks the user before token rows, including password reset.
        const user = await repo.findUserById(initial.user_id, true);
        this.active(user);
        const token = await repo.findToken(kind, hash, true);
        if (!token || token.expires_at.getTime() <= Date.now() || token.revoked_at || token.used_at)
            throw unauthorized();
        return { user, token };
    }
    refresh(raw) {
        return this.db.transaction(async (repo) => {
            const { user, token } = await this.lockedToken(repo, 'refresh', raw);
            this.verified(user);
            await repo.invalidateToken('refresh', token.id);
            return this.issue(repo, user);
        });
    }
    async logout(raw) {
        await this.db.transaction(async (repo) => {
            const initial = await repo.findToken('refresh', hashToken(raw));
            if (!initial)
                return;
            await repo.findUserById(initial.user_id, true);
            await repo.invalidateToken('refresh', initial.id);
        });
        return { message: 'Sesión cerrada.' };
    }
    async me(id) {
        return this.db.read(async (repo) => {
            const user = await repo.findUserById(id);
            this.active(user);
            return { user: publicUser(user), roles: await repo.roles(id), preferences: await repo.preferences(id) };
        });
    }
    async principal(id) {
        return this.db.read(async (repo) => {
            const user = await repo.findUserById(id);
            this.active(user);
            this.verified(user);
            return { id: user.id, roles: await repo.roles(id) };
        });
    }
    async requestEmail(email, kind) {
        const mail = await this.db.transaction(async (repo) => {
            const user = await repo.findUserByEmail(email, true);
            if (!user?.is_active || (kind === 'verification' && user.email_verified_at))
                return null;
            return this.emailToken(repo, user, kind);
        });
        if (mail)
            this.mailer.enqueue(mail);
        return { message: genericMessage };
    }
    async verifyEmail(raw) {
        await this.db.transaction(async (repo) => {
            const { user } = await this.lockedToken(repo, 'verification', raw);
            await repo.markVerified(user.id);
            await repo.invalidateUserTokens('verification', user.id);
        });
        return { message: 'Email verificado.' };
    }
    async resetPassword(raw, password) {
        const hash = await bcrypt.hash(password, this.env.BCRYPT_ROUNDS);
        await this.db.transaction(async (repo) => {
            const { user } = await this.lockedToken(repo, 'reset', raw);
            await repo.setPassword(user.id, hash);
            await repo.invalidateUserTokens('reset', user.id);
            await repo.invalidateUserTokens('refresh', user.id);
        });
        return { message: 'Contraseña actualizada. Iniciá sesión nuevamente.' };
    }
    async oauthIdentity(identity, linkUserId) {
        try {
            const result = await this.db.transaction(async (repo) => {
                const existingId = await repo.oauthUser(identity.provider, identity.subject);
                if (existingId) {
                    if (linkUserId && existingId !== linkUserId)
                        throw new AppError(409, 'OAUTH_LINK_CONFLICT', 'La cuenta OAuth ya está vinculada.');
                    const user = await repo.findUserById(existingId, true);
                    this.active(user);
                    this.verified(user);
                    return { id: user.id, mail: null };
                }
                let user;
                let mail = null;
                if (linkUserId) {
                    user = await repo.findUserById(linkUserId, true);
                    this.active(user);
                    this.verified(user);
                }
                else {
                    if (!identity.email)
                        throw new AppError(422, 'OAUTH_EMAIL_REQUIRED', 'El proveedor no devolvió un email. Registrate y vinculá la cuenta desde una sesión autenticada.');
                    user = await repo.findUserByEmail(identity.email, true);
                    if (user) {
                        this.active(user);
                        // Prevent pre-registration hijacking: an unverified local password must not survive an automatic merge.
                        if (!identity.emailVerified || !user.email_verified_at)
                            throw new AppError(409, 'OAUTH_LINK_REQUIRED', 'Verificá tu cuenta e iniciá sesión para vincular este proveedor.');
                    }
                    else {
                        user = await repo.createUser({ email: identity.email, first_name: identity.firstName, last_name: identity.lastName,
                            password_hash: null, email_verified_at: identity.emailVerified ? new Date() : null });
                        await repo.initializeUser(user.id);
                        if (!identity.emailVerified)
                            mail = await this.emailToken(repo, user, 'verification');
                    }
                }
                await repo.linkOAuth(user.id, identity.provider, identity.subject);
                return { id: user.id, mail };
            });
            if (result.mail)
                this.mailer.enqueue(result.mail);
            // Check after commit so a new unverified OAuth account and verification token survive.
            await this.principal(result.id);
            return result.id;
        }
        catch (error) {
            if (isDuplicate(error))
                throw new AppError(409, 'OAUTH_LINK_CONFLICT', 'La cuenta o proveedor ya está vinculado. Volvé a iniciar el flujo.');
            throw error;
        }
    }
    oauthSession(id) {
        return this.db.transaction(async (repo) => {
            const user = await repo.findUserById(id, true);
            this.active(user);
            this.verified(user);
            return this.issue(repo, user);
        });
    }
}
