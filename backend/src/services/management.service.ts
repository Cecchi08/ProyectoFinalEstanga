import { AppError } from '../utils/app-error.util.js';
import { assertConcertOwner } from './permissions.service.js';
import { ManagementRepository } from '../repositories/management.repository.ts';
import type { Catalog, ConcertRow, Database, Principal, TicketRow } from '../types/management.types.ts';
import type { CatalogQuery, ConcertInput, ConcertPatch, ConcertQuery, TicketInput, TicketPatch } from '../validators/management.schemas.ts';

const fail = (status: number, code: string, message: string): never => { throw new AppError(status, code, message, undefined); };
function required<T>(value: T | undefined): T {
    if (value === undefined) return fail(404, 'NOT_FOUND', 'Recurso inexistente.');
    return value;
}
function admin(user: Principal): void {
    if (!user.roles.includes('ADMIN')) fail(403, 'FORBIDDEN', 'Permisos insuficientes.');
}
function manager(user: Principal): void {
    if (!user.roles.some(role => ['ADMIN', 'ORGANIZER'].includes(role))) fail(403, 'FORBIDDEN', 'Permisos insuficientes.');
}
function visible(concert: ConcertRow, user?: Principal): void {
    if (concert.status === 'PUBLISHED' || user?.roles.includes('ADMIN') ||
        (user?.roles.includes('ORGANIZER') && user.id === concert.organizer_id)) return;
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
interface CatalogInput {
    name?: string; description?: string | null; image_url?: string | null;
    province_id?: string; city_id?: string; address?: string; capacity?: number | null; genre_ids?: string[];
}

export class ManagementService {
    constructor(private readonly db: Database) {}
    private async run<T>(write: boolean, work: (repo: ManagementRepository) => Promise<T>): Promise<T> {
        try {
            const execute = (repo: { connection: ConstructorParameters<typeof ManagementRepository>[0] }) => work(new ManagementRepository(repo.connection));
            return await (write ? this.db.transaction(execute) : this.db.read(execute));
        } catch (error) {
            const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
            if (code === 'ER_DUP_ENTRY') fail(409, 'DUPLICATE_RESOURCE', 'Ya existe un recurso con ese nombre en este ámbito.');
            if (code === 'ER_ROW_IS_REFERENCED_2') fail(409, 'RESOURCE_IN_USE', 'El recurso tiene relaciones y no puede eliminarse.');
            if (code === 'ER_NO_REFERENCED_ROW_2') fail(422, 'INVALID_REFERENCE', 'Uno de los recursos asociados no existe.');
            if (code === 'ER_CHECK_CONSTRAINT_VIOLATED') fail(422, 'VALIDATION_ERROR', 'Los datos incumplen las restricciones del recurso.');
            throw error;
        }
    }
    async catalogList(kind: Catalog, query: CatalogQuery) { return this.run(false, repo => repo.catalog(kind, query)); }
    async catalogGet(kind: Catalog, id: string) {
        return this.run(false, async repo => {
            const row = required(await repo.find(kind, id));
            return kind === 'artists' ? (await repo.artistDetails([row]))[0] : row;
        });
    }
    async catalogSave(kind: Catalog, input: CatalogInput, user: Principal, id?: string) {
        admin(user);
        return this.run(true, async repo => {
            if (id) required(await repo.find(kind, id, true));
            const { genre_ids, ...fields } = input;
            const key = id ?? await repo.insert(kind, fields);
            if (id) await repo.update(kind, id, fields);
            if (kind === 'artists' && genre_ids !== undefined) await repo.replaceRelations('artist_genres', key, genre_ids);
            const row = required(await repo.find(kind, key));
            return kind === 'artists' ? (await repo.artistDetails([row]))[0] : row;
        });
    }
    async catalogDelete(kind: Catalog, id: string, user: Principal): Promise<void> {
        admin(user);
        await this.run(true, async repo => {
            required(await repo.find(kind, id, true));
            if (kind === 'genres' && await repo.genreReferenced(id)) fail(409, 'RESOURCE_IN_USE', 'El género está asociado a artistas.');
            await repo.remove(kind, id);
        });
    }
    async concertTypes() { return this.run(false, repo => repo.concertTypes()); }
    async concertList(query: ConcertQuery, user?: Principal) {
        if ((query.mine || (query.status && query.status !== 'PUBLISHED')) && !user?.roles.some(role => ['ADMIN', 'ORGANIZER'].includes(role)))
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
    private async publishable(repo: ManagementRepository, concert: ConcertRow): Promise<void> {
        dates(concert.start_datetime, concert.end_datetime);
        if (!(await repo.find('venues', String(concert.venue_id)))) fail(422, 'INVALID_REFERENCE', 'Venue inexistente.');
        const detail = (await repo.concertDetails([concert]))[0];
        if (!detail.artists.length || !detail.genres.length || !detail.ticket_types.length)
            fail(422, 'INCOMPLETE_CONCERT', 'Publicar requiere al menos un artista, un género y un tipo de entrada.');
        for (const ticket of detail.ticket_types) ticketValid(ticket, concert);
    }
    async concertCreate(input: ConcertInput, user: Principal) {
        manager(user);
        if (!user.roles.includes('ADMIN') && input.organizer_id !== undefined)
            fail(403, 'FORBIDDEN_OWNER', 'El organizador se obtiene de la sesión.');
        dates(input.start_datetime, input.end_datetime);
        return this.run(true, async repo => {
            const { artist_ids = [], genre_ids = [], ticket_types = [], organizer_id, ...fields } = input;
            const owner = user.roles.includes('ADMIN') ? organizer_id ?? user.id : user.id;
            if (!(await repo.organizerExists(owner))) fail(422, 'INVALID_ORGANIZER', 'Se requiere un organizador activo con perfil y rol de ORGANIZER o ADMIN.');
            const id = await repo.insert('concerts', { ...fields, organizer_id: owner, status_id: await repo.statusId('DRAFT') });
            await repo.replaceRelations('concert_artists', id, artist_ids);
            await repo.replaceRelations('concert_genres', id, genre_ids);
            const concert = required(await repo.concert(id));
            for (const ticket of ticket_types) { ticketValid(ticket, concert); await repo.insert('ticket_types', { ...ticket, concert_id: id }); }
            return (await repo.concertDetails([concert]))[0];
        });
    }
    async concertUpdate(id: string, input: ConcertPatch, user: Principal) {
        return this.run(true, async repo => {
            const concert = await this.owned(repo, id, user); editable(concert);
            dates(input.start_datetime ?? concert.start_datetime, input.end_datetime === undefined ? concert.end_datetime : input.end_datetime);
            const { artist_ids, genre_ids, ...fields } = input;
            await repo.update('concerts', id, fields);
            if (artist_ids !== undefined) await repo.replaceRelations('concert_artists', id, artist_ids);
            if (genre_ids !== undefined) await repo.replaceRelations('concert_genres', id, genre_ids);
            const updated = required(await repo.concert(id));
            for (const ticket of await repo.tickets(id)) ticketValid(ticket, updated);
            if (updated.status === 'PUBLISHED') await this.publishable(repo, updated);
            return (await repo.concertDetails([updated]))[0];
        });
    }
    async concertDelete(id: string, user: Principal): Promise<void> {
        await this.run(true, async repo => {
            const concert = await this.owned(repo, id, user);
            if (concert.status !== 'DRAFT') fail(409, 'INVALID_STATE', 'Solo se eliminan borradores; los publicados deben cancelarse.');
            if (await repo.concertHistory(id)) fail(409, 'RESOURCE_IN_USE', 'El concierto tiene historial y debe conservarse.');
            await repo.remove('concerts', id);
        });
    }
    async concertTransition(id: string, action: 'publish' | 'cancel', user: Principal) {
        return this.run(true, async repo => {
            const concert = await this.owned(repo, id, user);
            if (action === 'publish') {
                if (concert.status !== 'DRAFT') fail(409, 'INVALID_STATE', 'Solo se publican borradores.');
                await this.publishable(repo, concert);
                await repo.update('concerts', id, { status_id: await repo.statusId('PUBLISHED'), published_at: new Date() });
            } else if (concert.status !== 'CANCELLED') {
                if (!['DRAFT', 'PUBLISHED'].includes(concert.status)) fail(409, 'INVALID_STATE', 'El concierto finalizado no se puede cancelar.');
                await repo.update('concerts', id, { status_id: await repo.statusId('CANCELLED') });
            }
            return (await repo.concertDetails([required(await repo.concert(id))]))[0];
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
