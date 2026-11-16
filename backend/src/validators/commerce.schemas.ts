import { z } from 'zod';
import { idSchema } from './management.schemas.ts';

// Ítems del carrito: sin tipos de entrada duplicados y hasta 100 entradas totales por compra.
const purchaseItems = z.array(z.strictObject({ ticketTypeId: idSchema, quantity: z.number().int().min(1).max(100) }))
    .min(1).max(100)
    .refine(items => new Set(items.map(item => item.ticketTypeId)).size === items.length, 'Tipos de entrada duplicados.')
    .refine(items => items.reduce((sum, item) => sum + item.quantity, 0) <= 100, 'Máximo 100 entradas por compra.');

// Desde el cliente viaja solo el código; el descuento y el total siempre los calcula el servidor.
export const promotionCodeSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{3,50}$/, 'Código promocional inválido: 3 a 50 caracteres alfanuméricos, guiones o guiones bajos.');

// Esquema de creación de orden de compra.
export const purchaseSchema = z.strictObject({
    concertId: idSchema.optional(),
    items: purchaseItems,
    promotionCode: promotionCodeSchema.optional(),
});

// Esquema de validación previa de cupón (por ítems o subtotal).
export const promotionValidationSchema = z.strictObject({
    code: promotionCodeSchema,
    concertId: idSchema.optional(),
    items: purchaseItems.optional(),
    subtotal: z.number().min(0).optional(),
}).refine(data => (data.items && data.items.length > 0) || (data.subtotal !== undefined && data.subtotal >= 0), {
    message: 'Se requieren items o subtotal para validar la promoción.',
});
export const validatePromotionSchema = promotionValidationSchema;

// Obligatoria en POST /purchases: identifica el intento y es única por usuario (uq_orders_idempotency).
export const idempotencyKeySchema = z.string().trim().regex(/^[A-Za-z0-9._:-]{8,128}$/, 'Idempotency-Key inválida: 8 a 128 caracteres alfanuméricos, guiones, puntos, dos puntos o guiones bajos.');

// Confirmar una compra es un pago simulado: solo se acepta el resultado esperado, nunca datos reales de tarjeta o banco.
export const purchasePaymentSchema = z.strictObject({ outcome: z.enum(['APPROVED', 'REJECTED']).default('APPROVED') }).default({ outcome: 'APPROVED' });
// Validación de entrada QR en puerta: exige ID de concierto y token hexadecimal SHA-256/32 bytes (64 chars).
export const validationSchema = z.strictObject({ concertId: idSchema, qrToken: z.string().regex(/^[a-f0-9]{64}$/) });
// Parámetros estándar de paginación.
export const pageSchema = z.strictObject({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Filtros de búsqueda y estado para listar promociones en administración.
export const promotionQuerySchema = z.strictObject({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).optional(),
});

// Esquema de creación de cupón con validación de vigencia y tope porcentual.
export const createPromotionSchema = z.strictObject({
    code: promotionCodeSchema,
    description: z.string().trim().min(3).max(255),
    discountType: z.enum(['PERCENTAGE', 'FIXED']),
    discountValue: z.coerce.number().positive(),
    minOrderAmount: z.coerce.number().min(0).default(0),
    concertId: idSchema.optional().nullable(),
    maxUses: z.coerce.number().int().positive().optional().nullable(),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date(),
}).refine(data => data.validUntil > data.validFrom, {
    message: 'validUntil debe ser posterior a validFrom',
    path: ['validUntil'],
}).refine(data => data.discountType !== 'PERCENTAGE' || data.discountValue <= 100, {
    message: 'El porcentaje de descuento no puede superar el 100%',
    path: ['discountValue'],
});

export const updatePromotionSchema = z.strictObject({
    description: z.string().trim().min(3).max(255).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    maxUses: z.coerce.number().int().positive().optional().nullable(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
});

export type PurchaseInput = z.output<typeof purchaseSchema>;
export type PromotionValidationInput = z.output<typeof promotionValidationSchema>;
export type ValidatePromotionInput = PromotionValidationInput;
export type ValidationInput = z.output<typeof validationSchema>;
export type PageQuery = z.output<typeof pageSchema>;
export type PromotionQuery = z.output<typeof promotionQuerySchema>;
export type CreatePromotionInput = z.output<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.output<typeof updatePromotionSchema>;
