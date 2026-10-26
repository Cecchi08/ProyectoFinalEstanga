import { AppError } from '../utils/app-error.util.js';
import { PERMISSIONS as P, can } from '../utils/access.util.js';
import { MAX_AMOUNT, decimal, quoteTotals } from '../utils/money.util.ts';
import { ServicesRepository } from '../repositories/services.repository.ts';
import { slugify } from '../repositories/management.repository.ts';
import { audit } from '../repositories/audit.repository.ts';
import { assertConcertOwner } from './permissions.service.js';
import type { Database, Principal, Row } from '../types/management.types.ts';
import type { OfferingInput, OfferingPatch, OfferingQuery, ProviderInput, ProviderPatch, ProviderQuery, ServiceQuoteList, ServiceQuoteRequest,
    ServiceQuoteResponse } from '../validators/services.schemas.ts';

const fail = (status: number, code: string, message: string): never => { throw new AppError(status, code, message, undefined); };
const required = <T>(value: T | undefined, message = 'Recurso inexistente.'): T => value ?? fail(404, 'NOT_FOUND', message);
const admin = (user?: Principal) => can(user, P.servicesAdmin);
function translate(error: unknown): void {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 'ER_DUP_ENTRY') fail(409, 'DUPLICATE_RESOURCE', 'Ya existe un recurso con esos datos.');
    if (code === 'ER_NO_REFERENCED_ROW_2') fail(422, 'INVALID_REFERENCE', 'Uno de los recursos asociados no existe.');
    if (code === 'ER_CHECK_CONSTRAINT_VIOLATED') fail(422, 'VALIDATION_ERROR', 'Los datos incumplen las restricciones del recurso.');
}

// EMPRESA_SERVICIOS: a company is an organization with a service_providers profile. Members (organization_members) operate it:
// any member with the permission reads and answers quotes; OWNER/ADMIN edit the company and its catalog. services.admin overrides.
// Requesters (ORGANIZADOR, VENUE) ask for quotes; only the requester accepts a SENT quote, which is what makes a service contracted.
export class ServicesService {
    constructor(private readonly db: Database) {}
    private async run<T>(write: boolean, work: (repo: ServicesRepository) => Promise<T>): Promise<T> {
        try {
            const execute = (repo: { connection: ConstructorParameters<typeof ServicesRepository>[0] }) => work(new ServicesRepository(repo.connection));
            return await (write ? this.db.transaction(execute) : this.db.read(execute));
        } catch (error) {
            translate(error);
            throw error;
        }
    }
    private async member(repo: ServicesRepository, user: Principal | undefined, providerId: string, permission: string, manage = false): Promise<boolean> {
        if (!user) return false;
        if (admin(user)) return true;
        const role = can(user, permission) ? await repo.memberRole(providerId, user.id) : undefined;
        return Boolean(role && (!manage || ['OWNER', 'ADMIN'].includes(role)));
    }
    private async operator(repo: ServicesRepository, user: Principal, providerId: string, manage = false, permission: string = P.servicesManage): Promise<void> {
        if (!await this.member(repo, user, providerId, permission, manage)) fail(403, 'FORBIDDEN', 'No tenés permisos sobre esta empresa.');
    }
    private async visibleProvider(repo: ServicesRepository, id: string, user?: Principal) {
        const provider = required(await repo.provider(id), 'Empresa inexistente.');
        const insider = await this.member(repo, user, id, P.servicesManage) || await this.member(repo, user, id, P.serviceQuotesRespond);
        if (!insider && !await repo.isPublicProvider(id)) fail(404, 'NOT_FOUND', 'Empresa inexistente.');
        return { provider, insider };
    }
    private async city(repo: ServicesRepository, id: string | null | undefined): Promise<void> {
        if (id && !await repo.cityExists(id)) fail(422, 'INVALID_REFERENCE', 'Ciudad inexistente.');
    }

    // ---- Public catalog ----
    categories() { return this.run(false, repo => repo.categories()); }
    providers(query: ProviderQuery) { return this.run(false, repo => repo.providers(query)); }
    offerings(query: OfferingQuery) { return this.run(false, repo => repo.offerings(query)); }
    provider(id: string, user?: Principal) {
        return this.run(false, async repo => {
            const { provider, insider } = await this.visibleProvider(repo, id, user);
            return { ...provider, offerings: await repo.providerOfferings(id, insider) };
        });
    }
    async offering(id: string, user?: Principal) {
        return this.run(false, async repo => {
            const offering = required(await repo.offering(id), 'Servicio inexistente.');
            const { insider } = await this.visibleProvider(repo, String(offering.provider_id), user);
            if (offering.status !== 'PUBLISHED' && !insider) fail(404, 'NOT_FOUND', 'Servicio inexistente.');
            return offering;
        });
    }

    // ---- Company (services.manage) ----
    mine(user: Principal) { return this.run(false, repo => repo.mine(user.id)); }
    createProvider(input: ProviderInput, user: Principal) {
        return this.run(true, async repo => {
            const { description, city_id, coverage_area, ...organization } = input;
            await this.city(repo, city_id);
            const id = await repo.createProvider({ ...organization, tax_id: organization.tax_id?.replaceAll('-', ''), slug: slugify(organization.name) },
                { description, city_id, coverage_area }, user.id);
            return { ...await repo.provider(id), member_role: 'OWNER', offerings: [] };
        });
    }
    updateProvider(id: string, input: ProviderPatch, user: Principal) {
        return this.run(true, async repo => {
            required(await repo.lockProvider(id), 'Empresa inexistente.');
            await this.operator(repo, user, id, true);
            const { description, city_id, coverage_area, ...organization } = input;
            await this.city(repo, city_id);
            await repo.updateOrganization(id, { ...organization, tax_id: organization.tax_id === undefined ? undefined : organization.tax_id?.replaceAll('-', '') ?? null });
            await repo.updateProvider(id, { description, city_id, coverage_area });
            return { ...await repo.provider(id), offerings: await repo.providerOfferings(id, true) };
        });
    }
    providerStatus(id: string, status: 'PUBLISHED' | 'ARCHIVED', user: Principal) {
        return this.run(true, async repo => {
            const provider = required(await repo.lockProvider(id), 'Empresa inexistente.');
            await this.operator(repo, user, id, true);
            await repo.updateProvider(id, { status, published_at: status === 'PUBLISHED' ? (provider.published_at as Date | null) ?? new Date() : undefined });
            return { ...await repo.provider(id), offerings: await repo.providerOfferings(id, true) };
        });
    }
    // Only Venti verifies a company; the change is audited.
    verify(id: string, verified: boolean, user: Principal) {
        return this.run(true, async repo => {
            const provider = required(await repo.lockProvider(id), 'Empresa inexistente.');
            if (Boolean(Number(provider.is_verified)) !== verified) {
                await repo.updateProvider(id, verified ? { is_verified: 1, verified_at: new Date(), verified_by_user_id: user.id }
                    : { is_verified: 0, verified_at: null, verified_by_user_id: null });
                await audit(repo.connection, { actor: user.id, action: verified ? 'SERVICE_PROVIDER_VERIFIED' : 'SERVICE_PROVIDER_UNVERIFIED',
                    entity: { type: 'SERVICE_PROVIDER', id }, details: { provider_id: id } });
            }
            return repo.provider(id);
        });
    }

    // ---- Catalog of a company ----
    createOffering(providerId: string, input: OfferingInput, user: Principal) {
        return this.run(true, async repo => {
            required(await repo.lockProvider(providerId), 'Empresa inexistente.');
            await this.operator(repo, user, providerId, true);
            const { category_code, ...fields } = input;
            const category_id = await repo.category(category_code) ?? fail(422, 'UNKNOWN_CATEGORY', 'Categoría inexistente.');
            const id = await repo.createOffering({ ...fields, base_price: fields.base_price ?? null, category_id, organization_id: providerId,
                slug: slugify(fields.name), status: 'DRAFT' });
            return repo.offering(id);
        });
    }
    updateOffering(id: string, input: OfferingPatch, user: Principal) {
        return this.run(true, async repo => {
            const offering = required(await repo.offering(id, true), 'Servicio inexistente.');
            await this.operator(repo, user, String(offering.provider_id), true);
            const { category_code, ...fields } = input;
            const category_id = category_code ? await repo.category(category_code) ?? fail(422, 'UNKNOWN_CATEGORY', 'Categoría inexistente.') : undefined;
            const unit = fields.pricing_unit ?? String(offering.pricing_unit);
            const price = fields.base_price === undefined ? offering.base_price : fields.base_price;
            if (unit !== 'QUOTE' && price === null) fail(422, 'PRICE_REQUIRED', 'Indicar base_price o usar pricing_unit QUOTE.');
            await repo.updateOffering(id, { ...fields, category_id });
            return repo.offering(id);
        });
    }
    offeringStatus(id: string, status: 'PUBLISHED' | 'ARCHIVED', user: Principal) {
        return this.run(true, async repo => {
            const offering = required(await repo.offering(id, true), 'Servicio inexistente.');
            await this.operator(repo, user, String(offering.provider_id), true);
            await repo.updateOffering(id, { status, published_at: status === 'PUBLISHED' ? (offering.published_at as Date | null) ?? new Date() : undefined });
            return repo.offering(id);
        });
    }

    // ---- Quotes ----
    private async quoteAccess(repo: ServicesRepository, id: string, user: Principal): Promise<{ quote: Row; provider: boolean }> {
        const quote = required(await repo.quote(id), 'Cotización inexistente.');
        const provider = await this.member(repo, user, String(quote.provider_id), P.serviceQuotesRespond);
        if (quote.requester_user_id !== user.id && !provider) fail(404, 'NOT_FOUND', 'Cotización inexistente.');
        return { quote, provider };
    }
    private async quoteDetails(repo: ServicesRepository, id: string) {
        return { ...required(await repo.quote(id)), items: await repo.quoteItems(id) };
    }
    requestQuote(input: ServiceQuoteRequest, user: Principal) {
        if (input.event_start_at <= new Date()) fail(422, 'INVALID_DATE', 'El servicio debe empezar en el futuro.');
        return this.run(true, async repo => {
            const offering = required(await repo.offering(input.offering_id), 'Servicio inexistente.');
            const providerId = String(offering.provider_id);
            if (offering.status !== 'PUBLISHED' || !await repo.isPublicProvider(providerId)) fail(404, 'NOT_FOUND', 'Servicio inexistente.');
            if (await repo.memberRole(providerId, user.id)) fail(422, 'OWN_PROVIDER', 'No podés pedir una cotización a tu propia empresa.');
            // The service is linked only to an event the requester runs: their concert, or a reservation they made or host.
            if (input.concert_id) assertConcertOwner(user, required(await repo.concertOwner(input.concert_id), 'Concierto inexistente.'));
            if (input.reservation_id) {
                const parties = required(await repo.reservationParties(input.reservation_id), 'Reserva inexistente.');
                if (parties.user_id !== user.id && !await repo.memberRole(parties.organization_id, user.id))
                    fail(403, 'FORBIDDEN', 'La reserva no es tuya ni de tu espacio.');
            }
            const id = await repo.createQuote({ offering_id: input.offering_id, organization_id: providerId, requester_user_id: user.id,
                concert_id: input.concert_id ?? null, reservation_id: input.reservation_id ?? null, event_name: input.event_name,
                event_start_at: input.event_start_at, event_end_at: input.event_end_at, location_text: input.location_text,
                requester_notes: input.requester_notes, currency: String(offering.currency), status: 'REQUESTED' });
            await repo.notifyProvider(providerId, id, 'Nueva solicitud de cotización', `${input.event_name}: ${String(offering.name)}.`);
            return this.quoteDetails(repo, id);
        });
    }
    quotes(user: Principal, query: ServiceQuoteList) {
        if (query.as === 'provider' && !can(user, P.serviceQuotesRespond, P.servicesAdmin)) fail(403, 'FORBIDDEN', 'Permisos insuficientes.');
        if (query.as === 'requester' && !can(user, P.serviceQuotesRequest, P.servicesAdmin)) fail(403, 'FORBIDDEN', 'Permisos insuficientes.');
        return this.run(false, repo => repo.quotes(user.id, query, admin(user)));
    }
    quote(id: string, user: Principal) {
        return this.run(false, async repo => { await this.quoteAccess(repo, id, user); return this.quoteDetails(repo, id); });
    }
    respondQuote(id: string, input: ServiceQuoteResponse, user: Principal) {
        return this.run(true, async repo => {
            const locked = required(await repo.lockQuote(id), 'Cotización inexistente.');
            const { quote, provider } = await this.quoteAccess(repo, id, user);
            if (!provider) fail(403, 'FORBIDDEN', 'Solo la empresa responde la cotización.');
            if (!['REQUESTED', 'SENT'].includes(String(locked.status))) fail(409, 'INVALID_STATE', 'La cotización ya no admite respuesta.');
            if (input.valid_until <= new Date() || input.valid_until > (locked.event_start_at as Date))
                fail(422, 'INVALID_DATE', 'La validez debe vencer en el futuro y antes del servicio.');
            const { lines, subtotal, total } = quoteTotals(input.items, input.fees, input.discount);
            if (total < 0n) fail(422, 'INVALID_TOTAL', 'El descuento supera el subtotal.');
            if (total > MAX_AMOUNT || lines.some(item => item.line > MAX_AMOUNT)) fail(422, 'INVALID_TOTAL', 'Importe demasiado alto.');
            await repo.replaceQuoteItems(id, lines.map(({ line, ...item }) => ({ ...item, line_total: decimal(line) })));
            await repo.updateQuote(id, { status: 'SENT', subtotal: decimal(subtotal), fees: input.fees, discount: input.discount, total_amount: decimal(total),
                valid_until: input.valid_until, provider_notes: input.provider_notes, responded_by_user_id: user.id, responded_at: new Date() });
            await repo.notifyUser(String(quote.requester_user_id), id, 'Cotización recibida',
                `${String(quote.event_name)} (${String(quote.offering_name)}): total ${decimal(total)} ${String(quote.currency)}.`);
            return this.quoteDetails(repo, id);
        });
    }
    // reject: the company declines. cancel: the requester withdraws, also after accepting while the service has not started.
    closeQuote(id: string, action: 'reject' | 'cancel', notes: string | null | undefined, user: Principal) {
        return this.run(true, async repo => {
            const locked = required(await repo.lockQuote(id), 'Cotización inexistente.');
            const { quote, provider } = await this.quoteAccess(repo, id, user);
            if (action === 'reject' ? !provider : quote.requester_user_id !== user.id)
                fail(403, 'FORBIDDEN', action === 'reject' ? 'Solo la empresa rechaza la cotización.' : 'Solo quien la pidió la cancela.');
            const open = ['REQUESTED', 'SENT'].includes(String(locked.status));
            const contracted = action === 'cancel' && locked.status === 'ACCEPTED' && (locked.event_start_at as Date) > new Date();
            if (!open && !contracted) fail(409, 'INVALID_STATE', 'La cotización ya está cerrada.');
            if (action === 'reject') {
                await repo.updateQuote(id, { status: 'REJECTED', provider_notes: notes, responded_by_user_id: user.id, responded_at: new Date() });
                await repo.notifyUser(String(quote.requester_user_id), id, 'Cotización rechazada', `${String(quote.event_name)}: la empresa no puede prestar el servicio.`);
            } else {
                await repo.updateQuote(id, { status: 'CANCELLED', requester_notes: notes ? `${String(quote.requester_notes ?? '')}\nCancelación: ${notes}`.trim() : undefined });
                await repo.notifyProvider(String(quote.provider_id), id, contracted ? 'Contratación cancelada' : 'Pedido cancelado',
                    `${String(quote.event_name)} fue cancelado por el cliente.`);
            }
            return this.quoteDetails(repo, id);
        });
    }
    async acceptQuote(id: string, user: Principal) {
        const outcome = await this.run(true, async repo => {
            const locked = required(await repo.lockQuote(id), 'Cotización inexistente.');
            const { quote } = await this.quoteAccess(repo, id, user);
            if (quote.requester_user_id !== user.id) fail(403, 'FORBIDDEN', 'Solo quien pidió la cotización puede aceptarla.');
            if (locked.status === 'SENT' && (locked.valid_until as Date) <= new Date()) {
                await repo.updateQuote(id, { status: 'EXPIRED' });
                return { expired: true as const };
            }
            if (locked.status !== 'SENT') fail(409, 'INVALID_STATE', 'Solo se acepta una cotización enviada.');
            await repo.updateQuote(id, { status: 'ACCEPTED', accepted_at: new Date() });
            await repo.notifyProvider(String(quote.provider_id), id, 'Servicio contratado', `${String(quote.event_name)}: el cliente aceptó la cotización.`);
            return { expired: false as const, data: await this.quoteDetails(repo, id) };
        });
        // Persist EXPIRED before reporting the conflict.
        if (outcome.expired) fail(409, 'QUOTE_EXPIRED', 'La cotización venció.');
        return outcome.data;
    }
}
