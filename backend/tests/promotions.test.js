import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { TestDatabase } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { user: '801', other: '802', organizer: '803', admin: '804' };
const roles = { user: 'COMPRADOR', other: 'COMPRADOR', organizer: 'ORGANIZADOR', admin: 'ADMIN' };

const call = (method, url, role = 'user', body, key) => {
    const req = request(ctx.app)[method](url);
    if (key !== undefined) req.set('Idempotency-Key', key);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], [roles[role]])}`);
    return body === undefined ? req : req.send(body);
};

before(async () => { await db.open(); });
after(async () => { await db.close(); });

beforeEach(async () => {
    for (const table of ['promotion_redemptions', 'ticket_validations', 'tickets', 'order_items', 'order_payments', 'orders', 'promotions', 'ticket_types', 'concert_staff', 'notifications', 'concerts', 'users']) {
        await db.rows(`DELETE FROM ${table}`);
    }
    ctx = db.context();
    for (const [role, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES (?, ?, ?, ?, NOW())', [id, role, 'Test', `${role}@promo.example`]);
        await db.rows('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [id, roles[role]]);
    }
    await db.rows(`INSERT INTO concerts (id, organizer_user_id, title, slug, artist_name, venue_name, address_line, starts_at, status, published_at)
        VALUES ('1', ?, 'Concierto Promo', 'concierto-promo', 'Artista Promo', 'Estadio', 'Calle 1', DATE_ADD(NOW(), INTERVAL 30 DAY), 'PUBLISHED', NOW())`, [ids.organizer]);
    await db.rows(`INSERT INTO concerts (id, organizer_user_id, title, slug, artist_name, venue_name, address_line, starts_at, status, published_at)
        VALUES ('2', ?, 'Concierto Otro', 'concierto-otro', 'Artista 2', 'Estadio 2', 'Calle 2', DATE_ADD(NOW(), INTERVAL 30 DAY), 'PUBLISHED', NOW())`, [ids.organizer]);

    await db.rows(`INSERT INTO ticket_types (id, concert_id, name, price, quantity_total, sales_start_at, sales_end_at, max_per_order)
        VALUES ('1', '1', 'Entrada General', 1000.00, 50, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY), 10)`);
    await db.rows(`INSERT INTO ticket_types (id, concert_id, name, price, quantity_total, sales_start_at, sales_end_at, max_per_order)
        VALUES ('2', '2', 'Entrada Otro Show', 2000.00, 50, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY), 10)`);

    // Semillas de prueba controladas
    await db.rows(`INSERT INTO promotions (id, code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
        VALUES ('100', 'PROMO10PCT', '10% OFF', 'PERCENTAGE', 10.00, 0.00, NULL, NULL, 0, 'ACTIVE', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY))`);
    await db.rows(`INSERT INTO promotions (id, code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
        VALUES ('101', 'FIJO500', '$500 OFF min $2000', 'FIXED', 500.00, 2000.00, NULL, 5, 0, 'ACTIVE', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY))`);
    await db.rows(`INSERT INTO promotions (id, code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
        VALUES ('102', 'EXPIREDCODE', 'Vencida', 'PERCENTAGE', 15.00, 0.00, NULL, 10, 0, 'ACTIVE', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY))`);
    await db.rows(`INSERT INTO promotions (id, code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
        VALUES ('103', 'INACTIVECODE', 'Inactiva', 'FIXED', 300.00, 0.00, NULL, 10, 0, 'INACTIVE', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY))`);
    await db.rows(`INSERT INTO promotions (id, code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
        VALUES ('104', 'ONLYCONCERT2', 'Solo show 2', 'PERCENTAGE', 20.00, 0.00, '2', 10, 0, 'ACTIVE', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY))`);
    await db.rows(`INSERT INTO promotions (id, code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
        VALUES ('105', 'LIMIT1USE', '1 solo uso', 'FIXED', 400.00, 0.00, NULL, 1, 0, 'ACTIVE', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY))`);
});

test('Validación de código promocional: casos de éxito y de rechazo', async () => {
    // 1. Código inexistente
    const notFound = await call('post', '/promotions/validate', 'user', { code: 'NOEXISTE', items: [{ ticketTypeId: '1', quantity: 2 }] }).expect(404);
    assert.equal(notFound.body.error.code, 'PROMOTION_NOT_FOUND');

    // 2. Código vencido
    const expired = await call('post', '/promotions/validate', 'user', { code: 'EXPIREDCODE', items: [{ ticketTypeId: '1', quantity: 2 }] }).expect(409);
    assert.equal(expired.body.error.code, 'PROMOTION_EXPIRED');

    // 3. Código inactivo
    const inactive = await call('post', '/promotions/validate', 'user', { code: 'INACTIVECODE', items: [{ ticketTypeId: '1', quantity: 2 }] }).expect(409);
    assert.equal(inactive.body.error.code, 'PROMOTION_INACTIVE');

    // 4. Mínimo de compra no alcanzado (FIJO500 pide $2000; 1 entrada = $1000)
    const minAmount = await call('post', '/promotions/validate', 'user', { code: 'FIJO500', items: [{ ticketTypeId: '1', quantity: 1 }] }).expect(409);
    assert.equal(minAmount.body.error.code, 'PROMOTION_MIN_AMOUNT');

    // 5. Concierto incorrecto
    const wrongConcert = await call('post', '/promotions/validate', 'user', { code: 'ONLYCONCERT2', items: [{ ticketTypeId: '1', quantity: 2 }] }).expect(409);
    assert.equal(wrongConcert.body.error.code, 'PROMOTION_NOT_APPLICABLE');

    // 6. Éxito porcentual (10% de $2000 = $200; total = $1800)
    const validPct = await call('post', '/promotions/validate', 'user', { code: 'PROMO10PCT', items: [{ ticketTypeId: '1', quantity: 2 }] }).expect(200);
    assert.equal(validPct.body.data.discount_type, 'PERCENTAGE');
    assert.equal(validPct.body.data.subtotal, '2000.00');
    assert.equal(validPct.body.data.discount, '200.00');
    assert.equal(validPct.body.data.total, '1800.00');

    // 7. Éxito monto fijo ($500 de $3000; total = $2500)
    const validFixed = await call('post', '/promotions/validate', 'user', { code: 'FIJO500', items: [{ ticketTypeId: '1', quantity: 3 }] }).expect(200);
    assert.equal(validFixed.body.data.discount_type, 'FIXED');
    assert.equal(validFixed.body.data.subtotal, '3000.00');
    assert.equal(validFixed.body.data.discount, '500.00');
    assert.equal(validFixed.body.data.total, '2500.00');
});

test('Compra con promoción: cálculo exacto, almacenamiento de subtotal/discount y confirmación que incrementa current_uses', async () => {
    const res = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'PROMO10PCT',
    }, 'key-promo-purchase-1').expect(201);

    const purchase = res.body.data;
    assert.equal(purchase.status, 'PENDING');
    assert.equal(purchase.subtotal, '2000.00');
    assert.equal(purchase.discount, '200.00');
    assert.equal(purchase.total, '1800.00');
    assert.equal(purchase.promotion_code, 'PROMO10PCT');

    // En PENDING aún NO se consume el cupón (se reserva solo al confirmar la compra real)
    const [promoBefore] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(promoBefore.current_uses), 0);

    // Confirmamos la compra (simulando pago aprobado)
    const confirmed = await call('post', `/purchases/${purchase.id}/confirm`, 'user', { outcome: 'APPROVED' }).expect(200);
    assert.equal(confirmed.body.data.status, 'CONFIRMED');

    // Ahora current_uses se incrementó a 1
    const [promoAfter] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(promoAfter.current_uses), 1);

    // Debe existir un registro en promotion_redemptions
    const redemptions = await db.rows('SELECT * FROM promotion_redemptions WHERE order_id = ?', [purchase.id]);
    assert.equal(redemptions.length, 1);
    assert.equal(redemptions[0].released_at, null);
});

test('Límite máximo de usos: no permite confirmar compras más allá de max_uses y cancela la orden agotada liberando stock', async () => {
    // LIMIT1USE tiene max_uses = 1
    const res1 = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'LIMIT1USE',
    }, 'key-limit-1').expect(201);

    const res2 = await call('post', '/purchases', 'other', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'LIMIT1USE',
    }, 'key-limit-2').expect(201);

    // El primer comprador confirma con éxito
    await call('post', `/purchases/${res1.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }).expect(200);

    // El segundo comprador intenta confirmar pero la promoción ya se agotó
    const failed = await call('post', `/purchases/${res2.body.data.id}/confirm`, 'other', { outcome: 'APPROVED' }).expect(409);
    assert.equal(failed.body.error.code, 'PROMOTION_EXHAUSTED');

    // current_uses no supera max_uses (1)
    const [promo] = await db.rows('SELECT current_uses FROM promotions WHERE id = 105');
    assert.equal(Number(promo.current_uses), 1);

    // La orden rechazada se canceló automáticamente para liberar las entradas
    const [order2] = await db.rows('SELECT status FROM orders WHERE id = ?', [res2.body.data.id]);
    assert.equal(order2.status, 'CANCELLED');
});

test('Dos compras concurrentes intentando consumir el último uso: solo una tiene éxito y la otra es rechazada', async () => {
    // LIMIT1USE tiene max_uses = 1
    const res1 = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 1 }],
        promotionCode: 'LIMIT1USE',
    }, 'key-concurrent-1').expect(201);

    const res2 = await call('post', '/purchases', 'other', {
        items: [{ ticketTypeId: '1', quantity: 1 }],
        promotionCode: 'LIMIT1USE',
    }, 'key-concurrent-2').expect(201);

    // Ambas compras disparan /confirm en paralelo
    const [p1, p2] = await Promise.all([
        call('post', `/purchases/${res1.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }),
        call('post', `/purchases/${res2.body.data.id}/confirm`, 'other', { outcome: 'APPROVED' }),
    ]);

    const statuses = [p1.status, p2.status].sort();
    assert.deepEqual(statuses, [200, 409], 'Exactamente una solicitud tiene éxito (200) y la otra es rechazada con conflicto (409)');

    const winnerRes = p1.status === 200 ? p1 : p2;
    const winnerId = p1.status === 200 ? res1.body.data.id : res2.body.data.id;
    const loserRes = p1.status === 409 ? p1 : p2;
    const loserId = p1.status === 409 ? res1.body.data.id : res2.body.data.id;
    const loserRole = p1.status === 409 ? 'user' : 'other';

    assert.equal(winnerRes.body.data.status, 'CONFIRMED');
    assert.equal(loserRes.body.error.code, 'PROMOTION_EXHAUSTED');

    // 1. current_uses queda exactamente en 1, no supera max_uses (1)
    const [promo] = await db.rows('SELECT current_uses FROM promotions WHERE id = 105');
    assert.equal(Number(promo.current_uses), 1);

    // 2. Comprobación directa en BD de que la orden perdedora se canceló y la transacción NO fue revertida por un rollback posterior
    const [losingOrder] = await db.rows('SELECT status, cancelled_at FROM orders WHERE id = ?', [loserId]);
    assert.equal(losingOrder.status, 'CANCELLED');
    assert.notEqual(losingOrder.cancelled_at, null, 'cancelled_at debe estar persistido en BD');

    // 3. Comprobación de que la compra cancelada NO puede confirmarse posteriormente
    const reconfirm = await call('post', `/purchases/${loserId}/confirm`, loserRole, { outcome: 'APPROVED' }).expect(409);
    assert.equal(reconfirm.body.error.code, 'INVALID_STATE');

    // 4. Invariante: current_uses coincide exactamente con las redenciones activas
    const [activeRedemptions] = await db.rows('SELECT COUNT(*) AS c FROM promotion_redemptions WHERE promotion_id = 105 AND released_at IS NULL');
    assert.equal(Number(activeRedemptions.c), Number(promo.current_uses));

    // 5. El stock de entradas se liberó correctamente: el usuario perdedor puede iniciar una compra nueva sin el cupón agotado y confirmarla
    const retryRes = await call('post', '/purchases', loserRole, {
        items: [{ ticketTypeId: '1', quantity: 1 }],
    }, 'key-concurrent-retry-no-promo').expect(201);
    const retryConfirm = await call('post', `/purchases/${retryRes.body.data.id}/confirm`, loserRole, { outcome: 'APPROVED' }).expect(200);
    assert.equal(retryConfirm.body.data.status, 'CONFIRMED');
    assert.equal(retryConfirm.body.data.promotion_code, null);

    // 6. Consistencia entre orders, order_payments y promotion_redemptions
    const [winnerOrder] = await db.rows('SELECT * FROM orders WHERE id = ?', [winnerId]);
    assert.equal(winnerOrder.status, 'CONFIRMED');
    const winnerPayments = await db.rows('SELECT * FROM order_payments WHERE order_id = ?', [winnerId]);
    assert.equal(winnerPayments.length, 1);
    assert.equal(winnerPayments[0].status, 'APPROVED');
    const winnerRedemptions = await db.rows('SELECT * FROM promotion_redemptions WHERE order_id = ?', [winnerId]);
    assert.equal(winnerRedemptions.length, 1);
    assert.equal(winnerRedemptions[0].released_at, null);
});

test('Dos confirmaciones simultáneas de una misma compra: ambas devuelven 200, no duplican tickets, redenciones ni usos', async () => {
    const res = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'PROMO10PCT',
    }, 'key-simultaneous-confirm-1').expect(201);

    const [c1, c2] = await Promise.all([
        call('post', `/purchases/${res.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }),
        call('post', `/purchases/${res.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }),
    ]);

    assert.equal(c1.status, 200);
    assert.equal(c2.status, 200);
    assert.equal(c1.body.data.id, res.body.data.id);
    assert.equal(c2.body.data.id, res.body.data.id);

    // Exactamente 1 uso consumido
    const [promo] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(promo.current_uses), 1);

    // Exactamente 1 fila en promotion_redemptions
    const redemptions = await db.rows('SELECT * FROM promotion_redemptions WHERE order_id = ?', [res.body.data.id]);
    assert.equal(redemptions.length, 1);
    assert.equal(redemptions[0].released_at, null);

    // Exactamente 2 tickets emitidos (quantity = 2), sin duplicados
    const tickets = await db.rows('SELECT t.* FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id WHERE oi.order_id = ?', [res.body.data.id]);
    assert.equal(tickets.length, 2);

    // Exactamente 1 pago aprobado
    const payments = await db.rows('SELECT * FROM order_payments WHERE order_id = ?', [res.body.data.id]);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].status, 'APPROVED');

    // Consistencia de estados entre orders, order_payments y promotion_redemptions
    const [order] = await db.rows('SELECT * FROM orders WHERE id = ?', [res.body.data.id]);
    assert.equal(order.status, 'CONFIRMED');
    assert.equal(order.promotion_id, '100');
    assert.equal(order.promotion_code, 'PROMO10PCT');
});

test('Compra fallida (pago REJECTED): no consume la promoción y mantiene current_uses intacto', async () => {
    const res = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'PROMO10PCT',
    }, 'key-failed-pay-1').expect(201);

    // Pago rechazado
    const rejected = await call('post', `/purchases/${res.body.data.id}/confirm`, 'user', { outcome: 'REJECTED' }).expect(200);
    assert.equal(rejected.body.data.status, 'PENDING');

    // La promoción NO fue consumida
    const [promo] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(promo.current_uses), 0);

    const redemptions = await db.rows('SELECT * FROM promotion_redemptions WHERE order_id = ?', [res.body.data.id]);
    assert.equal(redemptions.length, 0);
});

test('Idempotencia en POST /purchases: reintento con la misma clave devuelve 200 con encabezado Idempotent-Replayed y misma compra', async () => {
    const body = {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'PROMO10PCT',
    };
    const first = await call('post', '/purchases', 'user', body, 'key-idempotent-promo').expect(201);
    assert.equal(first.body.data.promotion_code, 'PROMO10PCT');

    const second = await call('post', '/purchases', 'user', body, 'key-idempotent-promo').expect(200);
    assert.equal(second.headers['idempotent-replayed'], 'true');
    assert.equal(second.body.data.id, first.body.data.id);
    assert.equal(second.body.data.total, first.body.data.total);
});

test('Reintentos de confirmación son idempotentes y no duplican el consumo', async () => {
    const res = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'PROMO10PCT',
    }, 'key-retry-consume-1').expect(201);

    // Primera confirmación
    const conf1 = await call('post', `/purchases/${res.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }).expect(200);
    const [promo1] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(promo1.current_uses), 1);

    // Segunda confirmación (reintento sobre la misma compra ya confirmada): responde 200 con encabezado de reintento
    const conf2 = await call('post', `/purchases/${res.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }).expect(200);
    assert.equal(conf2.headers['idempotent-replayed'], 'true');
    assert.equal(conf2.body.data.id, conf1.body.data.id);

    const [promo2] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(promo2.current_uses), 1, 'No debe consumir dos veces el mismo pedido');
});

test('Cancelación de pedido PENDING con promoción: no altera current_uses', async () => {
    const res = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'PROMO10PCT',
    }, 'key-cancel-pending-1').expect(201);

    const cancelled = await call('post', `/purchases/${res.body.data.id}/cancel`, 'user').expect(200);
    assert.equal(cancelled.body.data.status, 'CANCELLED');

    const [promo] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(promo.current_uses), 0);
});

test('Cancelación y liberación de promoción: al cancelar una compra confirmada se libera el uso', async () => {
    const res = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'PROMO10PCT',
    }, 'key-cancel-release-1').expect(201);

    await call('post', `/purchases/${res.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }).expect(200);
    const [pConfirmed] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(pConfirmed.current_uses), 1);

    // Cancelamos la compra confirmada (reembolso)
    const cancelled = await call('post', `/purchases/${res.body.data.id}/cancel`, 'user').expect(200);
    assert.equal(cancelled.body.data.status, 'CANCELLED');

    // El uso debe haberse liberado (decremento de current_uses a 0)
    const [pReleased] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(pReleased.current_uses), 0);

    // El registro de redemption tiene released_at no nulo
    const [redemption] = await db.rows('SELECT * FROM promotion_redemptions WHERE order_id = ?', [res.body.data.id]);
    assert.notEqual(redemption.released_at, null);

    // Una segunda cancelación no debe volver a restar ni liberar
    await call('post', `/purchases/${res.body.data.id}/cancel`, 'user').catch(() => {});
    const [pTwice] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(pTwice.current_uses), 0, 'No debe liberar dos veces');
});

test('Ciclo completo de redención: reactivación de una redención liberada no duplica registro ni incrementa usos dos veces', async () => {
    const res = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
        promotionCode: 'PROMO10PCT',
    }, 'key-reactivate-1').expect(201);

    // 1. Confirmar: crea redención y current_uses = 1
    await call('post', `/purchases/${res.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }).expect(200);
    const [p1] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(p1.current_uses), 1);

    // 2. Cancelar: libera redención (released_at != null) y current_uses = 0
    await call('post', `/purchases/${res.body.data.id}/cancel`, 'user').expect(200);
    const [p2] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(p2.current_uses), 0);

    // 3. Reactivar consumo sobre la conexión: reactiva la redención existente
    await db.transaction(async (repo) => {
        const result = await repo.promotions.consume('100', res.body.data.id);
        assert.equal(result, 'CONSUMED');
    });
    const [p3] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(p3.current_uses), 1);

    const [redemption] = await db.rows('SELECT * FROM promotion_redemptions WHERE order_id = ?', [res.body.data.id]);
    assert.equal(redemption.released_at, null, 'released_at debe volver a ser null al reactivarse');

    // 4. Intentar consumir nuevamente sobre la redención ya activa: devuelve ALREADY_ACTIVE y NO incrementa
    await db.transaction(async (repo) => {
        const result = await repo.promotions.consume('100', res.body.data.id);
        assert.equal(result, 'ALREADY_ACTIVE');
    });
    const [p4] = await db.rows('SELECT current_uses FROM promotions WHERE id = 100');
    assert.equal(Number(p4.current_uses), 1, 'current_uses no debe incrementarse una segunda vez');
});

test('Compras sin promoción y compras históricas mantienen coherencia y null en promotion_id', async () => {
    const res = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 2 }],
    }, 'key-no-promo-1').expect(201);

    assert.equal(res.body.data.subtotal, '2000.00');
    assert.equal(res.body.data.discount, '0.00');
    assert.equal(res.body.data.total, '2000.00');
    assert.equal(res.body.data.promotion_code, null);

    await call('post', `/purchases/${res.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }).expect(200);

    // Ninguna promoción fue alterada
    const [totalRedemptions] = await db.rows('SELECT COUNT(*) AS c FROM promotion_redemptions WHERE order_id = ?', [res.body.data.id]);
    assert.equal(Number(totalRedemptions.c), 0);
});

test('Administración CRUD de promociones: control de permisos, validación, auditoría y preservación de historial', async () => {
    // 1. Control de permisos granulares:
    // a) Usuario sin permisos (COMPRADOR): 403
    await call('get', '/admin/promotions', 'user').expect(403);
    await call('post', '/admin/promotions', 'user', {
        code: 'HACK', description: 'desc', discountType: 'FIXED', discountValue: 100, minOrderAmount: 0,
        validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
    }).expect(403);

    // b) Usuario con solo 'orders.read_all' (rol ORGANIZADOR recibe orders.read_all)
    await db.rows("INSERT INTO role_permissions (role_id, permission_id) SELECT id, (SELECT id FROM permissions WHERE code = 'orders.read_all') FROM roles WHERE code = 'ORGANIZADOR' ON DUPLICATE KEY UPDATE role_id = role_id");
    const resOrders = await call('get', '/admin/promotions', 'organizer').expect(200);
    assert.ok(Array.isArray(resOrders.body.data));

    // c) Usuario con solo 'catalogs.manage' (rol ARTISTA recibe catalogs.manage)
    await db.rows("INSERT INTO role_permissions (role_id, permission_id) SELECT id, (SELECT id FROM permissions WHERE code = 'catalogs.manage') FROM roles WHERE code = 'ARTISTA' ON DUPLICATE KEY UPDATE role_id = role_id");
    await db.rows("INSERT INTO users (id, first_name, last_name, email, email_verified_at) VALUES ('805', 'Artista', 'Promo', 'artista@promo.example', NOW())");
    await db.rows("INSERT INTO user_roles (user_id, role_id) SELECT '805', id FROM roles WHERE code = 'ARTISTA'");
    const resCatalogs = await request(ctx.app).get('/admin/promotions').set('Authorization', `Bearer ${ctx.tokens.sign('805', ['ARTISTA'])}`).expect(200);
    assert.ok(Array.isArray(resCatalogs.body.data));

    // d) Usuario con ambos permisos (ADMIN)
    const listRes = await call('get', '/admin/promotions', 'admin').expect(200);
    assert.ok(Array.isArray(listRes.body.data));
    assert.ok(listRes.body.pagination.total >= 6);

    // 3. Admin crea una nueva promoción
    const createRes = await call('post', '/admin/promotions', 'admin', {
        code: 'SUMMER25',
        description: '25% de descuento especial verano',
        discountType: 'PERCENTAGE',
        discountValue: 25.00,
        minOrderAmount: 1000.00,
        maxUses: 100,
        validFrom: '2026-06-01T00:00:00.000Z',
        validUntil: '2027-02-28T23:59:59.000Z',
    }).expect(201);

    const created = createRes.body.data;
    assert.equal(created.code, 'SUMMER25');
    assert.equal(created.discount_type, 'PERCENTAGE');
    assert.equal(created.discount_value, '25.00');
    assert.equal(created.max_uses, 100);

    // Verifica auditoría de creación
    const [auditCreate] = await db.rows("SELECT * FROM admin_audit_log WHERE action = 'PROMOTION_CREATED' AND entity_id = ?", [created.id]);
    assert.ok(auditCreate, 'La creación debe estar auditada');

    // 4. Admin obtiene detalle de la promoción
    const getRes = await call('get', `/admin/promotions/${created.id}`, 'admin').expect(200);
    assert.equal(getRes.body.data.id, created.id);
    assert.equal(getRes.body.data.code, 'SUMMER25');

    // 5. Admin actualiza descripción y límite de usos
    const updateRes = await call('put', `/admin/promotions/${created.id}`, 'admin', {
        description: '25% de descuento especial verano actualizado',
        maxUses: 200,
    }).expect(200);
    assert.equal(updateRes.body.data.description, '25% de descuento especial verano actualizado');
    assert.equal(updateRes.body.data.max_uses, 200);

    // 6. Eliminación de promoción sin redenciones: Hard delete
    const deleteRes = await call('delete', `/admin/promotions/${created.id}`, 'admin').expect(200);
    assert.deepEqual(deleteRes.body.data, { deleted: true, deactivated: false });
    const [deletedRow] = await db.rows('SELECT * FROM promotions WHERE id = ?', [created.id]);
    assert.equal(deletedRow, undefined);

    // 7. Eliminación de promoción con redenciones: Soft deactivation (status = INACTIVE) para proteger historial
    // Creamos y consumimos una promoción
    const usedPromoRes = await call('post', '/admin/promotions', 'admin', {
        code: 'USEDPROMO',
        description: 'Promo a ser consumida',
        discountType: 'FIXED',
        discountValue: 100.00,
        minOrderAmount: 0.00,
        maxUses: 10,
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2027-12-31T23:59:59.000Z',
    }).expect(201);
    const usedPromoId = usedPromoRes.body.data.id;

    // Usuario realiza compra con la promoción
    const purchaseRes = await call('post', '/purchases', 'user', {
        items: [{ ticketTypeId: '1', quantity: 1 }],
        promotionCode: 'USEDPROMO',
    }, 'key-audit-promo-1').expect(201);
    await call('post', `/purchases/${purchaseRes.body.data.id}/confirm`, 'user', { outcome: 'APPROVED' }).expect(200);

    // Admin intenta borrar la promoción consumida: el sistema la desactiva en vez de romper FKs
    const deactRes = await call('delete', `/admin/promotions/${usedPromoId}`, 'admin').expect(200);
    assert.deepEqual(deactRes.body.data, { deleted: false, deactivated: true });

    const [deactRow] = await db.rows('SELECT status FROM promotions WHERE id = ?', [usedPromoId]);
    assert.equal(deactRow.status, 'INACTIVE', 'La promoción con redenciones históricas se desactiva para conservar auditoría');
});

test('Validación de rangos de fecha en adminUpdatePromotion: rechaza fechas inválidas con HTTP 400', async () => {
    // 1. Modificar solo validUntil haciéndola anterior a valid_from existente -> 400
    const errUntil = await call('put', '/admin/promotions/100', 'admin', {
        validUntil: new Date(Date.now() - 2 * 86400000).toISOString(),
    }).expect(400);
    assert.equal(errUntil.body.error.code, 'INVALID_DATE_RANGE');

    // 2. Modificar solo validFrom haciéndola posterior a valid_until existente -> 400
    const errFrom = await call('put', '/admin/promotions/100', 'admin', {
        validFrom: new Date(Date.now() + 20 * 86400000).toISOString(),
    }).expect(400);
    assert.equal(errFrom.body.error.code, 'INVALID_DATE_RANGE');

    // 3. Modificar ambas con rango invertido -> 400
    const errBoth = await call('put', '/admin/promotions/100', 'admin', {
        validFrom: '2026-10-10T00:00:00Z',
        validUntil: '2026-10-05T00:00:00Z',
    }).expect(400);
    assert.equal(errBoth.body.error.code, 'INVALID_DATE_RANGE');

    // 4. Actualización válida de fecha -> 200
    const okUpdate = await call('put', '/admin/promotions/100', 'admin', {
        validUntil: '2027-01-01T00:00:00Z',
    }).expect(200);
    assert.ok(okUpdate.body.data.valid_until);
});
