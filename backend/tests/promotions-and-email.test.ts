// Pruebas unitarias de creación y aplicación de promociones (TESTVENTI) y correos de suspensión/reactivación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromotionSchema } from '../src/validators/commerce.schemas.ts';
import { applyPromotion, type PromotionRow } from '../src/utils/promotion.util.ts';
import { SmtpMailer } from '../src/services/email.service.js';

test('Validación de esquema para la creación del cupón TESTVENTI', () => {
    const validData = {
        code: 'TESTVENTI',
        description: 'Descuento oficial del 10% Venti Test',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minOrderAmount: 0,
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2027-12-31T23:59:59.000Z',
    };

    const parsed = createPromotionSchema.parse(validData);
    assert.equal(parsed.code, 'TESTVENTI');
    assert.equal(parsed.discountType, 'PERCENTAGE');
    assert.equal(parsed.discountValue, 10);
    assert.ok(parsed.validUntil > parsed.validFrom);
});

test('Rechazo de cupón porcentual con valor superior al 100%', () => {
    assert.throws(() => {
        createPromotionSchema.parse({
            code: 'INVALID150',
            description: 'Descuento excesivo',
            discountType: 'PERCENTAGE',
            discountValue: 150,
            validFrom: '2026-01-01T00:00:00.000Z',
            validUntil: '2027-12-31T23:59:59.000Z',
        });
    });
});

test('Aplicación efectiva del descuento TESTVENTI (10%) en una compra', () => {
    const promoRow: PromotionRow = {
        id: 'promo-testventi-1',
        code: 'TESTVENTI',
        description: 'Descuento oficial del 10% Venti Test',
        discount_type: 'PERCENTAGE',
        discount_value: '10.00',
        min_order_amount: '0.00',
        concert_id: null,
        max_uses: null,
        current_uses: 0,
        status: 'ACTIVE',
        valid_from: new Date('2026-01-01T00:00:00.000Z'),
        valid_until: new Date('2027-12-31T23:59:59.000Z'),
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
    };

    // Subtotal de compra de $15.000 (1500000 centavos)
    const subtotal = 1500000n;
    const now = new Date('2026-06-15T12:00:00.000Z');

    const quote = applyPromotion(promoRow, {
        concertId: 'concert-123',
        subtotal,
        now,
    });

    // 10% de $15.000 es $1.500,00
    assert.equal(quote.discount, '1500.00');
    assert.equal(quote.total, '13500.00');
    assert.equal(quote.code, 'TESTVENTI');
});

test('SmtpMailer genera plantilla de correo de suspensión con motivo', async () => {
    const sentMessages: any[] = [];
    const fakeTransporter = {
        sendMail: async (options: any) => {
            sentMessages.push(options);
            return { messageId: 'test-123' };
        },
        close: () => {},
    };

    const env = {
        SMTP_HOST: 'localhost',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        SMTP_FROM: 'soporte@venti.com',
        NODE_ENV: 'test',
        EMAIL_VERIFY_URL: 'http://localhost:3000/verify-email',
        PASSWORD_RESET_URL: 'http://localhost:3000/reset-password',
    };

    const mailer = new SmtpMailer(env as any);
    (mailer as any).transporter = fakeTransporter;

    await mailer.send({
        kind: 'suspension',
        to: 'usuario.suspendido@ejemplo.com',
        userName: 'Carlos Venti',
        reason: 'Violación reiterada de las condiciones de publicación.',
    });

    assert.equal(sentMessages.length, 1);
    const sent = sentMessages[0];
    assert.equal(sent.to, 'usuario.suspendido@ejemplo.com');
    assert.equal(sent.subject, 'VENTI: Tu cuenta ha sido suspendida');
    assert.ok(sent.text.includes('Violación reiterada'));
    assert.ok(sent.html.includes('Violación reiterada'));
});

test('SmtpMailer genera plantilla de correo de reactivación', async () => {
    const sentMessages: any[] = [];
    const fakeTransporter = {
        sendMail: async (options: any) => {
            sentMessages.push(options);
            return { messageId: 'test-456' };
        },
        close: () => {},
    };

    const env = {
        SMTP_HOST: 'localhost',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        SMTP_FROM: 'soporte@venti.com',
        NODE_ENV: 'test',
        EMAIL_VERIFY_URL: 'http://localhost:3000/verify-email',
        PASSWORD_RESET_URL: 'http://localhost:3000/reset-password',
    };

    const mailer = new SmtpMailer(env as any);
    (mailer as any).transporter = fakeTransporter;

    await mailer.send({
        kind: 'reactivation',
        to: 'usuario.reactivado@ejemplo.com',
        userName: 'Lucía Cantante',
        reason: 'Verificación de identidad confirmada.',
    });

    assert.equal(sentMessages.length, 1);
    const sent = sentMessages[0];
    assert.equal(sent.to, 'usuario.reactivado@ejemplo.com');
    assert.equal(sent.subject, 'VENTI: Tu cuenta ha sido reactivada');
    assert.ok(sent.text.includes('Verificación de identidad'));
    assert.ok(sent.html.includes('Tu cuenta ha sido reactivada'));
});
