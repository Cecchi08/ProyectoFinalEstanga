import { z } from 'zod';
import { cityIdSchema, idSchema, nameSchema } from './management.schemas.ts';
import { pageSchema } from './commerce.schemas.ts';

// Marketplace slots are whole minutes: DATETIME(0) would silently round seconds and shift a slot.
const slot = z.iso.datetime({ offset: true }).transform(value => new Date(value))
    .refine(value => value.getUTCFullYear() >= 2000 && value.getUTCFullYear() <= 9999, 'Fecha fuera de rango.')
    .refine(value => value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0, 'Usar horarios en minutos exactos.');
const money = z.number().min(0).max(9999999999.99).refine(value => Number(value.toFixed(2)) === value, 'Máximo dos decimales.');
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const codes = z.array(z.string().trim().regex(/^[A-Z_]{1,40}$/)).max(50).refine(values => new Set(values).size === values.length, 'Códigos duplicados.');
const uint = z.number().int().min(1).max(4294967295);
const url = z.url().max(500).refine(value => /^https?:\/\//i.test(value), 'Usar HTTP o HTTPS.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usar HH:MM.');
export const occupancyModeSchema = z.enum(['VENUE', 'ESTABLISHMENT']);

const memberRole = z.enum(['OWNER', 'ADMIN', 'STAFF']);
export const memberSchema = z.strictObject({ email: z.string().trim().toLowerCase().max(190).pipe(z.email()), member_role: memberRole.default('STAFF') });
export const memberPatchSchema = z.strictObject({ member_role: memberRole });
export const organizationSchema = z.strictObject({
    name: nameSchema(150), legal_name: text(200), tax_id: z.string().trim().regex(/^\d{2}-?\d{8}-?\d$/, 'CUIT inválido.').nullable().optional(),
    email: z.email().max(255).nullable().optional(), phone: text(30),
});
const establishmentFields = {
    city_id: cityIdSchema, name: nameSchema(150), description: text(16000), address_line: nameSchema(255), postal_code: text(10),
    latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(),
    phone: text(30), email: z.email().max(255).nullable().optional(), website: z.url().max(255).nullable().optional(),
};
export const establishmentSchema = z.strictObject({ organization_id: idSchema, ...establishmentFields });
export const establishmentPatchSchema = z.strictObject(establishmentFields).partial().refine(value => Object.keys(value).length > 0, 'Enviar al menos un campo.');
const venueFields = {
    venue_type_code: z.string().trim().regex(/^[A-Z_]{1,40}$/), name: nameSchema(150), description: text(16000),
    capacity_standing: uint.nullable().optional(), capacity_seated: uint.nullable().optional(),
    area_m2: z.number().positive().max(999999.99).nullable().optional(), price_per_hour: money,
    min_booking_minutes: z.number().int().min(1).max(10080).optional(), hold_minutes: z.number().int().min(5).max(10080).optional(),
    amenities: codes.optional(),
    photos: z.array(z.strictObject({ url, is_cover: z.boolean().default(false) })).max(30)
        .refine(values => values.filter(photo => photo.is_cover).length <= 1, 'Solo una portada.').optional(),
    opening_hours: z.array(z.strictObject({ day_of_week: z.number().int().min(1).max(7), opens_at: time, closes_at: time })
        .refine(value => value.opens_at !== value.closes_at, 'Apertura y cierre iguales.')).max(50).optional(),
};
export const venueSchema = z.strictObject(venueFields);
export const venuePatchSchema = venueSchema.partial().refine(value => Object.keys(value).length > 0, 'Enviar al menos un campo.');
export const blockSchema = z.strictObject({
    venue_id: idSchema.nullable().optional(), reason: z.enum(['MAINTENANCE', 'PRIVATE_USE', 'HOLIDAY', 'OTHER']).default('OTHER'),
    description: text(255), starts_at: slot, ends_at: slot,
}).refine(value => value.starts_at < value.ends_at, 'El bloqueo debe terminar después de empezar.');

// Optional setup/teardown default to the event edges, which is what the occupancy procedure expects.
const schedule = {
    venue_id: idSchema, occupancy_mode: occupancyModeSchema.default('VENUE'), event_name: nameSchema(200),
    expected_attendance: uint.nullable().optional(),
    setup_start_at: slot.optional(), event_start_at: slot, event_end_at: slot, teardown_end_at: slot.optional(),
};
const ordered = (value: { setup_start_at?: Date; event_start_at: Date; event_end_at: Date; teardown_end_at?: Date }) =>
    (value.setup_start_at ?? value.event_start_at) <= value.event_start_at && value.event_start_at < value.event_end_at
    && value.event_end_at <= (value.teardown_end_at ?? value.event_end_at);
const scheduleMessage = 'Orden requerido: armado <= inicio < fin <= desarme.';
export const quoteRequestSchema = z.strictObject({ ...schedule, event_description: text(16000), requester_notes: text(16000) }).refine(ordered, scheduleMessage);
export const reservationSchema = z.strictObject({ ...schedule, notes: text(16000) }).refine(ordered, scheduleMessage);
export const quoteResponseSchema = z.strictObject({
    items: z.array(z.strictObject({
        description: nameSchema(255),
        quantity: z.number().positive().max(10000).refine(value => Number(value.toFixed(2)) === value, 'Máximo dos decimales.'),
        unit_price: money.refine(value => value <= 99999999.99, 'Precio unitario demasiado alto.'),
    })).min(1).max(100),
    fees: money.default(0), discount: money.default(0), valid_until: slot, provider_notes: text(16000),
});
export const notesSchema = z.strictObject({ provider_notes: text(16000) }).default({});
export const cancelSchema = z.strictObject({ reason: text(255) }).default({});
// The requester reads the reason, so rejecting a booking requires one.
export const rejectSchema = z.strictObject({ reason: z.string().trim().min(3).max(255) });
// Payments are always simulated: only the desired outcome is accepted, never card or bank data.
export const paymentSchema = z.strictObject({ outcome: z.enum(['APPROVED', 'REJECTED']).default('APPROVED') }).default({ outcome: 'APPROVED' });

const csv = z.string().max(500).transform(value => value.split(',').map(part => part.trim()).filter(Boolean)).pipe(codes);
const queryDate = z.iso.datetime({ offset: true }).transform(value => new Date(value));
export const venueQuerySchema = pageSchema.extend({
    q: nameSchema(150).optional(), city_id: idSchema.optional(), venue_type: z.string().regex(/^[A-Z_]{1,40}$/).optional(),
    amenities: csv.optional(), min_capacity: z.coerce.number().int().min(1).max(4294967295).optional(),
    max_price: z.coerce.number().min(0).max(9999999999.99).optional(),
    available_from: queryDate.optional(), available_to: queryDate.optional(), mode: occupancyModeSchema.default('VENUE'),
}).strict().refine(q => (q.available_from === undefined) === (q.available_to === undefined), 'Enviar available_from y available_to juntos.')
    .refine(q => !q.available_from || !q.available_to || q.available_from < q.available_to, 'Franja inválida.');
// A calendar date is a day in Argentina (all marketplace cities are UTC-03:00, without DST).
export const MARKETPLACE_UTC_OFFSET = '-03:00';
export const availabilityQuerySchema = z.strictObject({
    date: z.iso.date().optional(), from: queryDate.optional(), to: queryDate.optional(), mode: occupancyModeSchema.default('VENUE'),
}).refine(q => q.date ? !q.from && !q.to : q.from && q.to, 'Enviar date, o from y to.')
    .transform(q => {
        const from = q.date ? new Date(`${q.date}T00:00:00${MARKETPLACE_UTC_OFFSET}`) : q.from as Date;
        const to = q.date ? new Date(from.getTime() + 86400000) : q.to as Date;
        return { from, to, mode: q.mode, exact: !q.date };
    })
    .refine(q => q.from < q.to && q.to.getTime() - q.from.getTime() <= 31 * 86400000, 'Rango inválido (máximo 31 días).');
export const listQuerySchema = pageSchema.extend({
    as: z.enum(['requester', 'provider']).default('requester'), status: z.string().regex(/^[A-Z]{1,20}$/).optional(),
}).strict();

export type OrganizationInput = z.output<typeof organizationSchema>;
export type MemberInput = z.output<typeof memberSchema>;
export type MemberRole = z.output<typeof memberRole>;
export type EstablishmentInput = z.output<typeof establishmentSchema>;
export type EstablishmentPatch = z.output<typeof establishmentPatchSchema>;
export type VenueInput = z.output<typeof venueSchema>;
export type VenuePatch = z.output<typeof venuePatchSchema>;
export type BlockInput = z.output<typeof blockSchema>;
export type QuoteRequest = z.output<typeof quoteRequestSchema>;
export type QuoteResponse = z.output<typeof quoteResponseSchema>;
export type ReservationInput = z.output<typeof reservationSchema>;
export type VenueQuery = z.output<typeof venueQuerySchema>;
export type AvailabilityQuery = z.output<typeof availabilityQuerySchema>;
export type ListQuery = z.output<typeof listQuerySchema>;
