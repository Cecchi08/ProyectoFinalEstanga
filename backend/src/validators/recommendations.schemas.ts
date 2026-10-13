import { z } from 'zod';
export const recommendationsQuerySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(20) });
export const preferencesPatchSchema = z.strictObject({ recommendations_enabled: z.boolean().optional(), notifications_enabled: z.boolean().optional() })
    .refine(value => Object.keys(value).length > 0, 'Indicá una preferencia.');
export type PreferencesPatch = z.output<typeof preferencesPatchSchema>;
