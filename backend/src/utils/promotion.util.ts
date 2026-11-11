import { AppError } from './app-error.util.js';
import { cents, decimal } from './money.util.ts';

export interface PromotionRow {
    id: string;
    code: string;
    description: string;
    discount_type: 'PERCENTAGE' | 'FIXED';
    discount_value: string;
    min_order_amount: string;
    concert_id: string | null;
    max_uses: number | null;
    current_uses: number;
    status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
    valid_from: Date;
    valid_until: Date;
    [column: string]: string | number | Date | null;
}

export interface PromotionQuote {
    code: string;
    description: string;
    discount_type: PromotionRow['discount_type'];
    discount_value: string;
    subtotal: string;
    discount: string;
    total: string;
}

const refuse = (status: number, code: string, message: string): never => { throw new AppError(status, code, message, undefined); };

// Codes are stored and compared in upper case without surrounding spaces; the column collation is case-insensitive anyway.
export const normalizePromotionCode = (code: string): string => code.trim().toUpperCase();

// Discount in integer cents. PERCENTAGE rounds half-up to the cent; both kinds are capped at the subtotal so the total never goes negative.
export function promotionDiscount(promotion: Pick<PromotionRow, 'discount_type' | 'discount_value'>, subtotal: bigint): bigint {
    if (subtotal <= 0n) return 0n;
    const value = cents(promotion.discount_value);
    if (value <= 0n) return 0n;
    const raw = promotion.discount_type === 'PERCENTAGE' ? (subtotal * value + 5000n) / 10000n : value;
    return raw > subtotal ? subtotal : raw < 0n ? 0n : raw;
}

// Business rules shared by POST /promotions/validate and POST /purchases. Throws AppError with a stable code.
export function applyPromotion(promotion: PromotionRow, context: { concertId: string; subtotal: bigint; now: Date }): PromotionQuote {
    if (promotion.status === 'INACTIVE') refuse(409, 'PROMOTION_INACTIVE', 'La promoción no está activa.');
    if (promotion.status === 'EXPIRED' || promotion.valid_until.getTime() < context.now.getTime())
        refuse(409, 'PROMOTION_EXPIRED', 'La promoción está vencida.');
    if (promotion.valid_from.getTime() > context.now.getTime()) refuse(409, 'PROMOTION_NOT_STARTED', 'La promoción todavía no comenzó.');
    if (promotion.concert_id !== null && promotion.concert_id !== context.concertId)
        refuse(409, 'PROMOTION_NOT_APPLICABLE', 'La promoción no es válida para este concierto.');
    if (promotion.max_uses !== null && promotion.current_uses >= promotion.max_uses)
        refuse(409, 'PROMOTION_EXHAUSTED', 'La promoción alcanzó su límite de usos.');
    if (context.subtotal < cents(promotion.min_order_amount))
        refuse(409, 'PROMOTION_MIN_AMOUNT', `La compra no alcanza el mínimo de $${promotion.min_order_amount} para esta promoción.`);
    const discount = promotionDiscount(promotion, context.subtotal);
    if (discount <= 0n) refuse(409, 'PROMOTION_NO_DISCOUNT', 'La promoción no genera descuento sobre esta compra.');
    return {
        code: promotion.code, description: promotion.description, discount_type: promotion.discount_type,
        discount_value: promotion.discount_value, subtotal: decimal(context.subtotal), discount: decimal(discount),
        total: decimal(context.subtotal - discount),
    };
}

