import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { TestDatabase } from './helpers.js';

// El navegador (web/E2E) envía Idempotency-Key en POST /purchases: el preflight debe permitirla.
const db = new TestDatabase();
let ctx;
before(async () => { await db.open(); ctx = db.context(); });
after(async () => { await db.close(); });

test('CORS: el preflight de POST /purchases permite el encabezado Idempotency-Key desde el origen de la app', async () => {
    const response = await request(ctx.app)
        .options('/purchases')
        .set('Origin', 'http://localhost:8081')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,authorization,idempotency-key')
        .expect(204);
    const allowed = String(response.headers['access-control-allow-headers'] ?? '').toLowerCase();
    assert.ok(allowed.includes('idempotency-key'), `allow-headers: ${allowed}`);
    assert.ok(allowed.includes('authorization'));
});
