import { z } from 'zod';
import { idSchema } from './management.schemas.ts';
export const statisticsQuerySchema = z.strictObject({
    from: z.iso.date().optional(), to: z.iso.date().optional(), concert_id: idSchema.optional(),
}).refine(value => !value.from || !value.to || value.from <= value.to, 'El inicio debe ser anterior al fin.');
export type StatisticsQuery = z.output<typeof statisticsQuerySchema>;
