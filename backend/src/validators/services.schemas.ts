import { z } from 'zod';
import { cityIdSchema, idSchema, nameSchema } from './management.schemas.ts';
import { pageSchema } from './commerce.schemas.ts';
import { MARKETPLACE_UTC_OFFSET, organizationSchema } from './marketplace.schemas.ts';

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const money = z.number().min(0).max(9999999999.99).refine(value => Number(value.toFixed(2)) === value, 'Máximo dos decimales.');
const when = z.iso.datetime({ offset: true }).transform(value => new Date(value))
    .refine(value => value.getUTCFullYear() >= 2000 && value.getUTCFullYear() <= 9999, 'Fecha fuera de rango.');
const code = z.string().trim().regex(/^[A-Z_]{1,40}$/);

// A service company is an organization (same fields) plus its commercial profile.
const providerFields = { description: text(16000), city_id: cityIdSchema.nullable().optional(), coverage_area: text(255) };
export const providerSchema = organizationSchema.extend(providerFields);
export const providerPatchSchema = organizationSchema.partial().extend(providerFields)
    .refine(value => Object.keys(value).length > 0, 'Enviar al menos un campo.');

const pricing = z.enum(['HOUR', 'DAY', 'EVENT', 'UNIT', 'QUOTE']);
const offeringFields = {
    category_code: code, name: nameSchema(150), description: text(16000), equipment: text(16000), conditions: text(16000),
    pricing_unit: pricing.default('QUOTE'), base_price: money.nullable().optional(),
};
// Without a list price the offering works only through quotes (pricing_unit QUOTE).
const priced = (value: { pricing_unit?: string; base_price?: number | null }) => value.pricing_unit === undefined || value.pricing_unit === 'QUOTE' || value.base_price != null;
export const offeringSchema = z.strictObject(offeringFields).refine(priced, 'Indicar base_price o usar pricing_unit QUOTE.');
export const offeringPatchSchema = z.strictObject({ ...offeringFields, pricing_unit: pricing.optional() }).partial()
    .refine(value => Object.keys(value).length > 0, 'Enviar al menos un campo.');

export const serviceQuoteRequestSchema = z.strictObject({
    offering_id: idSchema, concert_id: idSchema.nullable().optional(), reservation_id: idSchema.nullable().optional(),
    event_name: nameSchema(200), event_start_at: when, event_end_at: when, location_text: text(255), requester_notes: text(16000),
}).refine(value => value.event_start_at < value.event_end_at, 'El servicio debe terminar después de empezar.');
export const serviceQuoteResponseSchema = z.strictObject({
    items: z.array(z.strictObject({
        description: nameSchema(255),
        quantity: z.number().positive().max(10000).refine(value => Number(value.toFixed(2)) === value, 'Máximo dos decimales.'),
        unit_price: money.refine(value => value <= 99999999.99, 'Precio unitario demasiado alto.'),
    })).min(1).max(100),
    fees: money.default(0), discount: money.default(0), valid_until: when, provider_notes: text(16000),
});
export const serviceNotesSchema = z.strictObject({ provider_notes: text(16000) }).default({});
export const serviceCancelSchema = z.strictObject({ reason: text(255) }).default({});

export const providerQuerySchema = pageSchema.extend({
    q: nameSchema(150).optional(), city_id: idSchema.optional(), category: code.optional(), verified: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
}).strict();
export const offeringQuerySchema = pageSchema.extend({
    q: nameSchema(150).optional(), city_id: idSchema.optional(), category: code.optional(), provider_id: idSchema.optional(),
    max_price: z.coerce.number().min(0).max(9999999999.99).optional(),
}).strict();
// Like venue availability: a calendar day in Argentina, or an exact window (then `available` is returned); at most 31 days.
export const serviceAvailabilitySchema = z.strictObject({ date: z.iso.date().optional(), from: when.optional(), to: when.optional() })
    .refine(q => q.date ? !q.from && !q.to : q.from && q.to, 'Enviar date, o from y to.')
    .transform(q => {
        const from = q.date ? new Date(`${q.date}T00:00:00${MARKETPLACE_UTC_OFFSET}`) : q.from as Date;
        return { from, to: q.date ? new Date(from.getTime() + 86400000) : q.to as Date, exact: !q.date };
    })
    .refine(q => q.from < q.to && q.to.getTime() - q.from.getTime() <= 31 * 86400000, 'Rango inválido (máximo 31 días).');
export const serviceQuoteListSchema = pageSchema.extend({
    as: z.enum(['requester', 'provider']).default('requester'), status: z.string().regex(/^[A-Z]{1,20}$/).optional(), concert_id: idSchema.optional(),
}).strict();

export type ProviderInput = z.output<typeof providerSchema>;
export type ProviderPatch = z.output<typeof providerPatchSchema>;
export type OfferingInput = z.output<typeof offeringSchema>;
export type OfferingPatch = z.output<typeof offeringPatchSchema>;
export type ServiceQuoteRequest = z.output<typeof serviceQuoteRequestSchema>;
export type ServiceQuoteResponse = z.output<typeof serviceQuoteResponseSchema>;
export type ProviderQuery = z.output<typeof providerQuerySchema>;
export type OfferingQuery = z.output<typeof offeringQuerySchema>;
export type ServiceQuoteList = z.output<typeof serviceQuoteListSchema>;
export type ServiceAvailabilityQuery = z.output<typeof serviceAvailabilitySchema>;
