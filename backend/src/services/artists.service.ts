import { AppError } from '../utils/app-error.util.js';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
import { ArtistsRepository } from '../repositories/artists.repository.ts';
import { slugify } from '../repositories/management.repository.ts';
import type { Database, Principal } from '../types/management.types.ts';
import type { ArtistInput, ArtistMemberInput, ArtistMemberRole, ArtistPatch, ArtistQuery } from '../validators/artists.schemas.ts';

const fail = (status: number, code: string, message: string): never => { throw new AppError(status, code, message, undefined); };
const required = <T>(value: T | undefined): T => value ?? fail(404, 'NOT_FOUND', 'Perfil de artista inexistente.');
const admin = (user?: Principal) => can(user, P.artistsAdmin);

export class ArtistsService {
    constructor(private readonly db: Database) {}
    private async run<T>(write: boolean, work: (repo: ArtistsRepository) => Promise<T>): Promise<T> {
        try {
            const execute = (repo: { connection: ConstructorParameters<typeof ArtistsRepository>[0] }) => work(new ArtistsRepository(repo.connection));
            return await (write ? this.db.transaction(execute) : this.db.read(execute));
        } catch (error) {
            const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
            if (code === 'ER_NO_REFERENCED_ROW_2') fail(422, 'INVALID_REFERENCE', 'La ciudad o algún género no existen.');
            if (code === 'ER_DUP_ENTRY') fail(409, 'DUPLICATE_RESOURCE', 'Ya existe un recurso con esos datos.');
            if (code === 'ER_CHECK_CONSTRAINT_VIOLATED') fail(422, 'VALIDATION_ERROR', 'Los datos incumplen las restricciones del perfil.');
            throw error;
        }
    }
    // OWNER manages status and members; any member edits the content; artists.admin can do everything.
    private async member(repo: ArtistsRepository, id: string, user: Principal, owner = false): Promise<void> {
        if (admin(user)) return;
        const role = can(user, P.artistProfileManage) ? await repo.memberRole(id, user.id) : undefined;
        if (!role || (owner && role !== 'OWNER')) fail(403, 'FORBIDDEN', 'No tenés permisos sobre este perfil de artista.');
    }
    private async detail(repo: ArtistsRepository, id: string, withEmail: boolean) {
        const [profile] = await repo.withGenres([required(await repo.profile(id))]);
        return { ...profile, members: await repo.members(id, withEmail) };
    }
    list(query: ArtistQuery) { return this.run(false, repo => repo.list(query)); }
    mine(user: Principal) { return this.run(false, repo => repo.mine(user.id)); }
    // Drafts and archived profiles are visible only to their members and admins.
    get(id: string, user?: Principal) {
        return this.run(false, async repo => {
            const profile = required(await repo.profile(id));
            const insider = Boolean(user && (admin(user) || await repo.memberRole(id, user.id)));
            if (profile.status !== 'PUBLISHED' && !insider) fail(404, 'NOT_FOUND', 'Perfil de artista inexistente.');
            return this.detail(repo, id, insider);
        });
    }
    create(input: ArtistInput, user: Principal) {
        return this.run(true, async repo => {
            const { genre_ids = [], ...fields } = input;
            const id = await repo.insert({ ...fields, slug: slugify(input.stage_name, 200), status: 'DRAFT', created_by_user_id: user.id });
            await repo.addMember(id, user.id, 'OWNER');
            await repo.replaceGenres(id, genre_ids);
            return this.detail(repo, id, true);
        });
    }
    update(id: string, input: ArtistPatch, user: Principal) {
        return this.run(true, async repo => {
            const profile = required(await repo.lock(id));
            await this.member(repo, id, user);
            if (profile.status === 'ARCHIVED') fail(409, 'INVALID_STATE', 'Un perfil archivado no se edita; publicalo de nuevo primero.');
            const { genre_ids, ...fields } = input;
            await repo.update(id, fields);
            if (genre_ids !== undefined) await repo.replaceGenres(id, genre_ids);
            return this.detail(repo, id, true);
        });
    }
    status(id: string, status: 'PUBLISHED' | 'ARCHIVED', user: Principal) {
        return this.run(true, async repo => {
            const profile = required(await repo.lock(id));
            await this.member(repo, id, user, true);
            await repo.update(id, { status, published_at: status === 'PUBLISHED' ? (profile.published_at as Date | null) ?? new Date() : undefined });
            return this.detail(repo, id, true);
        });
    }
    members(id: string, user: Principal) {
        return this.run(false, async repo => {
            required(await repo.profile(id));
            await this.member(repo, id, user);
            return repo.members(id, true);
        });
    }
    addMember(id: string, input: ArtistMemberInput, user: Principal) {
        return this.run(true, async repo => {
            required(await repo.lock(id));
            await this.member(repo, id, user, true);
            const candidate = await repo.candidate(input.email) ?? fail(422, 'INVALID_MEMBER', 'No hay una cuenta activa registrada con ese email.');
            if (!candidate.artist) fail(422, 'MEMBER_NOT_ARTIST', 'La cuenta necesita el perfil ARTISTA.');
            if (await repo.memberRole(id, candidate.id)) fail(409, 'ALREADY_MEMBER', 'La cuenta ya integra este perfil.');
            await repo.addMember(id, candidate.id, input.member_role);
            return repo.members(id, true);
        });
    }
    updateMember(id: string, userId: string, role: ArtistMemberRole, user: Principal) {
        return this.run(true, async repo => {
            required(await repo.lock(id));
            await this.member(repo, id, user, true);
            const current = await repo.memberRole(id, userId) ?? fail(404, 'NOT_FOUND', 'La cuenta no integra este perfil.');
            if (current === 'OWNER' && role !== 'OWNER' && await repo.owners(id) <= 1) fail(409, 'LAST_OWNER', 'El perfil necesita al menos un OWNER.');
            await repo.setMemberRole(id, userId, role);
            return repo.members(id, true);
        });
    }
    // Any member may leave; removing someone else is for an OWNER.
    removeMember(id: string, userId: string, user: Principal) {
        return this.run(true, async repo => {
            required(await repo.lock(id));
            await this.member(repo, id, user, userId !== user.id);
            const current = await repo.memberRole(id, userId) ?? fail(404, 'NOT_FOUND', 'La cuenta no integra este perfil.');
            if (current === 'OWNER' && await repo.owners(id) <= 1) fail(409, 'LAST_OWNER', 'El perfil necesita al menos un OWNER.');
            await repo.removeMember(id, userId);
        });
    }
}
