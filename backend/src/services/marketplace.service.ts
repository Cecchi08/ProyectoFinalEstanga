import { AppError } from '../utils/app-error.util.js';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
import { MarketplaceRepository } from '../repositories/marketplace.repository.ts';
import { NotificationsRepository } from '../repositories/notifications.repository.ts';
import { slugify } from '../repositories/management.repository.ts';
import { MAX_AMOUNT, cents, decimal } from '../utils/money.util.ts';
import type { Database, Principal, Row } from '../types/management.types.ts';
import type { AvailabilityQuery, BlockInput, EstablishmentInput, EstablishmentPatch, ListQuery, MemberInput, MemberRole, OrganizationInput, QuoteRequest,
    QuoteResponse, ReservationInput, VenueInput, VenuePatch, VenueQuery } from '../validators/marketplace.schemas.ts';

const fail = (status: number, code: string, message: string): never => { throw new AppError(status, code, message, undefined); };
const required = <T>(value: T | undefined, message = 'Recurso inexistente.'): T => value ?? fail(404, 'NOT_FOUND', message);
const admin = (user?: Principal) => can(user, P.marketplaceAdmin);
export const SIMULATED_PAYMENT_NOTICE = 'Pago simulado: no se cobró dinero real ni se guardaron datos de tarjeta.';
// SIGNAL prefixes raised by the schema's triggers and procedures.
const signals: Record<string, number> = {
    SLOT_CONFLICT: 409, SLOT_BLOCKED: 409, VENUE_NOT_AVAILABLE: 409, VENUE_NOT_FOUND: 404, RESERVATION_NOT_FOUND: 404, HOLD_EXPIRED: 409,
    INVALID_STATUS: 409, INVALID_TRANSITION: 409, IMMUTABLE_RESERVATION: 409, MISSING_OCCUPANCY: 409, INVALID_OCCUPANCY_RANGE: 422,
    OCCUPANCY_IN_USE: 409, IMMUTABLE_OCCUPANCY: 409, ALREADY_PAID: 409,
};
function translate(error: unknown): void {
    if (typeof error !== 'object' || error === null || !('code' in error)) return;
    const { code } = error;
    if (code === 'ER_SIGNAL_EXCEPTION' && 'sqlMessage' in error) {
        const [prefix, ...rest] = String(error.sqlMessage).split(':');
        if (signals[prefix]) fail(signals[prefix], prefix, rest.join(':').trim() || prefix);
    }
    if (code === 'ER_DUP_ENTRY') fail(409, 'DUPLICATE_RESOURCE', 'Ya existe un recurso con esos datos.');
    if (code === 'ER_NO_REFERENCED_ROW_2') fail(422, 'INVALID_REFERENCE', 'Uno de los recursos asociados no existe.');
    if (code === 'ER_ROW_IS_REFERENCED_2') fail(409, 'RESOURCE_IN_USE', 'El recurso tiene relaciones y no puede eliminarse.');
    if (code === 'ER_CHECK_CONSTRAINT_VIOLATED') fail(422, 'VALIDATION_ERROR', 'Los datos incumplen las restricciones del recurso.');
}
const deadlock = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_LOCK_DEADLOCK';
function window(input: { setup_start_at?: Date; event_start_at: Date; event_end_at: Date; teardown_end_at?: Date }) {
    const slot = { setup_start_at: input.setup_start_at ?? input.event_start_at, event_start_at: input.event_start_at,
        event_end_at: input.event_end_at, teardown_end_at: input.teardown_end_at ?? input.event_end_at };
    if (slot.setup_start_at <= new Date()) fail(422, 'INVALID_DATE', 'La franja debe comenzar en el futuro.');
    return slot;
}
function capacity(venue: Row, attendance?: number | null): void {
    const max = Math.max(Number(venue.capacity_standing ?? 0), Number(venue.capacity_seated ?? 0));
    if (attendance && max && attendance > max) fail(422, 'OVER_CAPACITY', `El espacio admite hasta ${max} personas.`);
}

export class MarketplaceService {
    constructor(private readonly db: Database) {}
    private async run<T>(write: boolean, work: (repo: MarketplaceRepository) => Promise<T>): Promise<T> {
        try {
            const execute = (repo: { connection: ConstructorParameters<typeof MarketplaceRepository>[0] }) => work(new MarketplaceRepository(repo.connection));
            return await (write ? this.db.transaction(execute) : this.db.read(execute));
        } catch (error) {
            translate(error);
            throw error;
        }
    }
    // Procedures that START TRANSACTION themselves run on a connection without an outer transaction.
    // Two holds on the same establishment can deadlock on the FK share lock -> establishment lock upgrade; retry.
    private async procedure<T>(work: (repo: MarketplaceRepository) => Promise<T>): Promise<T> {
        for (let attempt = 1; ; attempt++) {
            try { return await this.run(false, work); }
            catch (error) {
                if (!deadlock(error) || attempt >= 5) throw error;
                await new Promise(resolve => setTimeout(resolve, attempt * (5 + Math.random() * 20)));
            }
        }
    }
    // Provider side = the permission for the action AND membership in the organization (OWNER/ADMIN to manage).
    private async provider(repo: MarketplaceRepository, user: Principal, organizationId: string, manage = false, permission: string = P.establishmentsManage): Promise<void> {
        if (admin(user)) return;
        const role = can(user, permission) ? await repo.memberRole(organizationId, user.id) : undefined;
        if (!role || (manage && !['OWNER', 'ADMIN'].includes(role))) fail(403, 'FORBIDDEN', 'No tenés permisos sobre esta organización.');
    }
    private async isProvider(repo: MarketplaceRepository, user: Principal | undefined, organizationId: string, permission: string = P.establishmentsManage): Promise<boolean> {
        return Boolean(user && (admin(user) || (can(user, permission) && await repo.memberRole(organizationId, user.id))));
    }
    private async visibleVenue(repo: MarketplaceRepository, id: string, user?: Principal): Promise<Row> {
        const venue = required(await repo.venue(id), 'Espacio inexistente.');
        if (!(await repo.isPublic(id)) && !(await this.isProvider(repo, user, String(venue.organization_id)))) fail(404, 'NOT_FOUND', 'Espacio inexistente.');
        return venue;
    }

    // ---- Public search ----
    cities() { return this.run(false, repo => repo.cities()); }
    catalogs() { return this.run(false, repo => repo.catalogs()); }
    venues(query: VenueQuery) { return this.run(false, repo => repo.venues(query)); }
    venue(id: string, user?: Principal) { return this.run(false, async repo => repo.venueDetails(await this.visibleVenue(repo, id, user))); }
    availability(id: string, query: AvailabilityQuery, user?: Principal) {
        return this.run(false, async repo => {
            const venue = await this.visibleVenue(repo, id, user);
            const busy = await repo.busy(venue, query.from, query.to, query.mode === 'ESTABLISHMENT');
            return { venue_id: venue.id, from: query.from, to: query.to, mode: query.mode,
                opening_hours: await repo.openingHours(String(venue.id)),
                busy: busy.map(slot => ({ source: slot.source, phase: slot.phase, starts_at: slot.starts_at, ends_at: slot.ends_at,
                    scope: slot.venue_id === venue.id && !Number(slot.is_exclusive) ? 'VENUE' : 'ESTABLISHMENT' })),
                ...(query.exact ? { available: busy.length === 0 } : {}) };
        });
    }

    // ---- Provider: organizations, establishments, venues, blocks ----
    createOrganization(input: OrganizationInput, user: Principal) {
        return this.run(true, async repo => {
            const id = await repo.createOrganization({ ...input, tax_id: input.tax_id?.replaceAll('-', ''), slug: slugify(input.name) }, user.id);
            return { ...await repo.organization(id), member_role: 'OWNER' };
        });
    }
    organizations(user: Principal) { return this.run(false, repo => repo.organizations(user.id)); }

    // ---- Organization members: OWNER/ADMIN manage; only an OWNER (or platform ADMIN) touches OWNER rows ----
    private async ownerActor(repo: MarketplaceRepository, user: Principal, organizationId: string): Promise<void> {
        if (!admin(user) && await repo.memberRole(organizationId, user.id) !== 'OWNER') fail(403, 'FORBIDDEN', 'Solo un OWNER gestiona otros OWNER.');
    }
    members(organizationId: string, user: Principal) {
        return this.run(false, async repo => {
            required(await repo.organization(organizationId), 'Organización inexistente.');
            await this.provider(repo, user, organizationId);
            return repo.members(organizationId);
        });
    }
    addMember(organizationId: string, input: MemberInput, user: Principal) {
        return this.run(true, async repo => {
            if (!await repo.lockOrganization(organizationId)) fail(404, 'NOT_FOUND', 'Organización inexistente.');
            await this.provider(repo, user, organizationId, true);
            if (input.member_role === 'OWNER') await this.ownerActor(repo, user, organizationId);
            const candidate = await repo.memberCandidate(input.email);
            if (!candidate) return fail(422, 'INVALID_MEMBER', 'No hay una cuenta activa registrada con ese email.');
            if (!candidate.provider) fail(422, 'MEMBER_NOT_VENUE', 'La cuenta necesita el perfil VENUE para operar establecimientos.');
            if (await repo.memberRole(organizationId, candidate.id)) fail(409, 'ALREADY_MEMBER', 'La cuenta ya pertenece a la organización.');
            await repo.addMember(organizationId, candidate.id, input.member_role);
            return repo.members(organizationId);
        });
    }
    updateMember(organizationId: string, userId: string, role: MemberRole, user: Principal) {
        return this.run(true, async repo => {
            if (!await repo.lockOrganization(organizationId)) fail(404, 'NOT_FOUND', 'Organización inexistente.');
            await this.provider(repo, user, organizationId, true);
            const current = await repo.memberRole(organizationId, userId) ?? fail(404, 'NOT_FOUND', 'La cuenta no pertenece a la organización.');
            if (current === 'OWNER' || role === 'OWNER') await this.ownerActor(repo, user, organizationId);
            if (current === 'OWNER' && role !== 'OWNER' && await repo.owners(organizationId) === 1) fail(409, 'LAST_OWNER', 'La organización necesita al menos un OWNER.');
            await repo.setMemberRole(organizationId, userId, role);
            return repo.members(organizationId);
        });
    }
    removeMember(organizationId: string, userId: string, user: Principal) {
        return this.run(true, async repo => {
            if (!await repo.lockOrganization(organizationId)) fail(404, 'NOT_FOUND', 'Organización inexistente.');
            // Any member may leave; removing someone else requires OWNER/ADMIN.
            if (userId === user.id) await this.provider(repo, user, organizationId);
            else await this.provider(repo, user, organizationId, true);
            const current = await repo.memberRole(organizationId, userId) ?? fail(404, 'NOT_FOUND', 'La cuenta no pertenece a la organización.');
            if (current === 'OWNER' && userId !== user.id) await this.ownerActor(repo, user, organizationId);
            if (current === 'OWNER' && await repo.owners(organizationId) === 1) fail(409, 'LAST_OWNER', 'La organización necesita al menos un OWNER.');
            await repo.removeMember(organizationId, userId);
        });
    }
    establishments(user: Principal) { return this.run(false, repo => repo.establishments(user.id, admin(user))); }
    createEstablishment(input: EstablishmentInput, user: Principal) {
        return this.run(true, async repo => {
            required(await repo.organization(input.organization_id), 'Organización inexistente.');
            await this.provider(repo, user, input.organization_id, true);
            if (!(await repo.marketplaceCity(input.city_id))) fail(422, 'CITY_NOT_IN_MARKETPLACE', 'La ciudad no está habilitada en el marketplace.');
            const id = await repo.createEstablishment({ ...input, slug: slugify(input.name) });
            return repo.establishment(id);
        });
    }
    updateEstablishment(id: string, input: EstablishmentPatch, user: Principal) {
        return this.run(true, async repo => {
            const establishment = required(await repo.establishment(id, true));
            await this.provider(repo, user, String(establishment.organization_id), true);
            if (input.city_id && !(await repo.marketplaceCity(input.city_id))) fail(422, 'CITY_NOT_IN_MARKETPLACE', 'La ciudad no está habilitada en el marketplace.');
            await repo.updateEstablishment(id, input);
            return repo.establishment(id);
        });
    }
    establishmentStatus(id: string, status: 'PUBLISHED' | 'ARCHIVED', user: Principal) {
        return this.run(true, async repo => {
            const establishment = required(await repo.establishment(id, true));
            await this.provider(repo, user, String(establishment.organization_id), true);
            await repo.updateEstablishment(id, { status, published_at: status === 'PUBLISHED' ? (establishment.published_at as Date | null) ?? new Date() : undefined });
            return repo.establishment(id);
        });
    }
    establishmentVenues(establishmentId: string, user: Principal) {
        return this.run(false, async repo => {
            const establishment = required(await repo.establishment(establishmentId));
            await this.provider(repo, user, String(establishment.organization_id));
            return repo.establishmentVenues(establishmentId);
        });
    }
    private async venueChildren(repo: MarketplaceRepository, venueId: string, input: VenuePatch): Promise<void> {
        if (input.amenities && await repo.replaceAmenities(venueId, input.amenities) !== input.amenities.length)
            fail(422, 'UNKNOWN_AMENITY', 'Alguna comodidad no existe en el catálogo.');
        if (input.photos) await repo.replacePhotos(venueId, input.photos);
        if (input.opening_hours) await repo.replaceHours(venueId, input.opening_hours);
    }
    private async venueFields(repo: MarketplaceRepository, input: VenuePatch) {
        const { venue_type_code, amenities: _a, photos: _p, opening_hours: _h, ...fields } = input;
        const venue_type_id = venue_type_code ? await repo.venueType(venue_type_code) ?? fail(422, 'UNKNOWN_VENUE_TYPE', 'Tipo de espacio inexistente.') : undefined;
        return { ...fields, venue_type_id };
    }
    createVenue(establishmentId: string, input: VenueInput, user: Principal) {
        return this.run(true, async repo => {
            const establishment = required(await repo.establishment(establishmentId, true));
            await this.provider(repo, user, String(establishment.organization_id), true);
            const id = await repo.createVenue({ ...await this.venueFields(repo, input), establishment_id: establishmentId, slug: slugify(input.name) });
            await this.venueChildren(repo, id, input);
            return repo.venueDetails(required(await repo.venue(id)));
        });
    }
    updateVenue(id: string, input: VenuePatch, user: Principal) {
        return this.run(true, async repo => {
            const venue = required(await repo.venue(id, true));
            await this.provider(repo, user, String(venue.organization_id), true);
            await repo.updateVenue(id, await this.venueFields(repo, input));
            await this.venueChildren(repo, id, input);
            return repo.venueDetails(required(await repo.venue(id)));
        });
    }
    venueStatus(id: string, status: 'PUBLISHED' | 'ARCHIVED', user: Principal) {
        return this.run(true, async repo => {
            const venue = required(await repo.venue(id, true));
            await this.provider(repo, user, String(venue.organization_id), true);
            await repo.updateVenue(id, { status, published_at: status === 'PUBLISHED' ? (venue.published_at as Date | null) ?? new Date() : undefined });
            return repo.venueDetails(required(await repo.venue(id)));
        });
    }
    blocks(establishmentId: string, user: Principal) {
        return this.run(false, async repo => {
            const establishment = required(await repo.establishment(establishmentId));
            await this.provider(repo, user, String(establishment.organization_id));
            return repo.blocks(establishmentId);
        });
    }
    createBlock(establishmentId: string, input: BlockInput, user: Principal) {
        return this.run(true, async repo => {
            const establishment = required(await repo.establishment(establishmentId));
            await this.provider(repo, user, String(establishment.organization_id), true);
            // trg_venue_blocks_bi rejects blocks over active reservations (SLOT_CONFLICT).
            const id = await repo.createBlock({ ...input, establishment_id: establishmentId, created_by_user_id: user.id });
            return repo.block(id);
        });
    }
    removeBlock(id: string, user: Principal) {
        return this.run(true, async repo => {
            const block = required(await repo.block(id));
            const establishment = required(await repo.establishment(String(block.establishment_id)));
            await this.provider(repo, user, String(establishment.organization_id), true);
            await repo.removeBlock(id);
        });
    }

    // ---- Quotes ----
    private async quoteAccess(repo: MarketplaceRepository, id: string, user: Principal): Promise<{ quote: Row; provider: boolean }> {
        const quote = required(await repo.quote(id), 'Presupuesto inexistente.');
        const provider = await this.isProvider(repo, user, String(quote.organization_id), P.quotesRespond);
        if (quote.requester_user_id !== user.id && !provider) fail(404, 'NOT_FOUND', 'Presupuesto inexistente.');
        return { quote, provider };
    }
    private async quoteDetails(repo: MarketplaceRepository, id: string) {
        return { ...required(await repo.quote(id)), items: await repo.quoteItems(id) };
    }
    requestQuote(input: QuoteRequest, user: Principal) {
        const slot = window(input);
        return this.run(true, async repo => {
            const venue = await this.visibleVenue(repo, input.venue_id);
            capacity(venue, input.expected_attendance);
            const id = await repo.createQuote({ venue_id: input.venue_id, requester_user_id: user.id, occupancy_mode_code: input.occupancy_mode,
                event_name: input.event_name, event_description: input.event_description, expected_attendance: input.expected_attendance,
                ...slot, requester_notes: input.requester_notes, currency: String(venue.currency), status: 'REQUESTED' });
            await repo.notifyProviders(input.venue_id, 'QUOTE_UPDATE', { quote_id: id }, 'Nuevo pedido de presupuesto', `${input.event_name} en ${String(venue.name)}.`);
            return this.quoteDetails(repo, id);
        });
    }
    quote(id: string, user: Principal) {
        return this.run(false, async repo => { await this.quoteAccess(repo, id, user); return this.quoteDetails(repo, id); });
    }
    quotes(user: Principal, query: ListQuery) {
        if (query.as === 'provider' && !can(user, P.quotesRespond, P.marketplaceAdmin)) fail(403, 'FORBIDDEN', 'Permisos insuficientes.');
        return this.run(false, repo => repo.quotes(user.id, query, admin(user)));
    }
    respondQuote(id: string, input: QuoteResponse, user: Principal) {
        return this.run(true, async repo => {
            const locked = required(await repo.lockQuote(id), 'Presupuesto inexistente.');
            const { quote, provider } = await this.quoteAccess(repo, id, user);
            if (!provider) fail(403, 'FORBIDDEN', 'Solo el proveedor responde presupuestos.');
            if (!['REQUESTED', 'SENT'].includes(String(locked.status))) fail(409, 'INVALID_STATE', 'El presupuesto ya no admite respuesta.');
            if (input.valid_until <= new Date() || input.valid_until > (quote.setup_start_at as Date))
                fail(422, 'INVALID_DATE', 'La validez debe vencer en el futuro y antes del armado.');
            const items = input.items.map(item => {
                const product = cents(item.quantity) * cents(item.unit_price);
                return { ...item, line: (product + 50n) / 100n };
            });
            const subtotal = items.reduce((sum, item) => sum + item.line, 0n);
            const total = subtotal + cents(input.fees) - cents(input.discount);
            if (total < 0n) fail(422, 'INVALID_TOTAL', 'El descuento supera el subtotal.');
            if (total > MAX_AMOUNT || items.some(item => item.line > MAX_AMOUNT)) fail(422, 'INVALID_TOTAL', 'Importe demasiado alto.');
            await repo.replaceQuoteItems(id, items.map(({ line, ...item }) => ({ ...item, line_total: decimal(line) })));
            await repo.updateQuote(id, { status: 'SENT', subtotal: decimal(subtotal), fees: input.fees, discount: input.discount, total_amount: decimal(total),
                valid_until: input.valid_until, provider_notes: input.provider_notes, responded_by_user_id: user.id, responded_at: new Date() });
            await new NotificationsRepository(repo.connection).marketplace(String(quote.requester_user_id), 'QUOTE_UPDATE', { quote_id: id },
                'Presupuesto recibido', `${String(quote.event_name)}: total ${decimal(total)} ${String(quote.currency)}.`);
            return this.quoteDetails(repo, id);
        });
    }
    closeQuote(id: string, action: 'reject' | 'cancel', notes: string | null | undefined, user: Principal) {
        return this.run(true, async repo => {
            const locked = required(await repo.lockQuote(id), 'Presupuesto inexistente.');
            const { quote, provider } = await this.quoteAccess(repo, id, user);
            if (action === 'reject' ? !provider : quote.requester_user_id !== user.id)
                fail(403, 'FORBIDDEN', action === 'reject' ? 'Solo el proveedor rechaza presupuestos.' : 'Solo quien lo pidió cancela el presupuesto.');
            if (!['REQUESTED', 'SENT'].includes(String(locked.status))) fail(409, 'INVALID_STATE', 'El presupuesto ya está cerrado.');
            if (action === 'reject') {
                await repo.updateQuote(id, { status: 'REJECTED', provider_notes: notes, responded_by_user_id: user.id, responded_at: new Date() });
                await new NotificationsRepository(repo.connection).marketplace(String(quote.requester_user_id), 'QUOTE_UPDATE', { quote_id: id },
                    'Presupuesto rechazado', `${String(quote.event_name)}: el proveedor no puede atender el pedido.`);
            } else {
                await repo.updateQuote(id, { status: 'CANCELLED' });
                await repo.notifyProviders(String(quote.venue_id), 'QUOTE_UPDATE', { quote_id: id }, 'Pedido cancelado', `${String(quote.event_name)} fue cancelado por el cliente.`);
            }
            return this.quoteDetails(repo, id);
        });
    }
    async acceptQuote(id: string, user: Principal) {
        const quote = await this.run(false, async repo => (await this.quoteAccess(repo, id, user)).quote);
        if (quote.requester_user_id !== user.id) fail(403, 'FORBIDDEN', 'Solo quien pidió el presupuesto puede aceptarlo.');
        if (quote.status === 'EXPIRED') {
            await this.run(true, async repo => { if ((await repo.lockQuote(id))?.status === 'SENT') await repo.updateQuote(id, { status: 'EXPIRED' }); });
            fail(409, 'QUOTE_EXPIRED', 'El presupuesto venció.');
        }
        if (quote.status !== 'SENT') fail(409, 'INVALID_STATE', 'Solo se acepta un presupuesto enviado.');
        if ((quote.setup_start_at as Date) <= new Date()) fail(409, 'INVALID_DATE', 'La franja del presupuesto ya comenzó.');
        // The procedure commits the HOLD first; if the quote changed meanwhile the hold is released in the same step that checks it.
        const reservationId = await this.procedure(repo => repo.createHold({ venue_id: String(quote.venue_id), user_id: user.id, quote_id: id,
            mode: String(quote.occupancy_mode), event_name: String(quote.event_name), expected_attendance: quote.expected_attendance as number | null,
            setup_start_at: quote.setup_start_at as Date, event_start_at: quote.event_start_at as Date, event_end_at: quote.event_end_at as Date,
            teardown_end_at: quote.teardown_end_at as Date, total: String(quote.total_amount) }));
        const outcome = await this.run(true, async repo => {
            const locked = required(await repo.lockQuote(id));
            await repo.lockReservation(reservationId);
            if (locked.status !== 'SENT' || (locked.valid_until as Date) <= new Date()) {
                await repo.setReservationStatus(reservationId, user.id, 'CANCELLED', 'El presupuesto dejó de estar disponible.');
                return { error: true as const };
            }
            await repo.updateQuote(id, { status: 'ACCEPTED', accepted_at: new Date() });
            await repo.notifyProviders(String(quote.venue_id), 'QUOTE_UPDATE', { quote_id: id, reservation_id: reservationId },
                'Presupuesto aceptado', `${String(quote.event_name)}: reserva temporal creada, pendiente de pago.`);
            return { quote: await this.quoteDetails(repo, id), reservation: await repo.reservationDetails(required(await repo.reservation(reservationId))) };
        });
        if ('error' in outcome) fail(409, 'QUOTE_UNAVAILABLE', 'El presupuesto cambió mientras se aceptaba.');
        return outcome;
    }

    // ---- Reservations ----
    private async reservationAccess(repo: MarketplaceRepository, id: string, user: Principal): Promise<{ reservation: Row; provider: boolean }> {
        const reservation = required(await repo.reservation(id), 'Reserva inexistente.');
        const provider = await this.isProvider(repo, user, String(reservation.organization_id), P.reservationsManage);
        if (reservation.user_id !== user.id && !provider) fail(404, 'NOT_FOUND', 'Reserva inexistente.');
        return { reservation, provider };
    }
    async createReservation(input: ReservationInput, user: Principal) {
        const slot = window(input);
        // Direct booking uses the list price; booking a whole establishment is negotiated through a quote.
        if (input.occupancy_mode !== 'VENUE') fail(422, 'QUOTE_REQUIRED', 'Reservar el establecimiento completo requiere un presupuesto.');
        const venue = await this.run(false, repo => this.visibleVenue(repo, input.venue_id));
        capacity(venue, input.expected_attendance);
        const minutes = (slot.teardown_end_at.getTime() - slot.setup_start_at.getTime()) / 60000;
        if (minutes < Number(venue.min_booking_minutes)) fail(422, 'BELOW_MIN_BOOKING', `La reserva mínima es de ${String(venue.min_booking_minutes)} minutos.`);
        const total = (cents(String(venue.price_per_hour)) * BigInt(minutes) + 30n) / 60n;
        if (total > MAX_AMOUNT) fail(422, 'INVALID_TOTAL', 'Importe demasiado alto.');
        const id = await this.procedure(repo => repo.createHold({ venue_id: input.venue_id, user_id: user.id, quote_id: null, mode: input.occupancy_mode,
            event_name: input.event_name, expected_attendance: input.expected_attendance ?? null, ...slot, total: decimal(total) }));
        return this.run(true, async repo => {
            if (input.notes) await repo.setNotes(id, input.notes);
            await repo.notifyProviders(input.venue_id, 'RESERVATION_UPDATE', { reservation_id: id }, 'Nueva solicitud de reserva',
                `${input.event_name} en ${String(venue.name)}: pendiente de pago y de tu aceptación.`);
            return repo.reservationDetails(required(await repo.reservation(id)));
        });
    }
    reservation(id: string, user: Principal) {
        return this.run(false, async repo => repo.reservationDetails((await this.reservationAccess(repo, id, user)).reservation));
    }
    reservations(user: Principal, query: ListQuery) {
        if (query.as === 'provider' && !can(user, P.reservationsManage, P.marketplaceAdmin)) fail(403, 'FORBIDDEN', 'Permisos insuficientes.');
        return this.run(false, repo => repo.reservations(user.id, query, admin(user)));
    }
    async cancelReservation(id: string, reason: string | null | undefined, user: Principal) {
        const outcome = await this.run(true, async repo => {
            const locked = required(await repo.lockReservation(id), 'Reserva inexistente.');
            const { reservation, provider } = await this.reservationAccess(repo, id, user);
            if (locked.status === 'EXPIRED' && locked.status_code === 'HOLD') {
                await repo.setReservationStatus(id, user.id, 'EXPIRED');
                await repo.refundPayments(id);
                return { expired: true as const };
            }
            if (!['HOLD', 'CONFIRMED'].includes(String(locked.status_code))) fail(409, 'INVALID_STATE', 'La reserva ya está cerrada.');
            // Once confirmed, the booking belongs to the client: the venue cannot back out (marketplace.admin still can, as moderation).
            if (locked.status_code === 'CONFIRMED' && reservation.user_id !== user.id && !admin(user))
                fail(409, 'RESERVATION_CONFIRMED', 'El espacio no puede cancelar una reserva confirmada.');
            if (locked.status_code === 'CONFIRMED' && (locked.event_start_at as Date) <= new Date()) fail(409, 'CANCELLATION_CLOSED', 'El evento ya comenzó.');
            await repo.setReservationStatus(id, user.id, 'CANCELLED', reason);
            const refunded = await repo.refundPayments(id);
            const note = refunded ? ' El pago simulado se marcó como reembolsado.' : '';
            if (reservation.user_id === user.id) await repo.notifyProviders(String(reservation.venue_id), 'RESERVATION_UPDATE', { reservation_id: id },
                'Reserva cancelada', `${String(reservation.event_name)} fue cancelada por el cliente.${note}`);
            else if (provider) await new NotificationsRepository(repo.connection).marketplace(String(reservation.user_id), 'RESERVATION_UPDATE', { reservation_id: id },
                'Reserva cancelada', `${String(reservation.event_name)} fue cancelada por el espacio.${note}`);
            return { expired: false as const, data: await repo.reservationDetails(required(await repo.reservation(id))) };
        });
        if (outcome.expired) fail(409, 'RESERVATION_EXPIRED', 'La reserva temporal venció.');
        return outcome.data;
    }
    // The venue answers a direct booking (no quote). Accepting needs the simulated payment first: the payment
    // confirms the purchase and the venue's acceptance confirms the reservation. Rejecting cancels and refunds.
    async acceptReservation(id: string, user: Principal) {
        const outcome = await this.run(true, async repo => {
            const locked = required(await repo.lockReservation(id), 'Reserva inexistente.');
            const { reservation, provider } = await this.reservationAccess(repo, id, user);
            if (!provider) fail(403, 'FORBIDDEN', 'Solo el espacio acepta la reserva.');
            if (locked.status === 'EXPIRED' && locked.status_code === 'HOLD') {
                await repo.setReservationStatus(id, user.id, 'EXPIRED');
                await repo.refundPayments(id);
                return { expired: true as const };
            }
            if (locked.status_code !== 'HOLD') fail(409, 'INVALID_STATE', 'Solo se acepta una reserva pendiente.');
            if (locked.quote_id) fail(409, 'QUOTE_RESERVATION', 'Las reservas con presupuesto aceptado se confirman con el pago.');
            if (!await repo.approvedPayments(id)) fail(409, 'PAYMENT_REQUIRED', 'La reserva todavía no tiene el pago simulado aprobado.');
            await repo.confirmReservation(id, user.id);
            await new NotificationsRepository(repo.connection).marketplace(String(reservation.user_id), 'RESERVATION_UPDATE', { reservation_id: id },
                'Reserva confirmada', `${String(reservation.event_name)}: el espacio aceptó tu reserva.`);
            return { expired: false as const, data: await repo.reservationDetails(required(await repo.reservation(id))) };
        });
        if (outcome.expired) fail(409, 'RESERVATION_EXPIRED', 'La reserva temporal venció.');
        return outcome.data;
    }
    async rejectReservation(id: string, reason: string, user: Principal) {
        await this.run(false, async repo => {
            const { reservation, provider } = await this.reservationAccess(repo, id, user);
            if (!provider) fail(403, 'FORBIDDEN', 'Solo el espacio rechaza la reserva.');
            if (reservation.status !== 'HOLD') fail(409, 'INVALID_STATE', 'Solo se rechaza una reserva pendiente.');
        });
        return this.cancelReservation(id, reason, user);
    }
    async pay(id: string, outcome: 'APPROVED' | 'REJECTED', user: Principal) {
        const reservation = await this.run(false, async repo => (await this.reservationAccess(repo, id, user)).reservation);
        if (reservation.user_id !== user.id) fail(403, 'FORBIDDEN', 'Solo quien reservó puede pagar.');
        if (reservation.status === 'EXPIRED') {
            await this.run(true, async repo => {
                const locked = await repo.lockReservation(id);
                if (locked?.status_code === 'HOLD' && locked.status === 'EXPIRED') {
                    await repo.setReservationStatus(id, user.id, 'EXPIRED');
                    await repo.refundPayments(id);
                }
            });
            fail(409, 'HOLD_EXPIRED', 'La reserva temporal venció y no puede pagarse.');
        }
        if (reservation.status !== 'HOLD') fail(409, 'INVALID_STATUS', 'Solo se paga una reserva temporal (HOLD).');
        // sp_simulate_payment locks the reservation and records the payment. With an accepted quote it also confirms the
        // reservation; a direct booking stays in HOLD (extended up to 48 h) until the venue accepts it.
        const paymentId = await this.procedure(repo => repo.simulatePayment(id, user.id, outcome === 'APPROVED'));
        return this.run(true, async repo => {
            if (outcome === 'APPROVED') await repo.notifyProviders(String(reservation.venue_id), 'RESERVATION_UPDATE', { reservation_id: id },
                reservation.quote_id ? 'Reserva confirmada' : 'Reserva pagada: falta tu aceptación',
                reservation.quote_id ? `${String(reservation.event_name)}: pago simulado aprobado.`
                    : `${String(reservation.event_name)}: pago simulado aprobado. Aceptala o rechazala antes de que venza.`);
            return { simulated: true, notice: SIMULATED_PAYMENT_NOTICE, payment: await repo.payment(paymentId),
                reservation: await repo.reservationDetails(required(await repo.reservation(id))) };
        });
    }
}
