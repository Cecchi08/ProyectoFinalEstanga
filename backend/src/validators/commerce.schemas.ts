import { z } from 'zod';
import { idSchema } from './management.schemas.ts';

export const purchaseSchema = z.strictObject({
    concertId: idSchema.optional(),
    items: z.array(z.strictObject({ ticketTypeId: idSchema, quantity: z.number().int().min(1).max(100) }))
        .min(1).max(100)
        .refine(items => new Set(items.map(item => item.ticketTypeId)).size === items.length, 'Tipos de entrada duplicados.')
        .refine(items => items.reduce((sum, item) => sum + item.quantity, 0) <= 100, 'Máximo 100 entradas por compra.'),
});
export const validationSchema = z.strictObject({ concertId: idSchema, qrToken: z.string().regex(/^[a-f0-9]{64}$/) });
export const pageSchema = z.strictObject({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PurchaseInput = z.output<typeof purchaseSchema>;
export type ValidationInput = z.output<typeof validationSchema>;
export type PageQuery = z.output<typeof pageSchema>;
