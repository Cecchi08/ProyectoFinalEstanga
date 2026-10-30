// Retira los datos de demostración creados por scripts/demo-seed.mjs sin tocar datos reales.
// Alcance: las cuentas @demo.venti.example y todo lo que crearon (conciertos, organizaciones, espacios, reservas,
// compras, servicios, artista, auditoría). Por defecto solo informa (simulación); con --apply borra en una transacción.
// Si un usuario que no es demo tiene datos ligados a la demo (por ejemplo, compró una entrada de un concierto [DEMO]),
// se detiene y lo informa: esas filas solo se borran con --include-related, decidido por una persona.
// Local:  DEMO_DB_PASSWORD=... node --import tsx scripts/demo-unseed.mjs [--apply]
// Remota: DEMO_TARGET=remote DEMO_CONFIRM_HOST=... DEMO_CONFIRM_DATABASE=... node --import tsx scripts/demo-unseed.mjs [--apply]
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { DEMO_EMAIL_DOMAIN, resolveDemoTarget } from './demo-seed.mjs';

// ids are unsigned and start at 1: IN (0) matches nothing and keeps the SQL valid for empty sets.
const list = ids => (ids.length ? ids : ['0']);

async function collect(connection) {
    const ids = async (sql, params = []) => (await connection.query(sql, params))[0].map(row => String(row.id));
    const n = async (sql, params = []) => Number((await connection.query(sql, params))[0][0].n);
    const U = await ids('SELECT id FROM users WHERE email LIKE ?', [`%${DEMO_EMAIL_DOMAIN}`]);
    const C = await ids('SELECT id FROM concerts WHERE organizer_user_id IN (?)', [list(U)]);
    const TT = await ids('SELECT id FROM ticket_types WHERE concert_id IN (?)', [list(C)]);
    const ORG = await ids('SELECT id FROM organizations WHERE created_by_user_id IN (?)', [list(U)]);
    const E = await ids('SELECT id FROM establishments WHERE organization_id IN (?)', [list(ORG)]);
    const V = await ids('SELECT id FROM venues WHERE establishment_id IN (?)', [list(E)]);
    const SP = await ids('SELECT organization_id AS id FROM service_providers WHERE organization_id IN (?)', [list(ORG)]);
    const A = await ids('SELECT id FROM artist_profiles WHERE created_by_user_id IN (?)', [list(U)]);
    const Q = await ids('SELECT id FROM quotes WHERE requester_user_id IN (?) OR venue_id IN (?) OR requester_organization_id IN (?)', [list(U), list(V), list(ORG)]);
    const R = await ids('SELECT id FROM reservations WHERE user_id IN (?) OR venue_id IN (?) OR establishment_id IN (?) OR quote_id IN (?)', [list(U), list(V), list(E), list(Q)]);
    const O = await ids('SELECT id FROM orders WHERE user_id IN (?) OR id IN (SELECT order_id FROM order_items WHERE ticket_type_id IN (?))', [list(U), list(TT)]);
    const T = await ids(`SELECT id FROM tickets WHERE owner_user_id IN (?) OR ticket_type_id IN (?)
        OR order_item_id IN (SELECT id FROM order_items WHERE order_id IN (?))`, [list(U), list(TT), list(O)]);
    const SQ = await ids('SELECT id FROM service_quotes WHERE requester_user_id IN (?) OR organization_id IN (?)', [list(U), list(SP)]);
    const PR = await ids('SELECT id FROM profile_requests WHERE user_id IN (?)', [list(U)]);
    const sets = { U, C, TT, ORG, E, V, SP, A, Q, R, O, T, SQ, PR };
    // Audit rows of demo actors/targets or about demo entities.
    const auditWhere = `actor_user_id IN (?) OR target_user_id IN (?) OR (entity_type = 'CONCERT' AND entity_id IN (?)) OR (entity_type = 'ORDER' AND entity_id IN (?))
        OR (entity_type = 'ESTABLISHMENT' AND entity_id IN (?)) OR (entity_type = 'SERVICE_PROVIDER' AND entity_id IN (?)) OR (entity_type = 'PROFILE_REQUEST' AND entity_id IN (?))`;
    const auditParams = [list(U), list(U), list(C), list(O), list(E), list(SP), list(PR)];
    const notificationWhere = 'user_id IN (?) OR concert_id IN (?) OR order_id IN (?) OR reservation_id IN (?) OR quote_id IN (?)';
    const notificationParams = [list(U), list(C), list(O), list(R), list(Q)];
    const counts = {
        users: U.length, concerts: C.length, ticket_types: TT.length, orders: O.length, tickets: T.length, organizations: ORG.length,
        establishments: E.length, venues: V.length, service_providers: SP.length, service_quotes: SQ.length, quotes: Q.length,
        reservations: R.length, artist_profiles: A.length, profile_requests: PR.length,
        notifications: await n(`SELECT COUNT(*) AS n FROM notifications WHERE ${notificationWhere}`, notificationParams),
        admin_audit_log: await n(`SELECT COUNT(*) AS n FROM admin_audit_log WHERE ${auditWhere}`, auditParams),
    };
    // Rows of people who are not demo accounts that the removal would delete or change.
    const related = {
        orders: await n('SELECT COUNT(*) AS n FROM orders WHERE id IN (?) AND user_id NOT IN (?)', [list(O), list(U)]),
        tickets: await n('SELECT COUNT(*) AS n FROM tickets WHERE id IN (?) AND owner_user_id NOT IN (?)', [list(T), list(U)]),
        reservations: await n('SELECT COUNT(*) AS n FROM reservations WHERE id IN (?) AND user_id NOT IN (?)', [list(R), list(U)]),
        quotes: await n('SELECT COUNT(*) AS n FROM quotes WHERE id IN (?) AND requester_user_id NOT IN (?)', [list(Q), list(U)]),
        service_quotes: await n(`SELECT COUNT(*) AS n FROM service_quotes WHERE (id IN (?) AND requester_user_id NOT IN (?))
            OR (id NOT IN (?) AND (concert_id IN (?) OR reservation_id IN (?)))`, [list(SQ), list(U), list(SQ), list(C), list(R)]),
        concerts: await n('SELECT COUNT(*) AS n FROM concerts WHERE id NOT IN (?) AND (reservation_id IN (?) OR venue_id IN (?) OR organization_id IN (?))', [list(C), list(R), list(V), list(ORG)]),
        concert_artists: await n('SELECT COUNT(*) AS n FROM concert_artists WHERE artist_profile_id IN (?) AND concert_id NOT IN (?)', [list(A), list(C)]),
        concert_staff: await n('SELECT COUNT(*) AS n FROM concert_staff WHERE concert_id IN (?) AND user_id NOT IN (?)', [list(C), list(U)]),
        organization_members: await n('SELECT COUNT(*) AS n FROM organization_members WHERE organization_id IN (?) AND user_id NOT IN (?)', [list(ORG), list(U)]),
        artist_members: await n('SELECT COUNT(*) AS n FROM artist_members WHERE artist_profile_id IN (?) AND user_id NOT IN (?)', [list(A), list(U)]),
    };
    return { sets, counts, related, auditWhere, auditParams, notificationWhere, notificationParams };
}

// Order follows the foreign keys: children with NO ACTION first; cascades remove the rest.
async function remove(connection, found) {
    const { U, C, TT, ORG, E, V, SP, A, Q, R, O, T, SQ } = found.sets;
    const run = (sql, params) => connection.query(sql, params);
    await run('DELETE FROM ticket_validations WHERE ticket_id IN (?) OR concert_id IN (?)', [list(T), list(C)]);
    await run('DELETE FROM tickets WHERE id IN (?)', [list(T)]);
    await run('DELETE FROM order_payments WHERE order_id IN (?)', [list(O)]);
    await run(`DELETE FROM notifications WHERE ${found.notificationWhere}`, found.notificationParams);
    await run(`DELETE FROM admin_audit_log WHERE ${found.auditWhere}`, found.auditParams);
    await run('DELETE FROM orders WHERE id IN (?)', [list(O)]);
    await run('DELETE FROM service_quotes WHERE id IN (?)', [list(SQ)]);
    await run('DELETE FROM ticket_types WHERE id IN (?)', [list(TT)]);
    await run('DELETE FROM concerts WHERE id IN (?)', [list(C)]);
    await run('DELETE FROM payments WHERE reservation_id IN (?)', [list(R)]);
    await run('DELETE FROM reservations WHERE id IN (?)', [list(R)]);
    await run('DELETE FROM quotes WHERE id IN (?)', [list(Q)]);
    await run('DELETE FROM venues WHERE id IN (?)', [list(V)]);
    await run('DELETE FROM establishments WHERE id IN (?)', [list(E)]);
    await run('DELETE FROM service_providers WHERE organization_id IN (?)', [list(SP)]);
    await run('DELETE FROM organizations WHERE id IN (?)', [list(ORG)]);
    await run('DELETE FROM artist_profiles WHERE id IN (?)', [list(A)]);
    await run('DELETE FROM users WHERE id IN (?)', [list(U)]);
}

export async function demoFootprint(target) {
    const connection = await mysql.createConnection({ host: target.host, port: target.port, user: target.user, password: target.password, database: target.database });
    try {
        const { counts, related } = await collect(connection);
        return { counts, related };
    } finally {
        await connection.end();
    }
}

export async function unseedDemo(target, { apply = false, includeRelated = false } = {}) {
    const connection = await mysql.createConnection({ host: target.host, port: target.port, user: target.user, password: target.password, database: target.database });
    try {
        await connection.beginTransaction();
        const found = await collect(connection);
        const relatedTotal = Object.values(found.related).reduce((sum, value) => sum + value, 0);
        if (!apply || (relatedTotal && !includeRelated)) {
            await connection.rollback();
            return { applied: false, blockedByRelated: Boolean(apply && relatedTotal), counts: found.counts, related: found.related };
        }
        await remove(connection, found);
        const after = await collect(connection);
        if (Object.values(after.counts).some(Boolean)) throw new Error(`Quedaron filas demo: ${JSON.stringify(after.counts)}`);
        await connection.commit();
        return { applied: true, blockedByRelated: false, counts: found.counts, related: found.related };
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        await connection.end();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.env.DEMO_TARGET === 'remote') process.loadEnvFile('.env');
    const apply = process.argv.includes('--apply');
    unseedDemo(resolveDemoTarget(), { apply, includeRelated: process.argv.includes('--include-related') }).then(result => {
        console.log(result.applied ? 'Datos demo retirados.' : result.blockedByRelated
            ? 'No se borró nada: hay datos de usuarios reales ligados a la demo (ver "related"). Revisalos; solo se borran con --include-related.'
            : 'Simulación: no se borró nada. Agregá --apply para retirar estas filas.');
        console.table(result.counts);
        console.table(result.related);
        if (result.blockedByRelated) process.exitCode = 2;
    }).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
