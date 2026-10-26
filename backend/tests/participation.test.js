import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';

const db = new TestDatabase();
let ctx;
const ids = { user: '101', other: '102', staff: '103', unassigned: '104', organizer: '105', foreign: '106', admin: '107' };
// Staff is not a role: 'staff' is a COMPRADOR assigned in concert_staff, 'unassigned' a COMPRADOR without assignments.
const roles = { user: ['COMPRADOR'], other: ['COMPRADOR'], staff: ['COMPRADOR'], unassigned: ['COMPRADOR'], organizer: ['ORGANIZADOR', 'COMPRADOR'], foreign: ['ORGANIZADOR'], admin: ['ADMIN'] };
const call = (method, url, role = 'user', body) => {
    const req = request(ctx.app)[method](url);
    if (role) req.set('Authorization', `Bearer ${ctx.tokens.sign(ids[role], roles[role])}`);
    return body === undefined ? req : req.send(body);
};
before(async () => { await db.open(); });
after(async () => { await db.close(); });
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const [name, id] of Object.entries(ids)) {
        await db.rows('INSERT INTO users(id,first_name,last_name,email,email_verified_at) VALUES (?,?,?,?,NOW())', [id, name, 'Test', `${name}@test.example`]);
        for (const role of roles[name]) await db.rows('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [id, role]);
    }
    for (const [id, status, owner] of [['1', 'PUBLISHED', ids.organizer], ['2', 'PUBLISHED', ids.foreign], ['3', 'DRAFT', ids.organizer]]) {
        await db.rows(`INSERT INTO concerts(id,organizer_user_id,title,slug,artist_name,venue_name,city_id,starts_at,status,published_at)
            VALUES (?,?,?,?,'Artista','Venue',1,DATE_ADD(NOW(), INTERVAL 30 DAY),?,IF(?='DRAFT',NULL,NOW()))`, [id, owner, `Show ${id}`, `show-${id}`, status, status]);
    }
    await db.rows('INSERT INTO concert_staff(concert_id,user_id) VALUES (1,?),(3,?)', [ids.staff, ids.staff]);
    await db.rows("INSERT INTO ticket_types(id,concert_id,name,price,quantity_total) VALUES (1,1,'General',10,20),(2,2,'General',10,20)");
});

test('assignments: Staff sees assigned concerts including drafts, Admin all, unassigned users nothing', async () => {
    await call('get','/staff/assignments',null).expect(401);
    for (const role of ['user','organizer']) assert.deepEqual((await call('get','/staff/assignments',role).expect(200)).body.data,[]);
    const staff = await call('get','/staff/assignments?limit=1&page=2','staff').expect(200);
    assert.equal(staff.body.pagination.total,2); assert.equal(staff.body.data[0].id,'3');
    assert.equal(staff.headers['cache-control'],'no-store');
    assert.deepEqual((await call('get','/staff/assignments','unassigned').expect(200)).body.data,[]);
    assert.equal((await call('get','/staff/assignments','admin').expect(200)).body.pagination.total,3);
    await call('get',`/staff/assignments?user_id=${ids.staff}`,'unassigned').expect(422);
    await db.rows('DELETE FROM concert_staff WHERE user_id=?',[ids.staff]);
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
    await db.rows('INSERT INTO concert_staff(concert_id,user_id) VALUES (1,?)',[ids.foreign]);
    await call('get','/concerts/1/attendees','foreign').expect(200);
    await db.rows('DELETE FROM concert_staff WHERE user_id=?',[ids.staff]);
    await call('get','/concerts/1/attendees','staff').expect(403);
    // Losing the ORGANIZADOR role does not matter for concert 1: access comes from the assignment, read on every request.
    await db.rows('DELETE FROM user_roles WHERE user_id=?',[ids.foreign]);
    await db.rows("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='COMPRADOR'",[ids.foreign]);
    await call('get','/concerts/1/attendees','foreign').expect(200);
    await call('get','/concerts/2/attendees','foreign').expect(403);
    await db.rows('DELETE FROM concert_staff WHERE user_id=?',[ids.foreign]);
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
