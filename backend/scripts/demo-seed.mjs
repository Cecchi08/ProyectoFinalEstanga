// Datos de demostración de Venti: repetible e idempotente, separado de las migraciones estructurales.
// Todo pasa por la API real en el mismo proceso (bcrypt, validaciones, triggers, reglas de negocio y pagos simulados).
// Cada entidad se busca primero por una clave natural (email, nombre, Idempotency-Key fija) y solo se crea si falta.
// Todo lo creado es identificable: cuentas @demo.venti.example y nombres con el prefijo [DEMO]; scripts/demo-unseed.mjs lo retira.
// Local (por defecto): MySQL 127.0.0.1, nunca el puerto 3306 (XAMPP), base venti_demo*; se crea desde el esquema si falta.
//   DEMO_DB_PASSWORD=... node --import tsx scripts/demo-seed.mjs   (DEMO_DB_PORT por defecto 33316)
// Remota (solo con autorización y backup previo): DEMO_TARGET=remote usa la conexión de backend/.env y exige confirmar host y base
// exactos (DEMO_CONFIRM_HOST, DEMO_CONFIRM_DATABASE) y una contraseña propia DEMO_SEED_PASSWORD; nunca crea ni recrea bases.
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.config.js';
import { createPool, databaseConfig, MysqlDatabase } from '../src/config/db.config.js';
import { AccessTokens } from '../src/utils/jwt.util.js';
import { SCHEMA_FILE, schemaStatements } from './schema-statements.js';

// Contraseña pública solo para la base local; una base remota usa DEMO_SEED_PASSWORD (no versionada).
export const DEMO_PASSWORD = 'Venti-Demo-2026';
export const DEMO_EMAIL_DOMAIN = '@demo.venti.example';
export const DEMO_PREFIX = '[DEMO] ';
// Perfiles por cuenta. El primer ADMIN se asigna por SQL (nadie puede otorgarlo antes); el resto, por la API del ADMIN.
export const DEMO_ACCOUNTS = [
    { key: 'admin', email: 'admin@demo.venti.example', first: 'Ada', last: 'Romero', roles: ['ADMIN'] },
    { key: 'organizer', email: 'organizador@demo.venti.example', first: 'Martín', last: 'Quiroga', roles: ['ORGANIZADOR'] },
    { key: 'venue', email: 'espacios@demo.venti.example', first: 'Lucía', last: 'Benítez', roles: ['VENUE'] },
    { key: 'services', email: 'servicios@demo.venti.example', first: 'Diego', last: 'Ferreyra', roles: ['EMPRESA_SERVICIOS'] },
    { key: 'artist', email: 'artista@demo.venti.example', first: 'Valentina', last: 'Ríos', roles: ['ARTISTA'], selfService: true },
    { key: 'buyer', email: 'comprador@demo.venti.example', first: 'Sofía', last: 'Acosta', roles: [] },
    { key: 'buyer2', email: 'compradora2@demo.venti.example', first: 'Tomás', last: "O'Neill", roles: [] },
    { key: 'staff', email: 'staff@demo.venti.example', first: 'Joaquín', last: 'Paz', roles: [] },
    { key: 'applicant', email: 'solicitante@demo.venti.example', first: 'Camila', last: 'Núñez', roles: [] },
];

export function demoTarget(source = process.env) {
    const target = {
        host: source.DEMO_DB_HOST ?? '127.0.0.1', port: Number(source.DEMO_DB_PORT ?? '33316'),
        user: source.DEMO_DB_USER ?? 'root', password: source.DEMO_DB_PASSWORD ?? '', database: source.DEMO_DB_NAME ?? 'venti_demo',
    };
    if (!['127.0.0.1', 'localhost'].includes(target.host)) throw new Error('El seed de demostración solo corre contra una MySQL local (127.0.0.1); nunca contra Railway ni bases compartidas.');
    if (target.port === 3306) throw new Error('El puerto 3306 es la XAMPP/MariaDB local: el seed usa la MySQL 8 aislada (33316).');
    if (!/^venti_demo[a-z0-9_]*$/.test(target.database)) throw new Error('La base debe llamarse venti_demo*: el seed nunca escribe en venti ni en otras bases.');
    return target;
}

export function remoteDemoTarget(source = process.env) {
    // Fuera de Railway: la URL pública de backend/.env, como cualquier script local.
    const config = databaseConfig({ ...source, RAILWAY_SERVICE_ID: '', RAILWAY_ENVIRONMENT_ID: '' });
    if (source.DEMO_CONFIRM_HOST !== config.host || source.DEMO_CONFIRM_DATABASE !== config.database)
        throw new Error('Base remota: DEMO_CONFIRM_HOST y DEMO_CONFIRM_DATABASE deben repetir exactamente el host y la base de la conexión.');
    return { ...config, remote: true };
}
export const resolveDemoTarget = (source = process.env) => (source.DEMO_TARGET === 'remote' ? remoteDemoTarget(source) : demoTarget(source));
export function demoPassword(target, source = process.env) {
    if (!target.remote) return DEMO_PASSWORD;
    const password = source.DEMO_SEED_PASSWORD ?? '';
    if (password.length < 16) throw new Error('Base remota: definí DEMO_SEED_PASSWORD (16 caracteres o más, fuera del repositorio); la contraseña pública es solo local.');
    return password;
}

class Outbox { messages = []; enqueue(message) { this.messages.push(message); } }

export async function ensureDatabase(target) {
    const connection = await mysql.createConnection({ host: target.host, port: target.port, user: target.user, password: target.password });
    try {
        if (target.remote) {
            const [tables] = await connection.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('users', 'concerts', 'orders')", [target.database]);
            if (Number(tables[0].n) !== 3) throw new Error(`La base remota ${target.database} no tiene el esquema de Venti: el seed nunca la crea.`);
            return false;
        }
        const [rows] = await connection.query('SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [target.database]);
        if (rows.length) return false; // ya existe: no se recrea ni se borra nada
        const original = await readFile(SCHEMA_FILE, 'utf8');
        const schema = original.replace('CREATE DATABASE IF NOT EXISTS venti ', `CREATE DATABASE \`${target.database}\` `).replace('USE venti;', `USE \`${target.database}\`;`);
        for (const statement of schemaStatements(schema)) await connection.query(statement);
        return true;
    } finally {
        await connection.end();
    }
}

const COUNTED = ['users', 'user_roles', 'user_preferences', 'email_verification_tokens', 'profile_requests', 'admin_audit_log', 'artist_profiles', 'artist_members',
    'artist_profile_genres', 'organizations', 'organization_members', 'establishments', 'venues', 'venue_amenities', 'venue_photos', 'venue_opening_hours', 'venue_blocks',
    'quotes', 'quote_items', 'reservations', 'reservation_occupancies', 'reservation_status_history', 'payments', 'concerts', 'concert_genres', 'concert_artists',
    'concert_staff', 'ticket_types', 'orders', 'order_items', 'order_payments', 'tickets', 'ticket_validations', 'service_providers', 'service_offerings',
    'service_quotes', 'service_quote_items', 'recommendations', 'notifications'];

export async function seedDemo(target = demoTarget(), log = console.log, password = demoPassword(target)) {
    const created = await ensureDatabase(target);
    log(created ? `Base ${target.database} creada desde database/venti_shema2.sql.` : `Base ${target.database} existente: se completa sin borrar nada.`);
    const env = loadEnv({ NODE_ENV: 'development', DB_HOST: target.host, DB_PORT: String(target.port), DB_USER: target.user, DB_PASSWORD: target.password,
        DB_NAME: target.database, JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), BCRYPT_ROUNDS: '10', SMTP_HOST: '127.0.0.1', SMTP_FROM: 'demo@venti.example',
        AUTH_RATE_LIMIT_MAX: '100000' });
    const pool = createPool(env);
    const mailer = new Outbox();
    const tokens = new AccessTokens(env);
    const app = createApp({ env, database: new MysqlDatabase(pool), mailer, oauthClient: { identity: async () => { throw new Error('OAuth no se usa en el seed.'); } } });
    const rows = async (sql, params = []) => (await pool.query(sql, params))[0];
    const one = async (sql, params) => (await rows(sql, params))[0];
    const accounts = {};
    const roleCodes = async id => (await rows('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?', [id])).map(row => row.code);
    // Sesiones efímeras firmadas con el AccessTokens real: el seed no deja refresh tokens ni sesiones en la base.
    async function api(method, url, who, body, headers = {}) {
        let call = request(app)[method](url);
        if (who) call = call.set('Authorization', `Bearer ${tokens.sign(who.id, await roleCodes(who.id))}`);
        for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
        const response = await (body === undefined ? call : call.send(body));
        if (response.status >= 400) throw new Error(`${method.toUpperCase()} ${url} -> ${response.status} ${JSON.stringify(response.body?.error ?? response.body).slice(0, 300)}`);
        return response.body.data;
    }
    const base = Math.ceil(Date.now() / 3600000) * 3600000 + 21 * 86400000; // horas enteras, tres semanas adelante
    const at = hours => new Date(base + hours * 3600000).toISOString().replace('.000Z', 'Z');
    try {
        // 1. Cuentas: registro y verificación reales (bcrypt, tokens de verificación con hash).
        for (const account of DEMO_ACCOUNTS) {
            let user = await one('SELECT CAST(id AS CHAR) AS id FROM users WHERE email = ?', [account.email]);
            if (!user) {
                await api('post', '/auth/register', null, { first_name: account.first, last_name: account.last, email: account.email, password });
                const mail = [...mailer.messages].reverse().find(message => message.kind === 'verification' && message.to === account.email);
                await api('post', '/auth/verify-email', null, { token: mail.token });
                user = await one('SELECT CAST(id AS CHAR) AS id FROM users WHERE email = ?', [account.email]);
            }
            accounts[account.key] = { id: user.id, ...account };
        }
        const { admin, organizer, venue, services, artist, buyer, buyer2, staff, applicant } = accounts;
        // Catálogos por nombre (los ids pueden variar entre bases): piloto General Pueyrredon.
        const city = (await one("SELECT CAST(id AS CHAR) AS id FROM cities WHERE name = 'Mar del Plata'"))?.id;
        const rock = (await one("SELECT CAST(id AS CHAR) AS id FROM genres WHERE slug = 'rock'"))?.id;
        if (!city || !rock) throw new Error('Faltan los catálogos base (ciudad Mar del Plata, género rock).');
        await rows("INSERT IGNORE INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'ADMIN'", [admin.id]);
        for (const account of Object.values(accounts)) {
            for (const role of account.roles.filter(code => code !== 'ADMIN')) {
                if ((await roleCodes(account.id)).includes(role)) continue;
                if (account.selfService) await api('post', '/me/profiles', account, { role });
                else await api('post', `/admin/users/${account.id}/roles`, admin, { role, reason: 'Cuenta de demostración' });
            }
        }
        await api('patch', '/preferences', buyer2, { notifications_enabled: true, recommendations_enabled: false });
        if (!await one("SELECT id FROM profile_requests WHERE user_id = ? AND status = 'PENDING'", [applicant.id]))
            await api('post', '/me/profile-requests', applicant, { role: 'ORGANIZADOR', reason: 'Organizo ciclos de música en vivo en Mar del Plata.' });

        // 2. Perfil de artista publicado.
        let band = await one("SELECT CAST(id AS CHAR) AS id, status FROM artist_profiles WHERE stage_name = '[DEMO] Los Prismas'");
        if (!band) band = await api('post', '/artists', artist, { stage_name: '[DEMO] Los Prismas', bio: 'Rock costero con sintetizadores. Desde 2019 en la escena marplatense.', city_id: city, genre_ids: [rock] });
        if (band.status !== 'PUBLISHED') await api('post', `/artists/${band.id}/publish`, artist, {});

        // 3. Marketplace (piloto General Pueyrredon): organización, establecimiento aprobado, espacios publicados y un bloqueo.
        let org = await one("SELECT CAST(id AS CHAR) AS id FROM organizations WHERE name = '[DEMO] Puerto Sonoro SRL'");
        if (!org) org = await api('post', '/marketplace/organizations', venue, { name: '[DEMO] Puerto Sonoro SRL', tax_id: '30-71234567-9', phone: '+54 223 555-0101' });
        let place = await one("SELECT CAST(id AS CHAR) AS id, status FROM establishments WHERE name = '[DEMO] Complejo Puerto Sonoro'");
        if (!place) place = await api('post', '/marketplace/establishments', venue, { organization_id: org.id, city_id: city, name: '[DEMO] Complejo Puerto Sonoro',
            address_line: 'Av. Martínez de Hoz 4100', postal_code: 'B7600', phone: '+54 223 555-0102', website: 'https://puertosonoro.example',
            description: 'Sala principal y sala de ensayo a metros del puerto. Accesible; camarines y carga y descarga.' });
        if (place.status !== 'PUBLISHED') {
            if (place.status !== 'PENDING_REVIEW') await api('post', `/marketplace/establishments/${place.id}/publish`, venue, {});
            await api('post', `/marketplace/establishments/${place.id}/approve`, admin, {});
        }
        const ensureVenue = async (name, body) => {
            let found = await one('SELECT CAST(id AS CHAR) AS id, status FROM venues WHERE name = ? AND establishment_id = ?', [name, place.id]);
            if (!found) found = await api('post', `/marketplace/establishments/${place.id}/venues`, venue, { name, ...body });
            if (found.status !== 'PUBLISHED') await api('post', `/marketplace/venues/${found.id}/publish`, venue, {});
            return found;
        };
        const hall = await ensureVenue('[DEMO] Sala Mayor', { venue_type_code: 'CONCERT_HALL', capacity_standing: 600, capacity_seated: 350, price_per_hour: 45000,
            amenities: ['STAGE', 'PA_SYSTEM'], photos: [{ url: 'https://img.example/sala-mayor.jpg', is_cover: true }] });
        const room = await ensureVenue('[DEMO] Sala de Ensayo B', { venue_type_code: 'REHEARSAL_ROOM', capacity_standing: 30, price_per_hour: 6500, min_booking_minutes: 120,
            amenities: ['PA_SYSTEM', 'BACKLINE'], opening_hours: [{ day_of_week: 1, opens_at: '10:00', closes_at: '23:00' }] });
        if (!await one("SELECT id FROM venue_blocks WHERE venue_id = ? AND description = '[DEMO] Mantenimiento de escenario'", [room.id]))
            await api('post', `/marketplace/establishments/${place.id}/blocks`, venue, { venue_id: room.id, reason: 'MAINTENANCE', description: '[DEMO] Mantenimiento de escenario',
                starts_at: at(24 * 3), ends_at: at(24 * 3 + 4) });

        // 4. Reserva directa del organizador: HOLD -> pago simulado -> aceptada por el espacio (CONFIRMED).
        let booking = await one("SELECT CAST(id AS CHAR) AS id, status_code FROM reservations WHERE event_name = '[DEMO] Noche Prismas en Sala Mayor' AND user_id = ?", [organizer.id]);
        if (!booking) booking = await api('post', '/marketplace/reservations', organizer, { venue_id: hall.id, event_name: '[DEMO] Noche Prismas en Sala Mayor',
            event_start_at: at(20), event_end_at: at(25), expected_attendance: 450 });
        booking = await one('SELECT CAST(id AS CHAR) AS id, status_code FROM reservations WHERE id = ?', [booking.id]);
        if (booking.status_code === 'HOLD') {
            if (!await one("SELECT id FROM payments WHERE reservation_id = ? AND status = 'APPROVED'", [booking.id]))
                await api('post', `/marketplace/reservations/${booking.id}/payments`, organizer, { outcome: 'APPROVED' });
            await api('post', `/marketplace/reservations/${booking.id}/accept`, venue, {});
        }
        // Presupuesto del establecimiento completo pedido por la artista y respondido por el espacio (queda SENT).
        let venueQuote = await one("SELECT CAST(id AS CHAR) AS id, status FROM quotes WHERE event_name = '[DEMO] Presentación del disco Prismas'");
        if (!venueQuote) venueQuote = await api('post', '/marketplace/quotes', artist, { venue_id: hall.id, occupancy_mode: 'ESTABLISHMENT', event_name: '[DEMO] Presentación del disco Prismas',
            event_start_at: at(24 * 10 + 20), event_end_at: at(24 * 10 + 24), setup_start_at: at(24 * 10 + 17), teardown_end_at: at(24 * 10 + 25), expected_attendance: 500 });
        if (venueQuote.status === 'REQUESTED')
            await api('post', `/marketplace/quotes/${venueQuote.id}/respond`, venue, { items: [{ description: 'Complejo completo con técnica', quantity: 1, unit_price: 380000 }],
                fees: 15000, discount: 20000, valid_until: at(24 * 5) });

        // 5. Conciertos: uno en el espacio reservado, uno en un lugar de texto libre y un borrador.
        const ensureConcert = async (name, body) => {
            let found = await one('SELECT CAST(id AS CHAR) AS id, status FROM concerts WHERE title = ? AND organizer_user_id = ?', [name, organizer.id]);
            if (!found) found = await api('post', '/concerts', organizer, { name, genre_ids: [rock], ...body });
            return found;
        };
        const tickets = (start, price) => [
            { name: 'General', price, stock_total: 400, sale_end: at(start - 2), max_per_purchase: 6 },
            { name: 'Campo VIP', price: price * 2, stock_total: 50, sale_end: at(start - 2), max_per_purchase: 2 },
        ];
        const main = await ensureConcert('[DEMO] Los Prismas en vivo', { artist_name: '[DEMO] Los Prismas', artist_profile_ids: [band.id], description: 'Presentación del nuevo disco. Apertura de puertas 20 h.',
            start_datetime: at(21), end_datetime: at(24), reservation_id: booking.id, ticket_types: tickets(21, 18000) });
        const open = await ensureConcert('[DEMO] Ciclo Acústico del Puerto', { artist_name: '[DEMO] Mar Adentro Trío', description: 'Ciclo de música acústica junto al mar.',
            start_datetime: at(24 * 7 + 21), end_datetime: at(24 * 7 + 23), venue_name: 'Centro Cultural Villa Victoria', address_line: 'Matheu 1851', city_id: city,
            ticket_types: tickets(24 * 7 + 21, 9500) });
        await ensureConcert('[DEMO] Festival de Otoño (borrador)', { artist_name: '[DEMO] Varios artistas', start_datetime: at(24 * 30 + 18), venue_name: 'Playa Grande', city_id: city });
        for (const concert of [main, open]) {
            if ((await one('SELECT status FROM concerts WHERE id = ?', [concert.id])).status !== 'PUBLISHED') await api('post', `/concerts/${concert.id}/publish`, organizer, {});
        }
        if (!await one('SELECT 1 AS ok FROM concert_staff WHERE concert_id = ? AND user_id = ?', [main.id, staff.id]))
            await api('post', `/concerts/${main.id}/staff`, organizer, { email: staff.email });

        // 6. Compras con pago simulado (Idempotency-Key fija: re-ejecutar devuelve la misma compra).
        const typeOf = async (concertId, name) => (await one('SELECT CAST(id AS CHAR) AS id FROM ticket_types WHERE concert_id = ? AND name = ?', [concertId, name])).id;
        const purchase = (who, key, items) => api('post', '/purchases', who, { items }, { 'Idempotency-Key': key });
        const confirmed = await purchase(buyer, 'demo-compra-0001', [{ ticketTypeId: await typeOf(main.id, 'General'), quantity: 2 }]);
        if (confirmed.status === 'PENDING') await api('post', `/purchases/${confirmed.id}/confirm`, buyer, { outcome: 'APPROVED' });
        await purchase(buyer2, 'demo-compra-0002', [{ ticketTypeId: await typeOf(open.id, 'General'), quantity: 1 }]); // queda PENDING (o EXPIRED si pasó la retención)
        const refunded = await purchase(buyer2, 'demo-compra-0003', [{ ticketTypeId: await typeOf(main.id, 'Campo VIP'), quantity: 1 }]);
        if (refunded.status === 'PENDING') await api('post', `/purchases/${refunded.id}/confirm`, buyer2, { outcome: 'APPROVED' });
        if ((await one('SELECT status FROM orders WHERE id = ?', [refunded.id])).status === 'CONFIRMED') await api('post', `/purchases/${refunded.id}/cancel`, buyer2, {});
        // El staff asignado valida una de las entradas confirmadas por QR.
        const ticket = await one(`SELECT t.qr_token, t.status FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id WHERE oi.order_id = ? ORDER BY t.id LIMIT 1`, [confirmed.id]);
        if (ticket.status === 'VALID') await api('post', '/tickets/validate', staff, { concertId: main.id, qrToken: ticket.qr_token });

        // 7. Servicios: empresa verificada con un servicio publicado; cotización pedida, respondida y aceptada.
        // service_providers usa organization_id como clave; el nombre vive en organizations.
        const providerRow = 'SELECT CAST(sp.organization_id AS CHAR) AS id, sp.status, sp.is_verified FROM service_providers sp JOIN organizations o ON o.id = sp.organization_id';
        let company = await one(`${providerRow} WHERE o.name = '[DEMO] Luz y Sonido Atlántico'`);
        if (!company) company = await api('post', '/services/providers', services, { name: '[DEMO] Luz y Sonido Atlántico', city_id: city, coverage_area: 'Partido de General Pueyrredon',
            phone: '+54 223 555-0199', email: 'contacto@lsatlantico.example', description: 'Sonido e iluminación para shows de hasta 2.000 personas.' });
        let offer = await one("SELECT CAST(id AS CHAR) AS id, status FROM service_offerings WHERE name = '[DEMO] Sistema de sonido line array' AND organization_id = ?", [company.id]);
        if (!offer) offer = await api('post', `/services/providers/${company.id}/offerings`, services, { category_code: 'SOUND', name: '[DEMO] Sistema de sonido line array',
            pricing_unit: 'EVENT', base_price: 250000, equipment: '12 cajas line array, 4 subwoofers, consola digital 48 canales.' });
        if (offer.status !== 'PUBLISHED') await api('post', `/services/offerings/${offer.id}/publish`, services, {});
        company = await one(`${providerRow} WHERE sp.organization_id = ?`, [company.id]);
        if (company.status !== 'PUBLISHED') await api('post', `/services/providers/${company.id}/publish`, services, {});
        if (!Number(company.is_verified)) await api('post', `/services/providers/${company.id}/verify`, admin, {});
        let serviceQuote = await one("SELECT CAST(id AS CHAR) AS id, status FROM service_quotes WHERE event_name = '[DEMO] Los Prismas en vivo - sonido'");
        if (!serviceQuote) serviceQuote = await api('post', '/services/quotes', organizer, { offering_id: offer.id, event_name: '[DEMO] Los Prismas en vivo - sonido',
            event_start_at: at(19), event_end_at: at(25), concert_id: main.id });
        if (serviceQuote.status === 'REQUESTED') await api('post', `/services/quotes/${serviceQuote.id}/respond`, services, {
            items: [{ description: 'Sonido line array con operador', quantity: 1, unit_price: 250000 }], fees: 12000, discount: 0, valid_until: at(-24 * 7) });
        if ((await one('SELECT status FROM service_quotes WHERE id = ?', [serviceQuote.id])).status === 'SENT') await api('post', `/services/quotes/${serviceQuote.id}/accept`, organizer, {});

        // 8. Recomendaciones de Venti Discover para la compradora (las genera la API al consultarlas).
        await api('get', '/recommendations', buyer);

        // In a shared database only the demo rows are counted (the footprint demo-unseed.mjs would remove).
        const { demoFootprint } = await import('./demo-unseed.mjs');
        const footprint = await demoFootprint(target);
        const counts = {};
        if (target.remote) Object.assign(counts, footprint.counts);
        else for (const table of COUNTED) counts[table] = Number((await one(`SELECT COUNT(*) AS total FROM \`${table}\``)).total);
        return { database: target.database, created, counts, footprint, accounts: DEMO_ACCOUNTS.map(({ email, roles }) => ({ email, roles: roles.length ? roles : ['COMPRADOR'] })) };
    } finally {
        await pool.end();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.env.DEMO_TARGET === 'remote') process.loadEnvFile('.env');
    const target = resolveDemoTarget();
    seedDemo(target).then(summary => {
        console.log(`\nSeed de demostración completo en ${summary.database}. Contraseña de todas las cuentas: ${target.remote ? 'la de DEMO_SEED_PASSWORD' : DEMO_PASSWORD}`);
        console.table(summary.accounts);
        console.table(summary.counts);
    }).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
