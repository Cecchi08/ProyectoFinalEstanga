import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { TestDatabase } from './helpers.js';

// Seguridad de la aplicación: los filtros de búsqueda llegan a SQL solo como parámetros.
const db = new TestDatabase();
let ctx;
before(async () => { await db.open(); ctx = db.context(); });
after(async () => { await db.close(); });

const PAYLOADS = ["' OR '1'='1", "x'); DROP TABLE concerts; --", '%` UNION SELECT 1 --', '\\', '"'];
const LISTS = ['/concerts', '/artists', '/marketplace/venues', '/services/providers', '/services/offerings', '/marketplace/cities'];

test('filtros de búsqueda: payloads de inyección en q y filtros numéricos no producen 5xx ni filtran SQL', async () => {
    for (const path of LISTS) {
        for (const payload of PAYLOADS) {
            const response = await request(ctx.app).get(path).query({ q: payload });
            assert.ok(response.status < 500, `${path} q=${payload} -> ${response.status}`);
            assert.doesNotMatch(response.text, /SQL|ER_[A-Z_]+|syntax/i, `${path} filtra detalle SQL`);
        }
    }
    for (const query of ["genre_id=1 OR 1=1", 'city_id=1;DROP TABLE users', 'limit=1 UNION SELECT 1']) {
        const response = await request(ctx.app).get(`/artists?${query}`);
        assert.ok(response.status >= 400 && response.status < 500, `${query} -> ${response.status}`);
    }
    const tables = await db.rows('SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', ['users']);
    assert.equal(Number(tables[0].total), 1, 'la tabla users sigue existiendo');
});
