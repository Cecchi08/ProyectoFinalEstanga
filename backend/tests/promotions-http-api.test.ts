// Verificación HTTP integral de creación, listado y validación de cupones (TESTVENTI).
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.config.js';
import { AccessTokens } from '../src/utils/jwt.util.js';
import type { Database } from '../types/management.types.ts';

import { MysqlAuthRepository } from '../src/repositories/mysql.repository.js';

// Configuración de entorno de prueba aislado (sin conexión a bases remotas ni Aiven)
const env = loadEnv({
    NODE_ENV: 'test',
    DB_HOST: '127.0.0.1',
    DB_PORT: '33316',
    DB_USER: 'test_user',
    DB_PASSWORD: 'test_password',
    DB_NAME: 'venti_test',
    JWT_ACCESS_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
    BCRYPT_ROUNDS: '10',
    SMTP_HOST: '127.0.0.1',
    SMTP_FROM: 'noreply@venti.example',
});

const tokens = new AccessTokens(env);

// Conexión aislada en memoria que satisface los métodos SQL de los repositorios reales
function createIsolatedDatabase() {
    const rowsMap = new Map<number, any>();
    let autoId = 1;

    const fakeConnection = {
        async execute(sql: string, params: any[] = []): Promise<any[]> {
            // Usuario autenticado
            if (sql.includes('FROM users WHERE id = ?')) {
                const id = String(params[0]);
                return [[{
                    id,
                    email: id === '101' ? 'admin@venti.example' : 'buyer@venti.example',
                    first_name: id === '101' ? 'Admin' : 'Comprador',
                    last_name: 'Test',
                    status: 'ACTIVE',
                    is_active: 1,
                    email_verified_at: new Date('2026-01-01'),
                }]];
            }

            // Permisos de usuario según id
            if (sql.includes('FROM user_roles') || sql.includes('role_permissions')) {
                const id = String(params[0]);
                if (id === '101') {
                    return [[
                        { role_order: 1, role: 'ADMIN', permission: 'orders.read_all' },
                        { role_order: 1, role: 'ADMIN', permission: 'catalogs.manage' },
                        { role_order: 1, role: 'ADMIN', permission: 'tickets.purchase' },
                        { role_order: 1, role: 'ADMIN', permission: 'users.manage' },
                    ]];
                }
                return [[
                    { role_order: 1, role: 'COMPRADOR', permission: 'tickets.purchase' },
                ]];
            }

            // Búsqueda de cupón por código
            if (sql.includes('FROM promotions WHERE code = ?')) {
                const code = String(params[0]).toUpperCase();
                const found = Array.from(rowsMap.values()).find(r => r.code === code);
                return [found ? [found] : []];
            }

            // Creación de cupón
            if (sql.includes('INSERT INTO promotions')) {
                const id = autoId++;
                const row = {
                    id: String(id),
                    code: String(params[0]),
                    description: String(params[1]),
                    discount_type: String(params[2]),
                    discount_value: String(params[3]),
                    min_order_amount: String(params[4]),
                    concert_id: params[5] ? String(params[5]) : null,
                    max_uses: params[6] !== null && params[6] !== undefined ? Number(params[6]) : null,
                    current_uses: 0,
                    status: 'ACTIVE',
                    valid_from: new Date(params[7]),
                    valid_until: new Date(params[8]),
                    created_at: new Date(),
                    updated_at: new Date(),
                };
                rowsMap.set(id, row);
                return [{ insertId: id, affectedRows: 1 }];
            }

            // Búsqueda de cupón por ID
            if (sql.includes('WHERE p.id = ?') || sql.includes('WHERE id = ?')) {
                const id = Number(params[0]);
                const found = rowsMap.get(id);
                return [found ? [found] : []];
            }

            // Conteo total para paginación
            if (sql.includes('SELECT COUNT(*) as c FROM promotions')) {
                return [[{ c: rowsMap.size }]];
            }

            // Listado de cupones
            if (sql.includes('FROM promotions p')) {
                return [Array.from(rowsMap.values()).map(r => ({ ...r, concert_title: null }))];
            }

            // Auditoría administrativa
            if (sql.includes('INSERT INTO admin_audit_log') || sql.includes('audit')) {
                return [{ insertId: 1, affectedRows: 1 }];
            }

            // Hora del servidor
            if (sql.includes('NOW()') || sql.includes('UTC_TIMESTAMP')) {
                return [[{ now: new Date() }]];
            }

            return [[]];
        },
    };

    const mockDb: Database = {
        async read<T>(work: (repo: any) => Promise<T>): Promise<T> {
            const authRepo = new MysqlAuthRepository(fakeConnection as any);
            return work(authRepo);
        },
        async transaction<T>(work: (repo: any) => Promise<T>): Promise<T> {
            const authRepo = new MysqlAuthRepository(fakeConnection as any);
            return work(authRepo);
        },
    };

    return { db: mockDb, rowsMap };
}

test('Flujo HTTP completo de creación, consulta y validación de TESTVENTI vía API', async () => {
    const { db } = createIsolatedDatabase();
    const app = createApp({
        env,
        database: db,
        mailer: { enqueue: () => {}, close: async () => {} } as any,
    });

    // Tokens firmados válidos (IDs numéricos conformes con RFC de claims)
    const adminToken = tokens.sign('101', ['ADMIN']);
    const buyerToken = tokens.sign('102', ['COMPRADOR']);

    // 1. Comprobar que inicialmente TESTVENTI no existe en el listado administrativo
    const initialListRes = await request(app)
        .post('/admin/promotions/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

    assert.equal(initialListRes.status, 200, `Listado inicial falló: ${JSON.stringify(initialListRes.body)}`);
    assert.equal(initialListRes.body.success, true);
    const existingPromo = initialListRes.body.data.find((p: any) => p.code === 'TESTVENTI');
    assert.equal(existingPromo, undefined, 'TESTVENTI no debe existir previamente');

    // 2. Creación de la promoción TESTVENTI mediante el endpoint HTTP administrativo
    const createPayload = {
        code: 'TESTVENTI',
        description: 'Descuento oficial del 10% Venti Test',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minOrderAmount: 0,
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2027-12-31T23:59:59.000Z',
    };

    const createRes = await request(app)
        .post('/admin/promotions/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPayload);

    assert.equal(createRes.status, 201, `Error en creación: ${JSON.stringify(createRes.body)}`);
    assert.equal(createRes.body.success, true);
    assert.equal(createRes.body.data.code, 'TESTVENTI');
    assert.equal(createRes.body.data.status, 'ACTIVE');
    assert.equal(createRes.body.data.discount_type, 'PERCENTAGE');
    assert.equal(createRes.body.data.discount_value, '10.00');

    // 3. Verificación de no duplicación: reintentar la creación debe responder 409 PROMOTION_EXISTS
    const duplicateRes = await request(app)
        .post('/admin/promotions/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPayload);

    assert.equal(duplicateRes.status, 409);
    assert.equal(duplicateRes.body.error.code, 'PROMOTION_EXISTS');

    // 4. Comprobar que aparece en el listado administrativo tras la creación
    const listRes = await request(app)
        .post('/admin/promotions/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

    assert.equal(listRes.status, 200);
    const foundPromo = listRes.body.data.find((p: any) => p.code === 'TESTVENTI');
    assert.ok(foundPromo, 'TESTVENTI debe aparecer en el listado administrativo');
    assert.equal(foundPromo.status, 'ACTIVE');

    // 5. Comprobar que POST /admin/promotions sin body lista correctamente (compatibilidad HttpClient)
    const listViaPostRes = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

    assert.equal(listViaPostRes.status, 200);
    assert.ok(listViaPostRes.body.data.some((p: any) => p.code === 'TESTVENTI'));

    // 6. Comprobar que el endpoint de validación de cupones acepta TESTVENTI y calcula el 10%
    // Compra con subtotal de $200.00 (20000 centavos) -> Descuento del 10% = $2000.00, Total = $18000.00
    const validateRes = await request(app)
        .post('/promotions/validate')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
            code: 'TESTVENTI',
            subtotal: 20000,
        });

    assert.equal(validateRes.status, 200, `Error en validación: ${JSON.stringify(validateRes.body)}`);
    assert.equal(validateRes.body.success, true);
    assert.equal(validateRes.body.data.code, 'TESTVENTI');
    assert.equal(validateRes.body.data.discount, '2000.00');
    assert.equal(validateRes.body.data.total, '18000.00');

    // 7. Verificación de seguridad de permisos: un usuario sin rol ADMIN no puede crear promociones
    const unauthorizedRes = await request(app)
        .post('/admin/promotions/create')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(createPayload);

    assert.equal(unauthorizedRes.status, 403, 'Un COMPRADOR no debe tener permiso de crear promociones');
});
