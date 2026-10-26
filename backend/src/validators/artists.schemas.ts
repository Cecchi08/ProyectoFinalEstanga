import { z } from 'zod';
import { cityIdSchema, idSchema, imageSchema, nameSchema, paginationShape, smallIdSchema } from './management.schemas.ts';

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const genreIds = z.array(smallIdSchema).max(20).refine(values => new Set(values).size === values.length, 'Géneros duplicados.');
export const artistSchema = z.strictObject({
    stage_name: nameSchema(200), bio: text(16000), city_id: cityIdSchema.nullable().optional(), image_url: imageSchema,
    website: z.url().max(255).refine(value => /^https?:\/\//i.test(value), 'Usar HTTP o HTTPS.').nullable().optional(),
    genre_ids: genreIds.optional(),
});
export const artistPatchSchema = artistSchema.partial().refine(value => Object.keys(value).length > 0, 'Enviar al menos un campo.');
const memberRole = z.enum(['OWNER', 'MEMBER']);
export const artistMemberSchema = z.strictObject({ email: z.string().trim().toLowerCase().max(190).pipe(z.email()), member_role: memberRole.default('MEMBER') });
export const artistMemberPatchSchema = z.strictObject({ member_role: memberRole });
export const artistQuerySchema = z.strictObject({ ...paginationShape, q: nameSchema(200).optional(), genre_id: idSchema.optional(), city_id: idSchema.optional() });
export type ArtistInput = z.output<typeof artistSchema>;
export type ArtistPatch = z.output<typeof artistPatchSchema>;
export type ArtistMemberInput = z.output<typeof artistMemberSchema>;
export type ArtistMemberRole = z.output<typeof memberRole>;
export type ArtistQuery = z.output<typeof artistQuerySchema>;
