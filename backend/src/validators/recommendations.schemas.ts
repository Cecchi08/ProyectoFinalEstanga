import { z } from 'zod';
export const recommendationsQuerySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(20) });
export const preferencesPatchSchema = z.strictObject({ recommendations_enabled: z.boolean() });
