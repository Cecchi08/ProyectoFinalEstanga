import { z } from 'zod';

export const idSchema = z.union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER).transform(String)])
    .pipe(z.string().refine(value => BigInt(value) <= 18446744073709551615n, 'ID fuera de rango.'));
const boundedId = (max: bigint) => idSchema.pipe(z.string().refine(value => BigInt(value) <= max, 'ID fuera de rango para este catálogo.'));
const smallId = boundedId(65535n);
const cityId = boundedId(4294967295n);
const name = (max: number) => z.string().trim().min(1).max(max);
const text = z.string().max(16000).nullable().optional();
const image = z.url().max(500).refine(value => /^https?:\/\//i.test(value), 'Usar HTTP o HTTPS.').nullable().optional();
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
    .refine(value => value.getUTCFullYear() >= 1000 && value.getUTCFullYear() <= 9999, 'Fecha fuera de rango MySQL.');
const ids = z.array(idSchema).max(100).refine(values => new Set(values).size === values.length, 'IDs duplicados.');
const genreIds = z.array(smallId).max(100).refine(values => new Set(values).size === values.length, 'IDs duplicados.');
const uint = z.number().int().min(0).max(4294967295);
const nonempty = (value: object) => Object.keys(value).length > 0;
export const catalogSchemas = {
    artists: z.strictObject({ name: name(160), description: text, image_url: image, genre_ids: genreIds.optional() }),
    genres: z.strictObject({ name: name(100) }),
    provinces: z.strictObject({ name: name(100) }),
    cities: z.strictObject({ name: name(120), province_id: smallId }),
    venues: z.strictObject({ name: name(150), city_id: cityId, address: name(255), capacity: uint.min(1).nullable().optional() }),
};
export const ticketSchema = z.strictObject({
    name: name(100),
    price: z.number().min(0).max(9999999999.99).refine(value => Number(value.toFixed(2)) === value, 'Máximo dos decimales.'),
    stock_total: uint,
    sale_start: date.nullable().optional(),
    sale_end: date.nullable().optional(),
    max_per_purchase: z.number().int().min(1).max(65535).nullable().optional(),
});
export const ticketPatchSchema = ticketSchema.partial().refine(nonempty, 'Enviar al menos un campo.');
export const concertSchema = z.strictObject({
    organizer_id: idSchema.optional(), venue_id: idSchema, concert_type_id: boundedId(255n),
    name: name(180), description: text, image_url: image,
    start_datetime: date, end_datetime: date.nullable().optional(),
    artist_ids: ids.optional(), genre_ids: genreIds.optional(),
    ticket_types: z.array(ticketSchema).max(100).optional(),
});
export const concertPatchSchema = concertSchema.omit({ organizer_id: true, ticket_types: true }).partial().refine(nonempty, 'Enviar al menos un campo.');
const pagination = {
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const concertQuerySchema = z.strictObject({
    ...pagination, q: name(180).optional(), name: name(180).optional(),
    artist_id: idSchema.optional(), genre_id: idSchema.optional(), venue_id: idSchema.optional(), city_id: idSchema.optional(),
    concert_type_id: idSchema.optional(), type: z.enum(['CONCERT', 'FESTIVAL', 'LIVE_SHOW']).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'FINISHED']).optional(),
    date_from: date.optional(), date_to: date.optional(),
    mine: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
}).refine(q => !q.date_from || !q.date_to || q.date_from <= q.date_to, 'Rango de fechas inválido.');
export const catalogQuerySchema = z.strictObject({ ...pagination, q: name(180).optional() });
export const cityQuerySchema = catalogQuerySchema.extend({ province_id: idSchema.optional() });
export const venueQuerySchema = catalogQuerySchema.extend({ city_id: idSchema.optional() });
export const emptySchema = z.strictObject({});
export type ConcertInput = z.output<typeof concertSchema>;
export type ConcertPatch = z.output<typeof concertPatchSchema>;
export type ConcertQuery = z.output<typeof concertQuerySchema>;
export type TicketInput = z.output<typeof ticketSchema>;
export type TicketPatch = z.output<typeof ticketPatchSchema>;
export type CatalogQuery = z.output<typeof catalogQuerySchema> & { province_id?: string; city_id?: string };
