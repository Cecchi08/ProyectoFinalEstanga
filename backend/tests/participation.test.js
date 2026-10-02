import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import request from 'supertest';
import { TestDatabase } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { user: '101', other: '102', staff: '103', unassigned: '104', organizer: '105', foreign: '106', admin: '107' };
const roles = { user: ['USER'], other: ['USER'], staff: ['USER', 'STAFF'], unassigned: ['STAFF'], organizer: ['USER', 'ORGANIZER'], foreign: ['ORGANIZER', 'STAFF'], admin: ['ADMIN'] };
const call = (method, url, role = 'user', body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};
before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    for (const table of ['tickets', 'purchase_items', 'purchases', 'concerts', 'venues', 'cities', 'provinces', 'users']) await db.rows(`DELETE FROM ${table}`);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users(id,first_name,last_name,email,email_verified_at) VALUES (?,?,?,?,NOW())', [id, name, 'Test', `${name}@test.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [id, role]);
    }
    await db.rows('INSERT INTO organizer_profiles(user_id,display_name) VALUES (?,?)', [ids.organizer, 'Organizer']);
    await db.rows('INSERT INTO organizer_profiles(user_id,display_name) VALUES (?,?)', [ids.foreign, 'Foreign']);
    await db.rows("INSERT INTO provinces(id,name) VALUES (1,'Provincia')");
    await db.rows("INSERT INTO cities(id,province_id,name) VALUES (1,1,'Ciudad')");
    await db.rows("INSERT INTO venues(id,city_id,name,address) VALUES (1,1,'Venue','Calle 1')");
    for (const [id, status, owner] of [['1', 'PUBLISHED', ids.organizer], ['2', 'PUBLISHED', ids.foreign], ['3', 'DRAFT', ids.organizer]]) {
        await db.rows(`INSERT INTO concerts(id,organizer_id,venue_id,concert_type_id,status_id,name,start_datetime)
            SELECT ?,?,1,1,id,?,DATE_ADD(NOW(), INTERVAL 30 DAY) FROM concert_statuses WHERE code=?`, [id, owner, `Show ${id}`, status]);
    }
    await db.rows('INSERT INTO staff_assignments(concert_id,user_id,assigned_by_user_id) VALUES (1,?,?),(3,?,?)', [ids.staff, ids.organizer, ids.staff, ids.organizer]);
    await db.rows("INSERT INTO ticket_types(id,concert_id,name,price,stock_total) VALUES (1,1,'General',10,20),(2,2,'General',10,20)");
});

test('favorites: authentication, strict body/query and existing concert required', async () => {
    for (const [method, path] of [['get','/favorites'],['post','/favorites/1'],['delete','/favorites/1']]) await call(method,path,null).expect(401);
    for (const method of ['post','delete']) {
        await call(method,'/favorites/1','user',{user_id:ids.other}).expect(422);
        await call(method,`/favorites/1?user_id=${ids.other}`).expect(422);
        await call(method,'/favorites/999').expect(404);
        await call(method,'/favorites/invalid').expect(422);
    }
    await call('get',`/favorites?user_id=${ids.other}`).expect(422);
    await call('get','/favorites?limit=101').expect(422);
});

test('favorites: concurrent additions are idempotent and isolated by authenticated user', async () => {
    await Promise.all(Array.from({length:5}, () => call('post','/favorites/1').expect(200)));
    assert.equal((await db.rows('SELECT * FROM favorites')).length,1);
    await call('post','/favorites/2').expect(200);
    const own = await call('get','/favorites?limit=1&page=2').expect(200);
    assert.equal(own.body.pagination.total,2); assert.equal(own.body.data[0].id,'2');
    assert.equal(own.headers['cache-control'],'no-store');
    for (const role of ['other','admin']) assert.deepEqual((await call('get','/favorites',role).expect(200)).body.data,[]);
    await call('delete','/favorites/1','other').expect(204);
    assert.equal((await call('get','/favorites?concert_id=1').expect(200)).body.data.length,1);
    await call('delete','/favorites/1').expect(204); await call('delete','/favorites/1').expect(204);
    assert.equal((await call('get','/favorites?concert_id=1').expect(200)).body.data.length,0);
});

test('favorites do not expose private concerts; cancellation still allows removing own favorite', async () => {
    await call('post','/favorites/3').expect(404);
    await call('post','/favorites/3','organizer').expect(200);
    await call('post','/favorites/3','admin').expect(200);
    await call('post','/favorites/1').expect(200);
    await db.rows("UPDATE concerts SET status_id=(SELECT id FROM concert_statuses WHERE code='CANCELLED') WHERE id=1");
    assert.deepEqual((await call('get','/favorites').expect(200)).body.data,[]);
    await call('delete','/favorites/1').expect(204);
    assert.equal((await db.rows('SELECT * FROM favorites WHERE user_id=?',[ids.user])).length,0);
});

test('assignments: Staff sees assigned concerts including drafts, Admin all, other roles denied', async () => {
    await call('get','/staff/assignments',null).expect(401);
    for (const role of ['user','organizer']) await call('get','/staff/assignments',role).expect(403);
    const staff = await call('get','/staff/assignments?limit=1&page=2','staff').expect(200);
    assert.equal(staff.body.pagination.total,2); assert.equal(staff.body.data[0].id,'3');
    assert.equal(staff.headers['cache-control'],'no-store');
    assert.deepEqual((await call('get','/staff/assignments','unassigned').expect(200)).body.data,[]);
    assert.equal((await call('get','/staff/assignments','admin').expect(200)).body.pagination.total,3);
    await call('get',`/staff/assignments?user_id=${ids.staff}`,'unassigned').expect(422);
    await db.rows('DELETE FROM staff_assignments WHERE user_id=?',[ids.staff]);
    assert.deepEqual((await call('get','/staff/assignments','staff').expect(200)).body.data,[]);
});

test('attendees: enforce assignment/ownership/admin and current roles, including multi-role users', async () => {
    await call('get','/concerts/1/attendees',null).expect(401);
    for (const role of ['user','unassigned','foreign']) await call('get','/concerts/1/attendees',role).expect(403);
    for (const role of ['staff','organizer','admin']) await call('get','/concerts/1/attendees',role).expect(200);
    await call('get','/concerts/2/attendees','staff').expect(403);
    await call('get','/concerts/2/attendees','organizer').expect(403);
    await call('get','/concerts/2/attendees','foreign').expect(200);
    await call('get','/concerts/999/attendees','admin').expect(404);
    await call('get','/concerts/no/attendees','admin').expect(422);
    await db.rows('INSERT INTO staff_assignments(concert_id,user_id,assigned_by_user_id) VALUES (1,?,?)',[ids.foreign,ids.organizer]);
    await call('get','/concerts/1/attendees','foreign').expect(200);
    await db.rows('DELETE FROM staff_assignments WHERE user_id=?',[ids.staff]);
    await call('get','/concerts/1/attendees','staff').expect(403);
    await db.rows('DELETE FROM user_roles WHERE user_id=?',[ids.foreign]);
    await db.rows("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='USER'",[ids.foreign]);
    await call('get','/concerts/1/attendees','foreign').expect(403);
});

test('attendees: issued tickets only, pagination, used status and no QR/contact/auth secrets', async () => {
    const reserved = await call('post','/purchases','user',{items:[{ticketTypeId:'1',quantity:2}]}).expect(201);
    assert.equal((await call('get','/concerts/1/attendees','staff').expect(200)).body.pagination.total,0);
    await call('post',`/purchases/${reserved.body.data.id}/confirm`).expect(200);
    const ticket = (await call('get','/tickets').expect(200)).body.data[0];
    await call('post','/tickets/validate','staff',{concertId:'1',qrToken:ticket.qr_token}).expect(200);
    const attendees = await call('get','/concerts/1/attendees?limit=1&page=2','staff').expect(200);
    assert.equal(attendees.body.pagination.total,2); assert.equal(attendees.body.data.length,1);
    assert.equal(attendees.body.data[0].status,'USED'); assert.ok(attendees.body.data[0].used_at);
    assert.equal(attendees.body.data[0].first_name,'user');
    assert.deepEqual(Object.keys(attendees.body.data[0]).sort(),['ticket_id','ticket_type_name','first_name','last_name','status','purchase_status','used_at'].sort());
    assert.equal(attendees.headers['cache-control'],'no-store');
    await call('get','/concerts/1/attendees?user_id=101','staff').expect(422);
});
