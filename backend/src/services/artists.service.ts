import { AppError } from '../utils/app-error.util.js';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
import { ArtistsRepository } from '../repositories/artists.repository.ts';
import { slugify } from '../repositories/management.repository.ts';
import type { Database, Principal, Row } from '../types/management.types.ts';
import type { ArtistInput, ArtistMemberInput, ArtistMemberRole, ArtistPatch, ArtistQuery, ProposalInput, ProposalQuery } from '../validators/artists.schemas.ts';

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
    // Upcoming and past performances; a non-published profile shows them only to its members and admins.
    concerts(id: string, user?: Principal) {
        return this.run(false, async repo => {
            const profile = required(await repo.profile(id));
            const insider = Boolean(user && (admin(user) || await repo.memberRole(id, user.id)));
            if (profile.status !== 'PUBLISHED' && !insider) fail(404, 'NOT_FOUND', 'Perfil de artista inexistente.');
            const now = Date.now();
            const concerts = await repo.concerts(id);
            return { upcoming: concerts.filter(c => c.start_datetime.getTime() >= now).reverse(), past: concerts.filter(c => c.start_datetime.getTime() < now) };
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

    // ---- Bidirectional Proposals & Hirings ----
    private async decorateProposal(repo: ArtistsRepository, row: Row, user: Principal): Promise<Record<string, unknown>> {
        const isArtistSide = admin(user) || Boolean(await repo.memberRole(String(row.artist_profile_id), user.id));
        const estId = row.establishment_id ? String(row.establishment_id) : undefined;
        const isVenueSide = admin(user) || Boolean(estId && await repo.isEstablishmentMember(estId, user.id));
        const isSender = String(row.sender_user_id) === user.id;
        const canRespond = row.status === 'PENDING' && (
            (row.flow_type === 'ARTIST_TO_VENUE' && isVenueSide) ||
            (row.flow_type !== 'ARTIST_TO_VENUE' && isArtistSide)
        );
        const canCancel = row.status === 'PENDING' && isSender;
        // Side of the viewer, so the detail screen explains who must answer without exposing internal ids.
        const viewerSide = isSender ? 'SENDER' : isArtistSide ? 'ARTIST' : isVenueSide ? 'VENUE' : 'ADMIN';
        return { ...row, can_respond: canRespond, can_cancel: canCancel, viewer_side: viewerSide };
    }

    proposals(query: ProposalQuery, user: Principal) {
        return this.run(false, async repo => {
            const result = await repo.proposals(user.id, query, admin(user) || can(user, P.marketplaceAdmin));
            const decorated = await Promise.all(result.data.map(row => this.decorateProposal(repo, row, user)));
            return { data: decorated, total: result.total };
        });
    }

    proposal(id: string, user: Principal) {
        return this.run(false, async repo => {
            const row = await repo.proposal(id) ?? fail(404, 'NOT_FOUND', 'La propuesta no existe o fue eliminada.');
            const isArtistSide = Boolean(await repo.memberRole(String(row.artist_profile_id), user.id));
            const estId = row.establishment_id ? String(row.establishment_id) : undefined;
            const isVenueSide = Boolean(estId && await repo.isEstablishmentMember(estId, user.id));
            // Only the sender, the artist's members, the venue's organization members and admins may open a proposal.
            if (!admin(user) && !can(user, P.marketplaceAdmin) && String(row.sender_user_id) !== user.id && !isArtistSide && !isVenueSide)
                fail(403, 'FORBIDDEN', 'No tenés acceso a esta propuesta.');
            return this.decorateProposal(repo, row, user);
        });
    }

    createProposal(input: ProposalInput, user: Principal) {
        if (input.proposed_date <= new Date()) fail(422, 'INVALID_DATE', 'La fecha propuesta debe ser futura.');
        return this.run(true, async repo => {
            const artist = await repo.profile(input.artist_profile_id) ?? fail(404, 'NOT_FOUND', 'Perfil de artista inexistente.');
            let venueId = input.venue_id ?? null;
            let establishmentId = input.establishment_id ?? null;
            let establishmentName = '';
            let venueName = '';

            if (venueId) {
                const v = await repo.venueContext(venueId) ?? fail(422, 'INVALID_REFERENCE', 'Espacio inexistente.');
                establishmentId = v.establishment_id;
                establishmentName = v.establishment_name;
                venueName = v.name;
            } else if (establishmentId) {
                const est = await repo.establishmentContext(establishmentId) ?? fail(422, 'INVALID_REFERENCE', 'Establecimiento inexistente.');
                establishmentName = est.name;
            }

            if (input.flow_type === 'VENUE_TO_ARTIST') {
                if (!establishmentId) fail(422, 'VENUE_REQUIRED', 'Indicá el establecimiento o espacio desde el cual realizás la propuesta.');
                if (!admin(user) && !can(user, P.marketplaceAdmin)) {
                    if (!can(user, P.establishmentsManage) || !await repo.isEstablishmentMember(String(establishmentId), user.id))
                        fail(403, 'FORBIDDEN', 'No tenés permisos sobre este espacio físico.');
                }
            } else if (input.flow_type === 'ARTIST_TO_VENUE') {
                if (!establishmentId) fail(422, 'VENUE_REQUIRED', 'Seleccioná el espacio físico al que querés enviar tu propuesta.');
                await this.member(repo, input.artist_profile_id, user);
            } else if (input.flow_type === 'ORGANIZER_TO_ARTIST') {
                if (!can(user, P.concertsManage, P.concertsManageAll))
                    fail(403, 'FORBIDDEN', 'Necesitás permisos de organizador para enviar propuestas de contratación.');
                if (input.concert_id) {
                    const concert = await repo.concertContext(input.concert_id) ?? fail(422, 'INVALID_REFERENCE', 'Concierto inexistente.');
                    if (!can(user, P.concertsManageAll) && String(concert.organizer_user_id) !== user.id)
                        fail(403, 'FORBIDDEN', 'Solo podés vincular conciertos propios.');
                    if (!venueId && concert.venue_id) {
                        venueId = String(concert.venue_id);
                        const v = await repo.venueContext(venueId);
                        if (v) { establishmentId = v.establishment_id; establishmentName = v.establishment_name; venueName = v.name; }
                    }
                }
            }

            if (await repo.duplicatePendingProposal(input.flow_type, input.artist_profile_id, venueId, input.proposed_date))
                fail(409, 'DUPLICATE_PROPOSAL', 'Ya existe una propuesta pendiente para este artista, espacio y fecha.');
            const busy = await repo.acceptedConflict(input.artist_profile_id, input.proposed_date, input.proposed_end_date ?? null);
            if (busy) fail(409, 'DATE_CONFLICT', `El artista ya tiene una contratación confirmada en ese horario ("${String(busy.event_title)}").`);

            const id = await repo.createProposal({
                flow_type: input.flow_type,
                artist_profile_id: input.artist_profile_id,
                venue_id: venueId,
                establishment_id: establishmentId,
                concert_id: input.concert_id ?? null,
                sender_user_id: user.id,
                event_title: input.event_title,
                event_description: input.event_description ?? null,
                genre_or_format: input.genre_or_format ?? null,
                proposed_date: input.proposed_date,
                proposed_end_date: input.proposed_end_date ?? null,
                expected_attendance: input.expected_attendance ?? null,
                offered_amount: input.offered_amount ?? null,
                currency: 'ARS',
                economic_terms: input.economic_terms ?? null,
                space_conditions: input.space_conditions ?? null,
                technical_requirements: input.technical_requirements ?? null,
                message: input.message ?? null,
                status: 'PENDING',
            });

            const created = await repo.proposal(id) ?? fail(404, 'NOT_FOUND', 'Propuesta inexistente.');
            const senderLabel = input.flow_type === 'VENUE_TO_ARTIST' ? (establishmentName || String(created.sender_name ?? 'Espacio Físico'))
                : input.flow_type === 'ARTIST_TO_VENUE' ? String(artist.stage_name)
                : String(created.sender_name ?? 'Organizador');
            const entityLabel = `${input.event_title} · ${venueName || establishmentName || String(artist.stage_name)}`;

            if (input.flow_type === 'ARTIST_TO_VENUE' && establishmentId) {
                await repo.notifyEstablishmentMembers(establishmentId, id,
                    `Solicitud de presentación de ${String(artist.stage_name)}`,
                    `${String(artist.stage_name)} envió una propuesta para "${input.event_title}" en ${venueName || establishmentName}.`,
                    { flow_type: input.flow_type, sender_name: senderLabel, entity_label: entityLabel });
            } else {
                await repo.notifyArtistMembers(input.artist_profile_id, id,
                    `Nueva propuesta de contratación — ${senderLabel}`,
                    `Recibiste una propuesta para "${input.event_title}" (${input.genre_or_format ?? 'Show en vivo'}).`,
                    { flow_type: input.flow_type, sender_name: senderLabel, entity_label: entityLabel });
            }

            return this.decorateProposal(repo, created, user);
        });
    }

    decideProposal(id: string, action: 'accept' | 'reject' | 'cancel', reason: string | null | undefined, user: Principal) {
        return this.run(true, async repo => {
            const locked = await repo.lockProposal(id) ?? fail(404, 'NOT_FOUND', 'Propuesta inexistente.');
            const full = await repo.proposal(id) ?? fail(404, 'NOT_FOUND', 'Propuesta inexistente.');
            if (locked.status !== 'PENDING') fail(409, 'INVALID_STATE', 'La propuesta ya fue respondida o cerrada.');
            const startsAt = new Date(String(locked.proposed_date instanceof Date ? locked.proposed_date.toISOString() : locked.proposed_date));
            if (startsAt.getTime() <= Date.now()) fail(409, 'PROPOSAL_EXPIRED', 'La propuesta venció: su fecha ya pasó y no admite respuestas.');

            const isArtistSide = admin(user) || Boolean(await repo.memberRole(String(locked.artist_profile_id), user.id));
            const estId = full.establishment_id ? String(full.establishment_id) : undefined;
            const isVenueSide = admin(user) || can(user, P.marketplaceAdmin) || Boolean(estId && await repo.isEstablishmentMember(estId, user.id));

            if (action === 'cancel') {
                if (!admin(user) && String(locked.sender_user_id) !== user.id)
                    fail(403, 'FORBIDDEN', 'Solo quien envió la propuesta puede cancelarla.');
                await repo.updateProposal(id, { status: 'CANCELLED', rejection_reason: reason ?? null, responded_by_user_id: user.id, responded_at: new Date() });
            } else {
                const allowed = locked.flow_type === 'ARTIST_TO_VENUE' ? isVenueSide : isArtistSide;
                if (!allowed) fail(403, 'FORBIDDEN', 'Solo la parte destinataria puede responder esta propuesta.');
                const nextStatus = action === 'accept' ? 'ACCEPTED' : 'REJECTED';
                if (action === 'accept') {
                    const endsAt = locked.proposed_end_date ? new Date(String(locked.proposed_end_date instanceof Date ? locked.proposed_end_date.toISOString() : locked.proposed_end_date)) : null;
                    const busy = await repo.acceptedConflict(String(locked.artist_profile_id), startsAt, endsAt, id);
                    if (busy) fail(409, 'DATE_CONFLICT', `El artista ya tiene una contratación confirmada que se superpone ("${String(busy.event_title)}").`);
                }
                await repo.updateProposal(id, {
                    status: nextStatus,
                    rejection_reason: action === 'reject' ? (reason ?? null) : null,
                    responded_by_user_id: user.id,
                    responded_at: new Date(),
                });
                if (action === 'accept' && locked.concert_id) {
                    await repo.linkArtistToConcert(String(locked.concert_id), String(locked.artist_profile_id));
                }
                const responderLabel = locked.flow_type === 'ARTIST_TO_VENUE'
                    ? String(full.establishment_name ?? full.venue_name ?? 'Espacio Físico')
                    : String(full.artist_name ?? 'Artista');
                const entityLabel = `${String(full.event_title)} · ${String(full.artist_name ?? '')}`;
                await repo.notifyProposalUser(String(locked.sender_user_id), id,
                    action === 'accept' ? `Propuesta aceptada por ${responderLabel}` : `Propuesta rechazada por ${responderLabel}`,
                    action === 'accept'
                        ? `${responderLabel} aceptó la propuesta para "${String(full.event_title)}". La contratación quedó confirmada.`
                        : `${responderLabel} rechazó la propuesta para "${String(full.event_title)}"${reason ? `: ${reason}` : '.'}`,
                    { flow_type: locked.flow_type, sender_name: responderLabel, entity_label: entityLabel });
            }

            const updated = await repo.proposal(id) ?? fail(404, 'NOT_FOUND', 'Propuesta inexistente.');
            return this.decorateProposal(repo, updated, user);
        });
    }

    venueSummary(establishmentId: string, user: Principal) {
        return this.run(false, async repo => {
            const est = await repo.establishmentContext(establishmentId) ?? fail(404, 'NOT_FOUND', 'Establecimiento inexistente.');
            if (!admin(user) && !can(user, P.marketplaceAdmin) && !await repo.isEstablishmentMember(est.id, user.id))
                fail(403, 'FORBIDDEN', 'No tenés permisos sobre este establecimiento.');
            const summary = await repo.venueSummary(est.id);
            const proposals = await Promise.all(summary.proposals.map(row => this.decorateProposal(repo, row, user)));
            return { ...summary, contracted_artists: proposals.filter(row => row.status === 'ACCEPTED'), proposals };
        });
    }
}
