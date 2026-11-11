import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyPromotion, normalizePromotionCode, promotionDiscount, type PromotionRow } from '../src/utils/promotion.util.ts';
import { cents } from '../src/utils/money.util.ts';

describe('Promotions Business Logic & Pricing Engine', () => {
    test('normalización de código elimina espacios y convierte a mayúsculas', () => {
        assert.equal(normalizePromotionCode('  venti10  '), 'VENTI10');
        assert.equal(normalizePromotionCode('promo_2026'), 'PROMO_2026');
        assert.equal(normalizePromotionCode('Fiesta-1000'), 'FIESTA-1000');
    });

    test('cálculo de descuento porcentual con redondeo half-up a centavos', () => {
        const promoPct: Pick<PromotionRow, 'discount_type' | 'discount_value'> = {
            discount_type: 'PERCENTAGE',
            discount_value: '10.00',
        };
        // 10% de $100.00 (10000 centavos) = 1000 centavos ($10.00)
        assert.equal(promotionDiscount(promoPct, 10000n), 1000n);

        // 15% de $123.45 (12345 centavos) = 1851.75 centavos -> redondeo half-up a 1852 centavos ($18.52)
        const promo15: Pick<PromotionRow, 'discount_type' | 'discount_value'> = {
            discount_type: 'PERCENTAGE',
            discount_value: '15.00',
        };
        assert.equal(promotionDiscount(promo15, 12345n), 1852n);

        // 10% de $0 = 0
        assert.equal(promotionDiscount(promoPct, 0n), 0n);
        assert.equal(promotionDiscount(promoPct, -100n), 0n);
    });

    test('descuento de importe fijo', () => {
        const promoFixed: Pick<PromotionRow, 'discount_type' | 'discount_value'> = {
            discount_type: 'FIXED',
            discount_value: '500.00',
        };
        // $500.00 sobre $2000.00 = 50000 centavos
        assert.equal(promotionDiscount(promoFixed, 200000n), 50000n);
    });

    test('el descuento nunca supera el subtotal y el total nunca es negativo', () => {
        const bigFixed: Pick<PromotionRow, 'discount_type' | 'discount_value'> = {
            discount_type: 'FIXED',
            discount_value: '5000.00',
        };
        // Descuento de $5000 sobre compra de $1500: se acota a $1500 (150000 centavos)
        const discount = promotionDiscount(bigFixed, 150000n);
        assert.equal(discount, 150000n);
        assert.equal(150000n - discount, 0n);

        const bigPct: Pick<PromotionRow, 'discount_type' | 'discount_value'> = {
            discount_type: 'PERCENTAGE',
            discount_value: '150.00', // Aunque el CHECK de BD restringe <= 100, la función es defensiva
        };
        const discountPct = promotionDiscount(bigPct, 10000n);
        assert.equal(discountPct, 10000n);
        assert.equal(10000n - discountPct, 0n);
    });

    const basePromo: PromotionRow = {
        id: '1',
        code: 'TESTCODE',
        description: 'Cupón de prueba',
        discount_type: 'PERCENTAGE',
        discount_value: '10.00',
        min_order_amount: '1000.00',
        concert_id: null,
        max_uses: 10,
        current_uses: 0,
        status: 'ACTIVE',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-12-31T23:59:59Z'),
    };

    const now = new Date('2026-06-15T12:00:00Z');

    test('rechaza si la promoción está inactiva', () => {
        assert.throws(
            () => applyPromotion({ ...basePromo, status: 'INACTIVE' }, { concertId: '10', subtotal: 200000n, now }),
            (err: any) => err.code === 'PROMOTION_INACTIVE',
        );
    });

    test('rechaza si la promoción está vencida por estado o fecha', () => {
        assert.throws(
            () => applyPromotion({ ...basePromo, status: 'EXPIRED' }, { concertId: '10', subtotal: 200000n, now }),
            (err: any) => err.code === 'PROMOTION_EXPIRED',
        );

        assert.throws(
            () => applyPromotion(
                { ...basePromo, valid_until: new Date('2026-05-01T00:00:00Z') },
                { concertId: '10', subtotal: 200000n, now },
            ),
            (err: any) => err.code === 'PROMOTION_EXPIRED',
        );
    });

    test('rechaza si la promoción todavía no comenzó', () => {
        assert.throws(
            () => applyPromotion(
                { ...basePromo, valid_from: new Date('2026-07-01T00:00:00Z') },
                { concertId: '10', subtotal: 200000n, now },
            ),
            (err: any) => err.code === 'PROMOTION_NOT_STARTED',
        );
    });

    test('valida asociación a concierto: rechaza si no coincide, permite si coincide o es global', () => {
        const concertSpecific: PromotionRow = { ...basePromo, concert_id: '99' };

        // Concierto no coincide
        assert.throws(
            () => applyPromotion(concertSpecific, { concertId: '10', subtotal: 200000n, now }),
            (err: any) => err.code === 'PROMOTION_NOT_APPLICABLE',
        );

        // Concierto coincide
        const match = applyPromotion(concertSpecific, { concertId: '99', subtotal: 200000n, now });
        assert.equal(match.code, 'TESTCODE');

        // Global (concert_id === null) aplica a cualquier concierto
        const globalMatch = applyPromotion(basePromo, { concertId: '888', subtotal: 200000n, now });
        assert.equal(globalMatch.code, 'TESTCODE');
    });

    test('valida límite de usos: rechaza si current_uses >= max_uses', () => {
        assert.throws(
            () => applyPromotion(
                { ...basePromo, max_uses: 5, current_uses: 5 },
                { concertId: '10', subtotal: 200000n, now },
            ),
            (err: any) => err.code === 'PROMOTION_EXHAUSTED',
        );

        // current_uses < max_uses permite aplicar
        const ok = applyPromotion(
            { ...basePromo, max_uses: 5, current_uses: 4 },
            { concertId: '10', subtotal: 200000n, now },
        );
        assert.equal(ok.code, 'TESTCODE');

        // max_uses null (ilimitado) permite aplicar
        const unlimited = applyPromotion(
            { ...basePromo, max_uses: null, current_uses: 9999 },
            { concertId: '10', subtotal: 200000n, now },
        );
        assert.equal(unlimited.code, 'TESTCODE');
    });

    test('valida importe mínimo de compra', () => {
        // Mínimo $1000 (100000 centavos)
        // Subtotal $800 (80000 centavos) -> rechaza
        assert.throws(
            () => applyPromotion(basePromo, { concertId: '10', subtotal: 80000n, now }),
            (err: any) => err.code === 'PROMOTION_MIN_AMOUNT',
        );

        // Subtotal $1000 (100000 centavos) -> acepta
        const exact = applyPromotion(basePromo, { concertId: '10', subtotal: 100000n, now });
        assert.equal(exact.subtotal, '1000.00');
        assert.equal(exact.discount, '100.00');
        assert.equal(exact.total, '900.00');
    });

    test('genera el quote completo con redondeo y tipos correctos', () => {
        const quote = applyPromotion(
            { ...basePromo, discount_type: 'FIXED', discount_value: '350.50', min_order_amount: '500.00' },
            { concertId: '10', subtotal: cents('1500.00'), now },
        );
        assert.equal(quote.code, 'TESTCODE');
        assert.equal(quote.discount_type, 'FIXED');
        assert.equal(quote.discount_value, '350.50');
        assert.equal(quote.subtotal, '1500.00');
        assert.equal(quote.discount, '350.50');
        assert.equal(quote.total, '1149.50');
    });

    test('validación de fechas en esquemas de promociones', async () => {
        const { createPromotionSchema, updatePromotionSchema } = await import('../src/validators/commerce.schemas.ts');

        // Rechaza validUntil <= validFrom en creación
        assert.throws(() => createPromotionSchema.parse({
            code: 'INVALID_DATES',
            description: 'Prueba fechas',
            discountType: 'PERCENTAGE',
            discountValue: 10,
            validFrom: '2026-10-01T00:00:00Z',
            validUntil: '2026-10-01T00:00:00Z', // Igual a validFrom
        }));

        assert.throws(() => createPromotionSchema.parse({
            code: 'INVALID_DATES_2',
            description: 'Prueba fechas invertidas',
            discountType: 'PERCENTAGE',
            discountValue: 10,
            validFrom: '2026-10-05T00:00:00Z',
            validUntil: '2026-10-01T00:00:00Z', // Anterior a validFrom
        }));

        // Acepta validUntil > validFrom
        const valid = createPromotionSchema.parse({
            code: 'VALID_DATES',
            description: 'Prueba fechas correctas',
            discountType: 'PERCENTAGE',
            discountValue: 10,
            validFrom: '2026-10-01T00:00:00Z',
            validUntil: '2026-10-05T00:00:00Z',
        });
        assert.equal(valid.code, 'VALID_DATES');

        // Update schema acepta fechas parciales
        const updateUntil = updatePromotionSchema.parse({ validUntil: '2027-01-01T00:00:00Z' });
        assert.ok(updateUntil.validUntil instanceof Date);

        const updateFrom = updatePromotionSchema.parse({ validFrom: '2026-05-01T00:00:00Z' });
        assert.ok(updateFrom.validFrom instanceof Date);
    });
});
