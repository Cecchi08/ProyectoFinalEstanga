import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import request from 'supertest';
import { TestDatabase, resetData } from './helpers.js';
import { RecommendationsRepository } from '../src/repositories/recommendations.repository.ts';
import { ManagementRepository } from '../src/repositories/management.repository.ts';
import { buildProfile, rankConcerts } from '../src/services/recommendation-scoring.service.ts';

const db = new TestDatabase(); let ctx;
const call = (method, path, body, user = '101') => {
    const req = request(ctx.app)[method](path);
    if (user) req.set('Authorization', `Bearer ${ctx.tokens.sign(user, ['COMPRADOR'])}`);
    return body === undefined ? req : req.send(body);
};
const recommendations = async (user = '101', suffix = '') => (await call('get', `/recommendations${suffix}`, undefined, user).expect(200)).body.data;
async function purchase(concert = '1', user = '101', purchaseStatus = 'CONFIRMED', ticketStatus = 'USED', quantity = 1) {
    await db.rows(`INSERT INTO orders(public_code,user_id,status,confirmed_at,cancelled_at) VALUES (?,?,?,IF(?='CONFIRMED',NOW(),NULL),IF(?='CANCELLED',NOW(),NULL))`,
        [`O-${randomBytes(6).toString('hex')}`,user,purchaseStatus,purchaseStatus,purchaseStatus]);
    const purchaseId = String((await db.rows('SELECT MAX(id) AS id FROM orders'))[0].id);
    await db.rows('INSERT INTO order_items(order_id,ticket_type_id,concert_id,quantity,unit_price,line_total) VALUES (?,?,?,?,10,?)',[purchaseId,concert,concert,quantity,10*quantity]);
    const itemId = String((await db.rows('SELECT MAX(id) AS id FROM order_items'))[0].id);
    for (let index=0;index<quantity;index++) await db.rows(`INSERT INTO tickets(order_item_id,concert_id,ticket_type_id,owner_user_id,qr_token,status,used_at,validated_by_user_id)
        VALUES (?,?,?,?,?,?,?,?)`,[itemId,concert,concert,user,randomBytes(32).toString('hex'),ticketStatus,ticketStatus === 'USED' ? new Date() : null,ticketStatus === 'USED' ? user : null]);
}
before(async () => {await db.open();});
after(async () => {await db.close();});
beforeEach(async () => {
    await resetData(db);
    ctx = db.context();
    for (const id of ['101','102']) {
        await db.rows('INSERT INTO users(id,first_name,last_name,email,email_verified_at) VALUES (?,?,?,?,NOW())',[id,'Persona','Test',`${id}@test.example`]);
        await db.rows("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='COMPRADOR'",[id]);
        await db.rows('INSERT INTO user_preferences(user_id,notifications_enabled) VALUES (?,FALSE)',[id]);
    }
    // Seeded catalogs: city 1 = Mar del Plata, city 2 = Batan; genre 1 = Rock, genre 2 = Pop. The artist is the concert's artist_name.
    for (const [id,status,days,city,artist] of [['1','FINISHED',-30,1,'Airbag'],['2','PUBLISHED',10,1,'Airbag'],['3','PUBLISHED',1,2,'Pop Band'],
        ['4','PUBLISHED',2,2,'Otra Banda'],['5','DRAFT',3,1,'Banda Cinco'],['6','CANCELLED',3,1,'Banda Seis'],['7','PUBLISHED',-2,1,'Banda Siete'],['8','PUBLISHED',10,1,'Airbag']]) {
        // Dates relative to the test clock, preserving exact tie dates.
        await db.rows(`INSERT INTO concerts(id,organizer_user_id,title,slug,artist_name,venue_name,city_id,starts_at,status,published_at)
            VALUES (?,101,?,?,?,'Sala',?,DATE_ADD(UTC_DATE(),INTERVAL ? DAY),?,IF(?='DRAFT',NULL,NOW()))`,[id,`Show ${id}`,`show-${id}`,artist,city,days,status,status]);
        await db.rows('INSERT INTO ticket_types(id,concert_id,name,price,quantity_total) VALUES (?,?,?,10,100)',[id,id,`General ${id}`]);
    }
    await db.rows('INSERT INTO concert_genres(concert_id,genre_id) VALUES (1,1),(2,1),(3,2),(4,1),(8,1)');
});

test('preferences: authentication, strict boolean toggle, isolation and notification preference preserved', async () => {
    for (const path of ['/preferences','/recommendations']) await call('get',path,undefined,null).expect(401);
    await call('patch','/preferences',{recommendations_enabled:false},null).expect(401);
    for (const body of [{},{recommendations_enabled:'false'},{recommendations_enabled:false,user_id:'102'},{recommendations_enabled:true,notifications_enabled:'true'}]) await call('patch','/preferences',body).expect(422);
    await call('get','/recommendations?user_id=102').expect(422);
    await call('get','/preferences?user_id=102').expect(422);
    await call('patch','/preferences?user_id=102',{recommendations_enabled:false}).expect(422);
    await call('get','/recommendations?limit=51').expect(422);
    assert.equal((await call('get','/preferences').expect(200)).body.data.recommendations_enabled,true);
    await call('patch','/preferences',{recommendations_enabled:false}).expect(200);
    assert.equal((await call('get','/preferences').expect(200)).body.data.recommendations_enabled,false);
    assert.equal((await call('get','/preferences',undefined,'102').expect(200)).body.data.recommendations_enabled,true);
    assert.equal(Number((await db.rows('SELECT notifications_enabled FROM user_preferences WHERE user_id=101'))[0].notifications_enabled),0);
    await call('patch','/preferences',{recommendations_enabled:true}).expect(200);
    assert.equal((await recommendations()).enabled,true);
});
test('OFF returns an empty response without reading affinity/history/candidates', async t => {
    await call('patch','/preferences',{recommendations_enabled:false}).expect(200);
    for (const method of ['history','candidates']) t.mock.method(RecommendationsRepository.prototype,method,() => {throw new Error('Unexpected profile read');});
    const response = await call('get','/recommendations').expect(200);
    assert.deepEqual(response.body.data,{enabled:false,recommendations:[]});
    assert.equal(response.headers['cache-control'],'no-store');
});
test('cold start: upcoming published concerts, deterministic date/ID order and bounded results', async () => {
    const data = await recommendations();
    assert.deepEqual(data.recommendations.map(r => r.concert.id),['3','4','2','8']);
    assert.ok(data.recommendations.every(r => r.reason === 'Un próximo concierto publicado para descubrir.' && !('score' in r)));
    assert.equal((await recommendations('101','?limit=2')).recommendations.length,2);
    assert.deepEqual(await recommendations('101','?limit=2'),await recommendations('101','?limit=2'));
    await db.rows("UPDATE concerts SET status='CANCELLED', published_at=COALESCE(published_at,NOW())");
    assert.deepEqual(await recommendations(),{enabled:true,recommendations:[]});
});
test('valid attended history: genre and seen artist rank above earlier unrelated concerts', async () => {
    await purchase();
    const data = await recommendations();
    assert.deepEqual(data.recommendations.map(r => r.concert.id),['2','8','4']);
    assert.match(data.recommendations[0].reason,/asististe.*Rock/);
    assert.match(data.recommendations[0].reason,/usaste entradas para ver a Airbag/);
    assert.equal(new Set(data.recommendations.map(r => r.concert.id)).size,data.recommendations.length);
});
test('confirmed VALID tickets contribute affinity without claiming attendance', async () => {
    await purchase('1','101','CONFIRMED','VALID');
    const data = await recommendations();
    assert.match(data.recommendations[0].reason,/entradas confirmadas/);
    assert.doesNotMatch(data.recommendations[0].reason,/asististe|usaste entradas/);
});
test('the same artist_name (case and spaces ignored) links concerts even when the genre differs', async () => {
    await purchase();
    await db.rows("UPDATE concerts SET artist_name=' AIRBAG ' WHERE id=3");
    const match = (await recommendations()).recommendations.find(r => r.concert.id === '3');
    assert.ok(match); assert.match(match.reason,/usaste entradas para ver a AIRBAG./);
});
test('city fallback uses a known event location, with no invented user location', async () => {
    await purchase('7');
    const data = await recommendations();
    assert.deepEqual(data.recommendations.map(r => r.concert.id),['2','8']);
    assert.match(data.recommendations[0].reason,/Mar del Plata, una ciudad de tus conciertos/);
});
test('exclude past/draft/cancelled/owned events; invalid purchases or tickets do not count', async () => {
    await purchase('2','101','CONFIRMED','VALID');
    const ids = (await recommendations()).recommendations.map(r => r.concert.id);
    for (const id of ['1','2','5','6','7']) assert.ok(!ids.includes(id));
    for (const [ps,ts] of [['CANCELLED','VALID'],['CANCELLED','USED'],['PENDING','VALID'],['EXPIRED','VALID'],['CONFIRMED','CANCELLED']]) await purchase('1','102',ps,ts);
    assert.ok((await recommendations('102')).recommendations.every(r => r.reason === 'Un próximo concierto publicado para descubrir.'));
    await purchase('6','102');
    assert.ok((await recommendations('102')).recommendations.every(r => r.reason === 'Un próximo concierto publicado para descubrir.'));
});
test('ticket quantities do not multiply affinity and relation reads are batched', async t => {
    await purchase(); const original = await recommendations();
    await purchase('1','101','CONFIRMED','USED',5);
    assert.deepEqual(await recommendations(),original);
    let count=0; const rows=ManagementRepository.prototype.rows;
    t.mock.method(ManagementRepository.prototype,'rows',async function (...args) {count++;return rows.apply(this,args);});
    await recommendations('101','?limit=1'); const single=count; count=0;
    await recommendations('101','?limit=50'); assert.equal(count,single); assert.ok(count <= 9);
});
test('scoring service: categories are counted once and ties use date then numeric ID', () => {
    const links={genres:[{concert_id:'1',genre_id:'1',name:'Rock'},{concert_id:'2',genre_id:'1',name:'Rock'}],artists:[{concert_id:'1',artist_id:'airbag',name:'Airbag'},{concert_id:'2',artist_id:'airbag',name:'Airbag'}]};
    const profile=buildProfile([{id:'1',city_id:'1',attended:1}],links);
    const ranked=rankConcerts([{id:'2',city_id:'1',city_name:'Buenos Aires',start_datetime:new Date('2030-01-01')}],profile,links,20);
    assert.equal(ranked[0].score,10);
    const cold=buildProfile([],{genres:[],artists:[]});
    assert.deepEqual(rankConcerts(['10','2'].map(id=>({id,start_datetime:new Date('2030-01-01')})),cold,{genres:[],artists:[]},20).map(r=>r.concert.id),['2','10']);
});
