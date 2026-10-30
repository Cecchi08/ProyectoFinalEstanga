import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';
import { NotificationsRepository } from '../src/repositories/notifications.repository.ts';
import { CommerceService } from '../src/services/commerce.service.ts';

const db = new TestDatabase(); let ctx;
const users = { user: '101', other: '102', organizer: '103', outsider: '104', admin: '105', staff: '106' };
// 'staff' is a COMPRADOR assigned to concert 1 through concert_staff.
const roles = { user: 'COMPRADOR', other: 'COMPRADOR', organizer: 'ORGANIZADOR', outsider: 'ORGANIZADOR', admin: 'ADMIN', staff: 'COMPRADOR' };
const call = (method, path, role = 'user', body) => {
    const req = request(ctx.app)[method](path);
    if (method === 'post' && path === '/purchases') req.set('Idempotency-Key', randomUUID());
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(users[role], [roles[role]])}`);
    return body === undefined ? req : req.send(body);
};
async function purchase(quantity = 2, type = '1', role = 'user', confirm = true) {
    const { body } = await call('post', '/purchases', role, { items: [{ ticketTypeId: type, quantity }] }).expect(201);
    if (confirm) await call('post', `/purchases/${body.data.id}/confirm`, role).expect(200);
    return body.data;
}
const inbox = async (role = 'user', suffix = '') => (await call('get', `/notifications${suffix}`, role).expect(200)).body;
const stats = async (role = 'organizer', suffix = '') => (await call('get', `/${role === 'admin' ? 'admin' : 'organizer'}/statistics${suffix}`, role).expect(200)).body.data;
before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [role, id] of Object.entries(users)) {
        await db.rows('INSERT INTO users(id,first_name,last_name,email,email_verified_at) VALUES (?,?,?,?,NOW())', [id, role, 'Test', `${role}@insights.example`]);
        await db.rows('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [id, roles[role]]);
    }
    // Seeded catalogs: city 1 = Mar del Plata, genre 1 = Rock.
    for (const [id, owner] of [['1','103'],['2','104'],['3','103']]) {
        await db.rows(`INSERT INTO concerts(id,organizer_user_id,title,slug,artist_name,venue_name,city_id,starts_at,status,published_at)
            VALUES (?,?,?,?,'Artista','Sala',1,DATE_ADD(NOW(), INTERVAL 30 DAY),'PUBLISHED',NOW())`, [id, owner, `Show ${id}`, `show-${id}`]);
        await db.rows('INSERT INTO concert_genres(concert_id,genre_id) VALUES (?,1)', [id]);
        await db.rows('INSERT INTO ticket_types(id,concert_id,name,price,quantity_total) VALUES (?,?,?,10.25,20)', [id,id,`General ${id}`]);
    }
    await db.rows('INSERT INTO ticket_types(id,concert_id,name,price,quantity_total) VALUES (4,1,\'VIP\',30.50,10)');
    await db.rows('INSERT INTO concert_staff(concert_id,user_id) VALUES (1,106)');
});

test('notifications authenticate, isolate own list and reject client ownership filters', async () => {
    await purchase(); await purchase(1,'1','other');
    await call('get','/notifications',null).expect(401);
    await call('patch','/notifications/read-all',null).expect(401);
    await call('get','/notifications?user_id=102').expect(422);
    const own = await inbox(), other = await inbox('other');
    assert.equal(own.data.items.length,1); assert.equal(own.data.unread_count,1);
    assert.notEqual(own.data.items[0].id,other.data.items[0].id);
    await call('patch',`/notifications/${other.data.items[0].id}/read`).expect(404);
    assert.equal((await inbox('other')).data.unread_count,1);
    assert.equal((await inbox('admin')).data.items.length,0);
    assert.equal((await call('get','/notifications')).headers['cache-control'],'no-store');
});
test('individual read is idempotent; read-all affects all own pages only', async () => {
    for (let index=0; index<3; index++) await purchase(1);
    await purchase(1,'1','other');
    const first = (await inbox('user','?limit=1')).data.items[0];
    for (let index=0;index<2;index++) await call('patch',`/notifications/${first.id}/read`).expect(200);
    const marked = (await inbox()).data.items.find(item => item.id === first.id);
    assert.ok(marked.read_at); assert.equal((await inbox()).data.unread_count,2);
    await call('patch','/notifications/read-all').expect(200);
    assert.equal((await inbox()).data.unread_count,0); assert.equal((await inbox('other')).data.unread_count,1);
    assert.equal((await inbox('user','?limit=1&page=2')).pagination.total,3);
});
const types = ['PURCHASE_CONFIRMED','CONCERT_REMINDER','CONCERT_UPDATED','CONCERT_CANCELLED','RECOMMENDATION','POST_EVENT','QUOTE_UPDATE','RESERVATION_UPDATE','SYSTEM'];
test('every notification type of the schema ENUM can be listed and read', async () => {
    for (const type of types) await db.rows('INSERT INTO notifications(user_id,type,title,body) VALUES (101,?,?,?)', [type, type, type]);
    const result = await inbox(); assert.equal(result.data.items.length,types.length);
    assert.deepEqual(result.data.items.map(item => item.type).sort(), [...types].sort());
    assert.ok(result.data.items.some(item => item.type === 'CONCERT_REMINDER'));
    await call('patch','/notifications/read-all').expect(200);
});
test('service quote notices expose service_quote_id from data; others return null', async () => {
    await db.rows("INSERT INTO notifications(user_id,type,title,body,data) VALUES (101,'QUOTE_UPDATE','Cotización','x',?)", [JSON.stringify({ service_quote_id: '77' })]);
    await db.rows("INSERT INTO notifications(user_id,type,title,body) VALUES (101,'SYSTEM','Aviso','x')");
    const items = (await inbox()).data.items;
    assert.equal(items.find(item => item.type === 'QUOTE_UPDATE').service_quote_id, '77');
    assert.equal(items.find(item => item.type === 'SYSTEM').service_quote_id, null);
});
test('preferences validate booleans, preserve fields, isolate users and default missing rows', async () => {
    assert.deepEqual((await call('get','/preferences')).body.data,{recommendations_enabled:true,notifications_enabled:true});
    await call('patch','/preferences','user',{notifications_enabled:false}).expect(200);
    await call('patch','/preferences','user',{recommendations_enabled:false}).expect(200);
    assert.deepEqual((await call('get','/preferences')).body.data,{recommendations_enabled:false,notifications_enabled:false});
    assert.equal((await call('get','/preferences','other')).body.data.notifications_enabled,true);
    for (const body of [{},{notifications_enabled:'false'},{notifications_enabled:false,user_id:'102'}]) await call('patch','/preferences','user',body).expect(422);
    await call('patch','/preferences','user',{notifications_enabled:true,recommendations_enabled:true}).expect(200);
});
test('confirmation generates once under concurrent retries; failed reservation emits nothing', async () => {
    const p = await purchase(2,'1','user',false);
    assert.equal((await inbox()).data.items.length,0);
    const responses = await Promise.all([call('post',`/purchases/${p.id}/confirm`),call('post',`/purchases/${p.id}/confirm`)]);
    assert.deepEqual(responses.map(r => r.status).sort(),[200,409]);
    const result = (await inbox()).data.items;
    assert.equal(result.length,1); assert.equal(result[0].purchase_id,p.id); assert.equal(result[0].type,'PURCHASE_CONFIRMED');
});
test('notification insert failure rolls back confirmation and issued tickets', async t => {
    const p = await purchase(2,'1','user',false);
    t.mock.method(NotificationsRepository.prototype,'purchase',async () => { throw new Error('notification failure'); });
    await assert.rejects(new CommerceService(db.db).transition(p.id,'confirm',{id:'101',roles:['COMPRADOR'],permissions:[]}),/notification failure/);
    assert.equal((await call('get',`/purchases/${p.id}`)).body.data.status,'PENDING');
    assert.equal((await db.rows('SELECT id FROM tickets')).length,0);
});
test('OFF suppresses Discover notices; critical purchase and cancellation remain', async () => {
    await call('patch','/preferences','user',{notifications_enabled:false}).expect(200);
    await call('get','/recommendations').expect(200);
    await call('post','/concerts/1/cancel','organizer').expect(200);
    assert.equal((await inbox()).data.items.length,0);
    await purchase(1,'3');
    await call('post','/concerts/3/cancel','organizer').expect(200);
    assert.deepEqual((await inbox()).data.items.map(item => item.type).sort(),['CONCERT_CANCELLED','PURCHASE_CONFIRMED']);
});
test('Discover generates one recommendation per user/concert across concurrent requests', async () => {
    const results = await Promise.all(Array.from({length:4},() => call('get','/recommendations')));
    for (const result of results) assert.equal(result.status,200,JSON.stringify(result.body));
    const items = (await inbox()).data.items;
    assert.equal(items.length,1); assert.equal(items[0].type,'RECOMMENDATION'); assert.ok(items[0].concert_id);
    await call('patch','/preferences','other',{recommendations_enabled:false}).expect(200);
    await call('get','/recommendations','other').expect(200);
    assert.equal((await inbox('other')).data.items.length,0);
});
test('Discover, preference updates and concert cancellation can run concurrently', async () => {
    const responses = await Promise.all([
        ...Array.from({length:5},() => call('get','/recommendations')),
        call('patch','/preferences','user',{notifications_enabled:false}),
        call('post','/concerts/1/cancel','organizer'),
    ]);
    for (const response of responses) assert.equal(response.status,200,JSON.stringify(response.body));
    const count = (await inbox()).data.items.filter(item => item.type === 'RECOMMENDATION' && item.concert_id === '1').length;
    assert.ok(count <= 1);
});
test('cancellation reaches each buyer exactly once without duplicate audiences', async () => {
    await purchase(); await purchase(1); await purchase(1,'4','other');
    const responses = await Promise.all([call('post','/concerts/1/cancel','organizer'),call('post','/concerts/1/cancel','organizer')]);
    for (const result of responses) assert.equal(result.status,200);
    assert.equal((await inbox()).data.items.filter(n => n.type === 'CONCERT_CANCELLED').length,1);
    assert.equal((await inbox('other')).data.items.filter(n => n.type === 'CONCERT_CANCELLED').length,1);
    assert.equal((await inbox('staff')).data.items.length,0);
});
test('relevant changes emit once; identical PATCH emits nothing; later distinct changes emit again', async () => {
    await purchase();
    const start = new Date(Date.now()+35*86400000).toISOString();
    for (let index=0;index<2;index++) await call('patch','/concerts/1','organizer',{start_datetime:start}).expect(200);
    // Both kinds of change map to the schema's CONCERT_UPDATED type; the title tells them apart.
    const updates = async title => (await inbox()).data.items.filter(n => n.type === 'CONCERT_UPDATED' && n.title === title).length;
    assert.equal(await updates('Cambio de horario'),1);
    await call('patch','/concerts/1','organizer',{description:'Nuevas instrucciones'}).expect(200);
    assert.equal(await updates('Información del concierto'),1);
    await call('patch','/concerts/1','outsider',{description:'Ajeno'}).expect(403);
});
test('statistics require database roles, deny COMPRADOR (including staff) and ignore no client owner', async () => {
    for (const path of ['/organizer/statistics','/organizer/concerts/1/statistics','/admin/statistics']) {
        await call('get',path,null).expect(401);
        for (const role of ['user','staff']) await call('get',path,role).expect(403);
    }
    await call('get','/admin/statistics','organizer').expect(403);
    await call('get','/organizer/statistics?organizer_id=104','organizer').expect(422);
    await call('get','/organizer/concerts/2/statistics','organizer').expect(404);
    await call('get','/organizer/statistics?concert_id=2','organizer').expect(404);
});
test('own/global aggregates avoid join multiplication and use historical item prices', async () => {
    await purchase(3); await purchase(2,'4'); await purchase(4,'2','other');
    await db.rows('UPDATE ticket_types SET price=999 WHERE id IN (1,4)');
    const tickets = (await call('get','/tickets')).body.data;
    await call('post','/tickets/validate','staff',{concertId:'1',qrToken:tickets[0].qr_token}).expect(200);
    const own = await stats();
    assert.equal(own.tickets_sold,5); assert.equal(own.revenue,'91.75'); assert.equal(own.capacity,50);
    assert.equal(own.tickets_used,1); assert.equal(own.attendees,1); assert.equal(own.tickets_pending,4); assert.equal(own.occupancy_percent,10);
    const concert = (await call('get','/organizer/concerts/1/statistics','organizer')).body.data;
    assert.equal(concert.capacity,30); assert.equal(concert.occupancy_percent,16.67);
    const global = await stats('admin');
    assert.equal(global.revenue,'132.75'); assert.equal(global.tickets_sold,9); assert.equal(global.users,6); assert.equal(global.organizers,2);
    assert.equal(global.active_concerts,3); assert.equal(global.sales_by_day[0].tickets_sold,9);
    assert.equal((await stats('outsider')).tickets_sold,4);
});
test('cancelled, expired, reserved and refunded purchases never count as sales', async () => {
    await purchase(2);
    const cancelled = await purchase(1,'1','user',false); await call('post',`/purchases/${cancelled.id}/cancel`).expect(200);
    const expired = await purchase(1,'1','user',false); await db.rows('UPDATE orders SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?',[expired.id]);
    await purchase(1,'1','user',false);
    const refund = await purchase(1); await call('post',`/purchases/${refund.id}/cancel`).expect(200);
    const result = await stats();
    assert.equal(result.tickets_sold,2); assert.equal(result.revenue,'20.50'); assert.equal(result.tickets_pending,2);
    assert.equal(result.activity.find(row => row.status === 'EXPIRED').purchases,1);
});
test('inclusive UTC date filters, daily groups, empty aggregates and invalid ranges', async () => {
    const first = await purchase(1), second = await purchase(2);
    await db.rows("UPDATE orders SET created_at='2025-01-01 23:59:59' WHERE id=?",[first.id]);
    await db.rows("UPDATE orders SET created_at='2025-01-02 00:00:00' WHERE id=?",[second.id]);
    const result = await stats('organizer','?from=2025-01-01&to=2025-01-01');
    assert.equal(result.tickets_sold,1); assert.equal(result.sales_by_day[0].date,'2025-01-01');
    assert.equal((await stats('organizer','?to=2024-01-01')).revenue,'0.00');
    assert.equal((await stats('organizer','?concert_id=3')).occupancy_percent,0);
    for (const suffix of ['?from=2025-02-30','?from=2025-01-02&to=2025-01-01', '?concert_id=1 OR 1=1']) await call('get',`/organizer/statistics${suffix}`,'organizer').expect(422);
});
