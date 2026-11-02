import { z } from 'zod';
import { cityIdSchema, idSchema, imageSchema, nameSchema, paginationShape, smallIdSchema } from './management.schemas.ts';

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const phone = z.string().trim().regex(/^\+?[\d\s()-]{6,30}$/, 'Teléfono inválido.').nullable().optional();
const contactEmail = z.string().trim().toLowerCase().max(190).pipe(z.email()).nullable().optional();
const money = z.number().min(0).max(9999999999.99).refine(value => Number(value.toFixed(2)) === value, 'Máximo dos decimales.').nullable().optional();
const when = z.iso.datetime({ offset: true }).transform(value => new Date(value))
    .refine(value => value.getUTCFullYear() >= 2000 && value.getUTCFullYear() <= 9999, 'Fecha fuera de rango.');
const genreIds = z.array(smallIdSchema).max(20).refine(values => new Set(values).size === values.length, 'Géneros duplicados.');
export const artistSchema = z.strictObject({
    stage_name: nameSchema(200), bio: text(16000), city_id: cityIdSchema.nullable().optional(), image_url: imageSchema,
    website: z.url().max(255).refine(value => /^https?:\/\//i.test(value), 'Usar HTTP o HTTPS.').nullable().optional(),
    phone, contact_email: contactEmail,
    genre_ids: genreIds.optional(),
});
export const artistPatchSchema = artistSchema.partial().refine(value => Object.keys(value).length > 0, 'Enviar al menos un campo.');
const memberRole = z.enum(['OWNER', 'MEMBER']);
export const artistMemberSchema = z.strictObject({ email: z.string().trim().toLowerCase().max(190).pipe(z.email()), member_role: memberRole.default('MEMBER') });
export const artistMemberPatchSchema = z.strictObject({ member_role: memberRole });
export const artistQuerySchema = z.strictObject({ ...paginationShape, q: nameSchema(200).optional(), genre_id: idSchema.optional(), city_id: idSchema.optional() });

export const proposalFlowSchema = z.enum(['VENUE_TO_ARTIST', 'ARTIST_TO_VENUE', 'ORGANIZER_TO_ARTIST']);
export const proposalStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED']);
export const proposalSchema = z.strictObject({
    flow_type: proposalFlowSchema,
    artist_profile_id: idSchema,
    venue_id: idSchema.nullable().optional(),
    establishment_id: idSchema.nullable().optional(),
    concert_id: idSchema.nullable().optional(),
    event_title: nameSchema(200),
    event_description: text(16000),
    genre_or_format: text(120),
    proposed_date: when,
    proposed_end_date: when.nullable().optional(),
    expected_attendance: z.number().int().positive().max(1000000).nullable().optional(),
    offered_amount: money,
    economic_terms: text(255),
    space_conditions: text(16000),
    technical_requirements: text(16000),
    message: text(16000),
}).refine(v => !v.proposed_end_date || v.proposed_date < v.proposed_end_date, 'La fecha de finalización debe ser posterior al inicio.');

export const proposalQuerySchema = z.strictObject({
    ...paginationShape,
    flow_type: proposalFlowSchema.optional(),
    status: proposalStatusSchema.optional(),
    artist_profile_id: idSchema.optional(),
    venue_id: idSchema.optional(),
    establishment_id: idSchema.optional(),
    direction: z.enum(['received', 'sent', 'all']).default('all'),
});
export const proposalDecisionSchema = z.strictObject({
    reason: text(1000),
}).default({});

export type ArtistInput = z.output<typeof artistSchema>;
export type ArtistPatch = z.output<typeof artistPatchSchema>;
export type ArtistMemberInput = z.output<typeof artistMemberSchema>;
export type ArtistMemberRole = z.output<typeof memberRole>;
export type ArtistQuery = z.output<typeof artistQuerySchema>;
export type ProposalInput = z.output<typeof proposalSchema>;
export type ProposalQuery = z.output<typeof proposalQuerySchema>;
