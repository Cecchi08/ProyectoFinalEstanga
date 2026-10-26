import { AppError } from '../utils/app-error.util.js';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
import { assertConcertOwner } from './permissions.service.js';
import { ManagementRepository, slugify } from '../repositories/management.repository.ts';
import { NotificationsRepository } from '../repositories/notifications.repository.ts';
import type { Catalog, ConcertRow, Database, Fields, Principal, TicketRow, Row } from '../types/management.types.ts';
import type { CatalogQuery, ConcertInput, ConcertPatch, ConcertQuery, StaffInput, TicketInput, TicketPatch } from '../validators/management.schemas.ts';

const fail = (status: number, code: string, message: string): never => { throw new AppError(status, code, message, undefined); };
function required<T>(value: T | undefined): T {
    if (value === undefined) return fail(404, 'NOT_FOUND', 'Recurso inexistente.');
    return value;
}
function admin(user: Principal): void {
    if (!can(user, P.catalogsManage)) fail(403, 'FORBIDDEN', 'Permisos insuficientes.');
}
function manager(user: Principal): void {
    if (!can(user, P.concertsManage, P.concertsManageAll)) fail(403, 'FORBIDDEN', 'Permisos insuficientes.');
}
function visible(concert: ConcertRow, user?: Principal): void {
    if (concert.status === 'PUBLISHED' || can(user, P.concertsManageAll) ||
        (can(user, P.concertsManage) && user?.id === concert.organizer_id)) return;
    fail(404, 'NOT_FOUND', 'Recurso inexistente.');
}
function editable(concert: ConcertRow): void {
    if (!['DRAFT', 'PUBLISHED'].includes(concert.status)) fail(409, 'INVALID_STATE', 'El concierto cancelado o finalizado no admite cambios.');
    if (concert.start_datetime <= new Date()) fail(409, 'CONCERT_STARTED', 'El concierto ya comenzó.');
}
function dates(start: Date, end?: Date | null): void {
    if (start <= new Date()) fail(422, 'INVALID_DATE', 'El concierto debe comenzar en el futuro.');
    if (end && end <= start) fail(422, 'INVALID_DATE', 'La fecha de fin debe ser posterior al inicio.');
}
function ticketValid(ticket: {
    price: number | string; stock_total: number; max_per_purchase?: number | null;
    sale_start?: Date | null; sale_end?: Date | null;
}, concert: ConcertRow): void {
    if (Number(ticket.price) < 0 || ticket.stock_total < 0 || (ticket.max_per_purchase != null && ticket.max_per_purchase <= 0))
        fail(422, 'INVALID_TICKET_TYPE', 'Precio, stock o máximo por compra inválidos.');
    if (ticket.sale_start && ticket.sale_end && ticket.sale_start >= ticket.sale_end)
        fail(422, 'INVALID_SALE_WINDOW', 'La venta debe finalizar después de su inicio.');
    if ((ticket.sale_start && ticket.sale_start >= concert.start_datetime) || (ticket.sale_end && ticket.sale_end > concert.start_datetime))
        fail(422, 'INVALID_SALE_WINDOW', 'La ventana de venta debe terminar antes o al inicio del concierto.');
}
type CatalogInput = Fields & { name?: string; code?: string; province_id?: string; district_id?: string; postal_code?: string | null };
interface LocationInput { venue_id?: string | null; reservation_id?: string | null; venue_name?: string | null; address_line?: string | null; city_id?: string | null }

export class ManagementService {
    constructor(private readonly db: Database) {}
    private async run<T>(write: boolean, work: (repo: ManagementRepository, notifications: NotificationsRepository) => Promise<T>): Promise<T> {
        try {
            const execute = (repo: { connection: ConstructorParameters<typeof ManagementRepository>[0] }) => work(new ManagementRepository(repo.connection), new NotificationsRepository(repo.connection));
            return await (write ? this.db.transaction(execute) : this.db.read(execute));
        } catch (error) {
            const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
            if (code === 'ER_DUP_ENTRY') fail(409, 'DUPLICATE_RESOURCE', 'Ya existe un recurso con ese nombre en este ámbito.');
            if (code === 'ER_ROW_IS_REFERENCED_2') fail(409, 'RESOURCE_IN_USE', 'El recurso tiene relaciones y no puede eliminarse.');
            if (code === 'ER_NO_REFERENCED_ROW_2') fail(422, 'INVALID_REFERENCE', 'Uno de los recursos asociados no existe.');
            if (code === 'ER_CHECK_CONSTRAINT_VIOLATED' || code === 'ER_DATA_TOO_LONG') fail(422, 'VALIDATION_ERROR', 'Los datos incumplen las restricciones del recurso.');
            throw error;
        }
    }
    async catalogList(kind: Catalog, query: CatalogQuery) { return this.run(false, repo => repo.catalog(kind, query)); }
    async catalogGet(kind: Catalog, id: string) { return this.run(false, async repo => required(await repo.find(kind, id))); }
    async catalogSave(kind: Catalog, input: CatalogInput, user: Principal, id?: string) {
        admin(user);
        return this.run(true, async repo => {
            if (id) required(await repo.find(kind, id, true));
            const fields = kind === 'genres' && !id && input.name ? { ...input, slug: slugify(input.name, 70) } : input;
            const key = id ?? await repo.insert(kind, fields);
            if (id) await repo.update(kind, id, fields);
            return required(await repo.find(kind, key));
        });
    }
    async catalogDelete(kind: Catalog, id: string, user: Principal): Promise<void> {
        admin(user);
        await this.run(true, async repo => {
            required(await repo.find(kind, id, true));
            if (kind === 'genres' && await repo.genreReferenced(id)) fail(409, 'RESOURCE_IN_USE', 'El género está asociado a conciertos.');
            await repo.remove(kind, id);
        });
    }
    async concertList(query: ConcertQuery, user?: Principal) {
        if ((query.mine || (query.status && query.status !== 'PUBLISHED')) && !can(user, P.concertsManage, P.concertsManageAll))
            fail(403, 'FORBIDDEN', 'El filtro requiere permisos de organización.');
        return this.run(false, repo => repo.concertList(query, user));
    }
    async concertGet(id: string, user?: Principal) {
        return this.run(false, async repo => {
            const concert = required(await repo.concert(id)); visible(concert, user);
            return (await repo.concertDetails([concert]))[0];
        });
    }
    private async owned(repo: ManagementRepository, id: string, user: Principal): Promise<ConcertRow> {
        const concert = required(await repo.concert(id, true));
        assertConcertOwner(user, concert.organizer_id);
        return concert;
    }
    // Resolves venue_id/reservation_id into the location columns the concert stores.
    private async location(repo: ManagementRepository, input: LocationInput, owner: string, current?: ConcertRow) {
        const fields: LocationInput = {};
        if (input.reservation_id) {
            const reservation = await repo.reservation(input.reservation_id);
            if (!reservation) return fail(422, 'INVALID_REFERENCE', 'Reserva inexistente.');
            if (reservation.user_id !== owner) fail(422, 'INVALID_RESERVATION', 'La reserva debe pertenecer al organizador del concierto.');
            if (!['CONFIRMED', 'COMPLETED'].includes(String(reservation.status_code))) fail(409, 'RESERVATION_NOT_CONFIRMED', 'La reserva debe estar confirmada.');
            if (input.venue_id !== undefined && input.venue_id !== reservation.venue_id) fail(422, 'INVALID_RESERVATION', 'La reserva corresponde a otro espacio.');
            fields.venue_id = String(reservation.venue_id);
        }
        const venue = fields.venue_id ?? input.venue_id;
        if (venue && venue !== current?.venue_id) {
            const snapshot = await repo.venueSnapshot(venue);
            if (!snapshot) return fail(422, 'INVALID_REFERENCE', 'Espacio inexistente.');
            for (const key of ['venue_name', 'address_line', 'city_id'] as const) if (input[key] === undefined) fields[key] = snapshot[key];
        }
        return fields;
    }
    private async reservationFits(repo: ManagementRepository, concert: ConcertRow): Promise<void> {
        if (!concert.reservation_id) return;
        const reservation = required(await repo.reservation(String(concert.reservation_id)));
        const end = concert.end_datetime ?? concert.start_datetime;
        if (concert.start_datetime < (reservation.event_start_at as Date) || end > (reservation.event_end_at as Date))
            fail(422, 'OUTSIDE_RESERVATION', 'El concierto debe realizarse dentro del horario de evento de la reserva.');
    }
    private async publishable(repo: ManagementRepository, concert: ConcertRow): Promise<void> {
        dates(concert.start_datetime, concert.end_datetime);
        if (!concert.venue_name || !concert.city_id) fail(422, 'INCOMPLETE_CONCERT', 'Publicar requiere un lugar y una ciudad.');
        await this.reservationFits(repo, concert);
        const detail = (await repo.concertDetails([concert]))[0];
        if (!detail.genres.length || !detail.ticket_types.length)
            fail(422, 'INCOMPLETE_CONCERT', 'Publicar requiere al menos un género y un tipo de entrada.');
        for (const ticket of detail.ticket_types) ticketValid(ticket, concert);
    }
    private async artists(repo: ManagementRepository, id: string, ids: string[] | undefined): Promise<void> {
        if (ids === undefined) return;
        if (await repo.publishedArtists(ids) !== ids.length) fail(422, 'INVALID_ARTIST', 'Solo se vinculan perfiles de artista publicados.');
        await repo.replaceArtists(id, ids);
    }
    async concertCreate(input: ConcertInput, user: Principal) {
        manager(user);
        if (!can(user, P.concertsManageAll) && input.organizer_id !== undefined)
            fail(403, 'FORBIDDEN_OWNER', 'El organizador se obtiene de la sesión.');
        dates(input.start_datetime, input.end_datetime);
        return this.run(true, async repo => {
            const { genre_ids = [], ticket_types = [], organizer_id, artist_profile_ids, ...fields } = input;
            const owner = can(user, P.concertsManageAll) ? organizer_id ?? user.id : user.id;
            if (!(await repo.organizerExists(owner))) fail(422, 'INVALID_ORGANIZER', 'Se requiere una cuenta activa con permiso para gestionar conciertos.');
            const location = await this.location(repo, fields, owner);
            const id = await repo.insert('concerts', { ...fields, ...location, organizer_id: owner, slug: slugify(fields.name, 200), status: 'DRAFT' });
            await repo.replaceGenres(id, genre_ids);
            await this.artists(repo, id, artist_profile_ids);
            const concert = required(await repo.concert(id));
            await this.reservationFits(repo, concert);
            for (const ticket of ticket_types) { ticketValid(ticket, concert); await repo.insert('ticket_types', { ...ticket, concert_id: id }); }
            return (await repo.concertDetails([concert]))[0];
        });
    }
    async concertUpdate(id: string, input: ConcertPatch, user: Principal) {
        return this.run(true, async (repo, notifications) => {
            const concert = await this.owned(repo, id, user); editable(concert);
            const before = (await repo.concertDetails([concert]))[0];
            dates(input.start_datetime ?? concert.start_datetime, input.end_datetime === undefined ? concert.end_datetime : input.end_datetime);
            const { genre_ids, artist_profile_ids, ...fields } = input;
            await repo.update('concerts', id, { ...fields, ...await this.location(repo, fields, concert.organizer_id, concert) });
            if (genre_ids !== undefined) await repo.replaceGenres(id, genre_ids);
            await this.artists(repo, id, artist_profile_ids);
            const updated = required(await repo.concert(id));
            await this.reservationFits(repo, updated);
            for (const ticket of await repo.tickets(id)) ticketValid(ticket, updated);
            if (updated.status === 'PUBLISHED') await this.publishable(repo, updated);
            const detail = (await repo.concertDetails([updated]))[0];
            const schedule = concert.start_datetime.getTime() !== updated.start_datetime.getTime() || concert.end_datetime?.getTime() !== updated.end_datetime?.getTime();
            const relations = (values: Row[]) => values.map(value => String(value.id)).sort().join(',');
            const relevant = ['name', 'artist_name', 'description', 'venue_id', 'venue_name', 'address_line', 'city_id'].some(key => concert[key] !== updated[key]) ||
                relations(before.genres) !== relations(detail.genres) || relations(before.artists) !== relations(detail.artists);
            if (concert.status === 'PUBLISHED' && (schedule || relevant)) {
                const when = updated.start_datetime.toISOString().replace('T', ' ').slice(0, 16);
                await notifications.concert(id, 'CONCERT_UPDATED', schedule ? 'Cambio de horario' : 'Información del concierto',
                    `${String(updated.name).slice(0, 180)}: información actualizada. Inicio: ${when} UTC. Lugar: ${String(updated.venue_name ?? 'a confirmar').slice(0, 150)}.`);
            }
            return detail;
        });
    }
    async concertDelete(id: string, user: Principal): Promise<void> {
        await this.run(true, async repo => {
            const concert = await this.owned(repo, id, user);
            if (concert.status !== 'DRAFT') fail(409, 'INVALID_STATE', 'Solo se eliminan borradores; los publicados deben cancelarse.');
            if (await repo.concertHistory(id)) fail(409, 'RESOURCE_IN_USE', 'El concierto tiene historial y debe conservarse.');
            await repo.removeConcert(id);
        });
    }
    async concertTransition(id: string, action: 'publish' | 'cancel', user: Principal) {
        return this.run(true, async (repo, notifications) => {
            const concert = await this.owned(repo, id, user);
            if (action === 'publish') {
                if (concert.status !== 'DRAFT') fail(409, 'INVALID_STATE', 'Solo se publican borradores.');
                await this.publishable(repo, concert);
                await repo.update('concerts', id, { status: 'PUBLISHED', published_at: new Date() });
            } else if (concert.status !== 'CANCELLED') {
                // chk_concerts_published: a concert leaves DRAFT only by publishing; drafts are deleted instead.
                if (concert.status === 'DRAFT') fail(409, 'INVALID_STATE', 'Los borradores se eliminan; solo se cancelan conciertos publicados.');
                if (concert.status !== 'PUBLISHED') fail(409, 'INVALID_STATE', 'El concierto finalizado no se puede cancelar.');
                await repo.update('concerts', id, { status: 'CANCELLED' });
                await notifications.concert(id, 'CONCERT_CANCELLED', 'Concierto cancelado', `${String(concert.name)} fue cancelado. Consultá el estado de tus entradas en tu compra.`);
            }
            return (await repo.concertDetails([required(await repo.concert(id))]))[0];
        });
    }
    // Staff is assigned per concert by its owner (or ADMIN); it never grants a global role.
    async staffList(concertId: string, user: Principal) {
        return this.run(false, async repo => {
            assertConcertOwner(user, required(await repo.concert(concertId)).organizer_id);
            return repo.staff(concertId);
        });
    }
    async staffAssign(concertId: string, input: StaffInput, user: Principal) {
        return this.run(true, async repo => {
            const concert = await this.owned(repo, concertId, user);
            if (!['DRAFT', 'PUBLISHED'].includes(concert.status)) fail(409, 'INVALID_STATE', 'El concierto cancelado o finalizado no admite staff nuevo.');
            const account = await repo.account(input.email);
            if (!account) return fail(422, 'INVALID_STAFF', 'No hay una cuenta activa registrada con ese email.');
            await repo.assignStaff(concertId, String(account.id));
            return repo.staff(concertId);
        });
    }
    async staffRemove(concertId: string, userId: string, user: Principal): Promise<void> {
        await this.run(true, async repo => {
            await this.owned(repo, concertId, user);
            if (!await repo.unassignStaff(concertId, userId)) fail(404, 'NOT_FOUND', 'La persona no está asignada a este concierto.');
        });
    }
    async ticketList(concertId: string, user?: Principal) {
        return this.run(false, async repo => {
            visible(required(await repo.concert(concertId)), user);
            return repo.tickets(concertId);
        });
    }
    async ticketCreate(concertId: string, input: TicketInput, user: Principal) {
        return this.run(true, async repo => {
            const concert = await this.owned(repo, concertId, user); editable(concert); ticketValid(input, concert);
            const id = await repo.insert('ticket_types', { ...input, concert_id: concertId });
            return required(await repo.ticket(id));
        });
    }
    async ticketUpdate(id: string, input: TicketPatch, user: Principal) {
        const initial = await this.run(false, async repo => required(await repo.ticket(id)));
        return this.run(true, async repo => {
            const concert = await this.owned(repo, initial.concert_id, user); editable(concert);
            // A locking read sees the latest child after waiting for another writer's parent lock.
            const ticket = required(await repo.find('ticket_types', id, true)) as TicketRow;
            const updated = { ...ticket, ...input };
            ticketValid(updated, concert);
            if (input.stock_total !== undefined && input.stock_total < ticket.stock_total && await repo.ticketHistory(id))
                fail(409, 'RESOURCE_IN_USE', 'No se reduce stock de entradas con historial de compras en esta etapa.');
            await repo.update('ticket_types', id, input);
            return required(await repo.ticket(id));
        });
    }
    async ticketDelete(id: string, user: Principal): Promise<void> {
        const initial = await this.run(false, async repo => required(await repo.ticket(id)));
        await this.run(true, async repo => {
            const concert = await this.owned(repo, initial.concert_id, user); editable(concert);
            required(await repo.find('ticket_types', id, true));
            await repo.remove('ticket_types', id);
            if (concert.status === 'PUBLISHED') await this.publishable(repo, concert);
        });
    }
}
