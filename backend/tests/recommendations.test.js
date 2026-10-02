import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import request from 'supertest';
import { TestDatabase } from './helpers.js';
import { RecommendationsRepository } from '../src/repositories/recommendations.repository.ts';
import { ManagementRepository } from '../src/repositories/management.repository.ts';
import { buildProfile, rankConcerts } from '../src/services/recommendation-scoring.service.ts';

const db = new TestDatabase(); let ctx;
const call = (method, path, body, user = '101') => {
    const req = request(ctx.app)[method](path);
    if (user) req.set('Authorization', `Bearer ${ctx.tokens.sign(user, ['USER'])}`);
    return body === undefined ? req : req.send(body);
};
const recommendations = async (user = '101', suffix = '') => (await call('get', `/recommendations${suffix}`, undefined, user).expect(200)).body.data;
async function purchase(concert = '1', user = '101', purchaseStatus = 'CONFIRMED', ticketStatus = 'USED', quantity = 1) {
    await db.rows(`INSERT INTO purchases(user_id,status_id) SELECT ?,id FROM purchase_statuses WHERE code=?`,[user,purchaseStatus]);
    const purchaseId = String((await db.rows('SELECT MAX(id) AS id FROM purchases'))[0].id);
    await db.rows('INSERT INTO purchase_items(purchase_id,ticket_type_id,quantity,unit_price) VALUES (?,?,?,10)',[purchaseId,concert,quantity]);
    const itemId = String((await db.rows('SELECT MAX(id) AS id FROM purchase_items'))[0].id);
    for (let index=0;index<quantity;index++) await db.rows(`INSERT INTO tickets(purchase_item_id,qr_token,status_id,used_at,used_by_user_id)
        SELECT ?,?,id,?,? FROM ticket_statuses WHERE code=?`,[itemId,randomBytes(32).toString('hex'),ticketStatus === 'USED' ? new Date() : null,ticketStatus === 'USED' ? user : null,ticketStatus]);
}
before(async () => {await db.open();});
after(async () => {await db.close();});
beforeEach(async () => {
    for (const table of ['tickets','purchase_items','purchases','concerts','artists','genres','venues','cities','provinces','users']) await db.rows(`DELETE FROM ${table}`);
    ctx = db.context();
    for (const id of ['101','102']) {
        await db.rows('INSERT INTO users(id,first_name,last_name,email,email_verified_at) VALUES (?,?,?,?,NOW())',[id,'Persona','Test',`${id}@test.example`]);
        await db.rows("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='USER'",[id]);
        await db.rows('INSERT INTO user_preferences(user_id,notifications_enabled) VALUES (?,FALSE)',[id]);
    }
    await db.rows("INSERT INTO organizer_profiles(user_id,display_name) VALUES (101,'Organizador')");
    await db.rows("INSERT INTO provinces(id,name) VALUES (1,'Provincia')");
    await db.rows("INSERT INTO cities(id,province_id,name) VALUES (1,1,'Buenos Aires'),(2,1,'Córdoba')");
    await db.rows("INSERT INTO venues(id,city_id,name,address) VALUES (1,1,'Sala Uno','Calle 1'),(2,2,'Sala Dos','Calle 2')");
    await db.rows("INSERT INTO genres(id,name) VALUES (1,'Rock Argentino'),(2,'Jazz')");
    await db.rows("INSERT INTO artists(id,name) VALUES (1,'Airbag'),(2,'Jazz Band'),(3,'Otra Banda')");
    await db.rows('INSERT INTO artist_genres(artist_id,genre_id) VALUES (1,1),(2,2)');
    for (const [id,status,days,venue] of [['1','FINISHED',-30,1],['2','PUBLISHED',10,1],['3','PUBLISHED',1,2],['4','PUBLISHED',2,2],['5','DRAFT',3,1],['6','CANCELLED',3,1],['7','PUBLISHED',-2,1],['8','PUBLISHED',10,1]]) {
        await db.rows(`INSERT INTO concerts(id,organizer_id,venue_id,concert_type_id,status_id,name,start_datetime)
            SELECT ?,101,?,1,id,?,DATE_ADD('2030-01-01', INTERVAL ? DAY) FROM concert_statuses WHERE code=?`,[id,venue,`Show ${id}`,days,status]);
        // Fix dates relative to the test clock while preserving exact tie dates.
        await db.rows('UPDATE concerts SET start_datetime=DATE_ADD(UTC_DATE(),INTERVAL ? DAY) WHERE id=?',[days,id]);
        await db.rows('INSERT INTO ticket_types(id,concert_id,name,price,stock_total) VALUES (?,?,?,10,100)',[id,id,`General ${id}`]);
    }
    await db.rows('INSERT INTO concert_genres(concert_id,genre_id) VALUES (1,1),(2,1),(3,2),(4,1),(8,1)');
    await db.rows('INSERT INTO concert_artists(concert_id,artist_id,billing_order) VALUES (1,1,1),(2,1,1),(3,2,1),(4,3,1),(8,1,1)');
});

test('preferences: authentication, strict boolean toggle, isolation and notification preference preserved', async () => {
    for (const path of ['/preferences','/recommendations']) await call('get',path,undefined,null).expect(401);
    await call('patch','/preferences',{recommendations_enabled:false},null).expect(401);
    for (const body of [{},{recommendations_enabled:'false'},{recommendations_enabled:false,user_id:'102'},{recommendations_enabled:true,notifications_enabled:true}]) await call('patch','/preferences',body).expect(422);
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
    for (const method of ['history','favorites','candidates']) t.mock.method(RecommendationsRepository.prototype,method,() => {throw new Error('Unexpected profile read');});
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
    await db.rows("UPDATE concerts SET status_id=(SELECT id FROM concert_statuses WHERE code='CANCELLED')");
    assert.deepEqual(await recommendations(),{enabled:true,recommendations:[]});
});
test('valid attended history: genre, seen artist and artist genres rank above earlier unrelated concerts', async () => {
    await purchase();
    const data = await recommendations();
    assert.deepEqual(data.recommendations.map(r => r.concert.id),['2','8','4']);
    assert.match(data.recommendations[0].reason,/asististe.*Rock Argentino/);
    assert.match(data.recommendations[0].reason,/usaste entradas para ver a Airbag/);
    assert.match(data.recommendations[0].reason,/sus artistas interpretan Rock Argentino/);
    assert.equal(new Set(data.recommendations.map(r => r.concert.id)).size,data.recommendations.length);
});
test('confirmed ACTIVE tickets contribute affinity without claiming attendance', async () => {
    await purchase('1','101','CONFIRMED','ACTIVE');
    const data = await recommendations();
    assert.match(data.recommendations[0].reason,/entradas confirmadas/);
    assert.doesNotMatch(data.recommendations[0].reason,/asististe|usaste entradas/);
});
test('artist_genres links recommend an artist even when the concert genre differs', async () => {
    await purchase();
    await db.rows('UPDATE concert_artists SET artist_id=1 WHERE concert_id=3');
    const match = (await recommendations()).recommendations.find(r => r.concert.id === '3');
    assert.ok(match); assert.match(match.reason,/Airbag/); assert.match(match.reason,/sus artistas interpretan Rock Argentino/);
});
test('favorites are the cold-start affinity source and include direct/similar human reasons', async () => {
    await db.rows('INSERT INTO favorites(user_id,concert_id) VALUES (101,1),(101,2)');
    const data = await recommendations();
    assert.match(data.recommendations.find(r => r.concert.id === '2').reason,/guardaste este concierto/);
    assert.match(data.recommendations.find(r => r.concert.id === '8').reason,/guardaste eventos similares/);
    assert.ok(data.recommendations.every(r => !/asististe|usaste entradas/.test(r.reason)));
    assert.deepEqual((await recommendations('102')).recommendations.map(r => r.concert.id),['3','4','2','8']);
});
test('city fallback uses a known event location, with no invented user location', async () => {
    await db.rows('INSERT INTO favorites(user_id,concert_id) VALUES (101,7)');
    const data = await recommendations();
    assert.deepEqual(data.recommendations.map(r => r.concert.id),['2','8']);
    assert.match(data.recommendations[0].reason,/Buenos Aires, una ciudad de tus conciertos/);
});
test('exclude past/draft/cancelled/owned events; invalid purchases or tickets do not count', async () => {
    await purchase('2','101','CONFIRMED','ACTIVE');
    const ids = (await recommendations()).recommendations.map(r => r.concert.id);
    for (const id of ['1','2','5','6','7']) assert.ok(!ids.includes(id));
    for (const [ps,ts] of [['REFUNDED','ACTIVE'],['CANCELLED','USED'],['RESERVED','ACTIVE'],['CONFIRMED','CANCELLED'],['CONFIRMED','REFUNDED']]) await purchase('1','102',ps,ts);
    assert.ok((await recommendations('102')).recommendations.every(r => r.reason === 'Un próximo concierto publicado para descubrir.'));
    await purchase('6','102');
    await db.rows('INSERT INTO favorites(user_id,concert_id) VALUES (102,5),(102,6)');
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
    const links={genres:[{concert_id:'1',genre_id:'1',name:'Rock'},{concert_id:'2',genre_id:'1',name:'Rock'}],artists:[{concert_id:'1',artist_id:'1',name:'Airbag'},{concert_id:'2',artist_id:'1',name:'Airbag'}],artistGenres:[{concert_id:'2',artist_id:'1',genre_id:'1',name:'Rock'}]};
    const profile=buildProfile([{id:'1',city_id:'1',attended:1}],[{id:'1',city_id:'1',attended:0}],links);
    const ranked=rankConcerts([{id:'2',city_id:'1',city_name:'Buenos Aires',start_datetime:new Date('2030-01-01')}],profile,links,20);
    assert.equal(ranked[0].score,15);
    const cold=buildProfile([],[],{genres:[],artists:[],artistGenres:[]});
    assert.deepEqual(rankConcerts(['10','2'].map(id=>({id,start_datetime:new Date('2030-01-01')})),cold,{genres:[],artists:[],artistGenres:[]},20).map(r=>r.concert.id),['2','10']);
});
