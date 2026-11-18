import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { loadEnv } from '../src/config/env.config.js';
import { createPool, MysqlDatabase } from '../src/config/db.config.js';
import { createApp } from '../src/app.js';
import { AccessTokens } from '../src/utils/jwt.util.js';
import { MysqlAuthRepository } from '../src/repositories/mysql.repository.js';

class NoopMailer {
    enqueue() {}
}

test('Auditoría integral: filtros de cartelera, sincronización /sync/versions y CRUD en dos sesiones simultáneas', async () => {
    const env = loadEnv();
    const pool = createPool({ ...process.env, DB_CONNECTION_LIMIT: 2 });
    const database = new MysqlDatabase(pool);
    const app = createApp({ env, database, mailer: new NoopMailer() });
    const tokens = new AccessTokens(env);

    const createdCityIds = [];
    const createdConcertIds = [];
    const createdPromoIds = [];
    let adminToken = '';

    try {
        // Obtiene un ADMIN y un COMPRADOR activos existentes en MySQL sin exponer credenciales.
        const [adminRows] = await pool.query(
            `SELECT u.id FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             WHERE r.code = 'ADMIN' AND u.status = 'ACTIVE' AND u.is_guest = 0
             ORDER BY u.id LIMIT 1`,
        );
        const [buyerRows] = await pool.query(
            `SELECT u.id FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             WHERE r.code = 'COMPRADOR' AND u.status = 'ACTIVE' AND u.is_guest = 0
               AND NOT EXISTS (
                 SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id
                 WHERE ur2.user_id = u.id AND r2.code IN ('ADMIN', 'ORGANIZADOR')
               )
             ORDER BY u.id LIMIT 1`,
        );
        const [provinceRows] = await pool.query('SELECT id FROM provinces ORDER BY id LIMIT 1');
        const [districtRows] = await pool.query('SELECT id, province_id FROM districts ORDER BY id LIMIT 1');
        const [genreRows] = await pool.query('SELECT id FROM genres ORDER BY id LIMIT 1');

        assert.ok(adminRows.length > 0, 'Se requiere al menos un ADMIN activo en la BD.');
        assert.ok(buyerRows.length > 0, 'Se requiere al menos un COMPRADOR activo en la BD.');
        assert.ok(districtRows.length > 0, 'Se requiere al menos un distrito en la BD.');
        assert.ok(genreRows.length > 0, 'Se requiere al menos un género en la BD.');

        const adminId = String(adminRows[0].id);
        const buyerId = String(buyerRows[0].id);
        const provinceId = String(districtRows[0].province_id ?? provinceRows[0].id);
        const districtId = String(districtRows[0].id);
        const genreId = String(genreRows[0].id);

        const adminAccess = await database.read(repo => new MysqlAuthRepository(repo.connection).access(adminId));
        const buyerAccess = await database.read(repo => new MysqlAuthRepository(repo.connection).access(buyerId));

        adminToken = tokens.sign(adminId, adminAccess.roles);
        const buyerToken = tokens.sign(buyerId, buyerAccess.roles);

        const tag = Date.now().toString(36).slice(-5).toUpperCase();
        // ---- ETAPA 4: PRUEBAS DE FILTROS DE CARTELERA ----
        // PRUEBA 1: Sin filtros (MySQL vs Backend)
        const [dbPubRows] = await pool.query("SELECT COUNT(*) AS total FROM concerts WHERE status = 'PUBLISHED'");
        const dbTotalPublished = Number(dbPubRows[0].total);

        const allRes = await request(app)
            .post('/concerts?status=PUBLISHED&limit=100&page=1')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.equal(allRes.status, 200);
        assert.equal(allRes.body.pagination.total, dbTotalPublished);
        assert.equal(allRes.body.data.length, dbTotalPublished);

        // Verificar que /marketplace/venues y alias /venues NO devuelven 410 Gone
        const venuesRes = await request(app).post('/marketplace/venues?page=1&limit=12');
        assert.equal(venuesRes.status, 200);
        const venuesAliasRes = await request(app).post('/venues?page=1&limit=12');
        assert.equal(venuesAliasRes.status, 200);

        // PRUEBA 2: Filtro por ciudad existente
        const [citySample] = await pool.query("SELECT city_id, COUNT(*) AS total FROM concerts WHERE status = 'PUBLISHED' AND city_id IS NOT NULL GROUP BY city_id LIMIT 1");
        if (citySample.length > 0) {
            const sampleCityId = String(citySample[0].city_id);
            const expectedCityTotal = Number(citySample[0].total);
            const byCity = await request(app)
                .post(`/concerts?status=PUBLISHED&city_id=${sampleCityId}&limit=100`)
                .set('Authorization', `Bearer ${buyerToken}`);
            assert.equal(byCity.status, 200);
            assert.equal(byCity.body.pagination.total, expectedCityTotal);
            assert.ok(byCity.body.data.every(c => String(c.city_id) === sampleCityId));
        }

        // PRUEBA 3: Combinación de filtros (ciudad + género + rango de precios + fechas)
        const [comboRows] = await pool.query(
            `SELECT c.city_id, cg.genre_id, COUNT(DISTINCT c.id) AS total
             FROM concerts c
             JOIN concert_genres cg ON cg.concert_id = c.id
             WHERE c.status = 'PUBLISHED' AND c.city_id IS NOT NULL
             GROUP BY c.city_id, cg.genre_id LIMIT 1`,
        );
        if (comboRows.length > 0) {
            const cId = String(comboRows[0].city_id);
            const gId = String(comboRows[0].genre_id);
            const comboRes = await request(app)
                .post(`/concerts?status=PUBLISHED&city_id=${cId}&genre_id=${gId}&min_price=0&max_price=9999999&limit=100`)
                .set('Authorization', `Bearer ${buyerToken}`);
            assert.equal(comboRes.status, 200);
            assert.equal(comboRes.body.pagination.total, Number(comboRows[0].total));
        }

        // PRUEBA 4 & 7: Resultados vacíos y limpieza de filtros
        const emptyRes = await request(app)
            .post('/concerts?status=PUBLISHED&q=CONCIERTO_INEXISTENTE_XYZ_999&limit=12')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.equal(emptyRes.status, 200);
        assert.equal(emptyRes.body.data.length, 0);
        assert.equal(emptyRes.body.pagination.total, 0);

        const clearedRes = await request(app)
            .post('/concerts?status=PUBLISHED&limit=100')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.equal(clearedRes.status, 200);
        assert.equal(clearedRes.body.pagination.total, dbTotalPublished);

        // ---- ETAPA 2 & 7: SINCRONIZACIÓN ENTRE DOS SESIONES (ADMIN A vs COMPRADOR B) ----
        const buyerV0 = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.equal(buyerV0.status, 200);
        const v0 = buyerV0.body.data.versions;
        // Seguridad por rol: Comprador NO ve dominios administrativos ni estadísticas privadas
        assert.equal(v0.admin_promotions, undefined);
        assert.equal(v0.admin_users, undefined);
        assert.equal(v0.admin_establishments, undefined);
        assert.ok(v0.cities && v0.concerts && v0.promotions_sig);

        // 1. Sesión A (ADMIN) crea una ciudad de prueba (solo letras y espacios por validación).
        const cityLetters = tag.replace(/[^A-Z]/g, 'X');
        const cityName1 = `Ciudad Prueba ${cityLetters}`;
        const createCity = await request(app)
            .post('/cities/create')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: cityName1, province_id: provinceId, district_id: districtId, postal_code: '7630' });
        assert.equal(createCity.status, 201);
        const testCityId = String(createCity.body.data.id);
        createdCityIds.push(testCityId);

        const buyerV1 = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.notEqual(buyerV1.body.data.versions.cities, v0.cities, 'Sesión B debe detectar la creación de la ciudad');

        const citiesList1 = await request(app).post(`/cities?q=${encodeURIComponent(cityName1)}`);
        assert.equal(citiesList1.status, 200);
        assert.ok(citiesList1.body.data.some(c => String(c.id) === testCityId && c.name === cityName1));

        // 2. Sesión A (ADMIN) renombra la ciudad de prueba -> CRC32 debe cambiar en Sesión B.
        const cityName2 = `Ciudad Editada ${cityLetters}`;
        const updateCity = await request(app)
            .post(`/cities/${testCityId}/update`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: cityName2 });
        assert.equal(updateCity.status, 200);

        const buyerV2 = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.notEqual(buyerV2.body.data.versions.cities, buyerV1.body.data.versions.cities, 'Sesión B debe detectar el renombrado de la ciudad');

        // 3. Sesión A (ADMIN) crea concierto en borrador -> NO visible en cartelera pública de Sesión B.
        const futureStart = new Date(Date.now() + 30 * 86400000).toISOString();
        const createConcert = await request(app)
            .post('/concerts/create')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Show Sync ${tag}`,
                artist_name: `Artista Sync ${tag}`,
                venue_name: `Teatro Sync ${tag}`,
                city_id: testCityId,
                start_datetime: futureStart,
                genre_ids: [genreId],
                ticket_types: [{ name: 'General', price: 1500, stock_total: 50 }],
            });
        assert.equal(createConcert.status, 201);
        const testConcertId = String(createConcert.body.data.id);
        createdConcertIds.push(testConcertId);

        const buyerAfterDraft = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.equal(
            buyerAfterDraft.body.data.versions.concerts,
            buyerV2.body.data.versions.concerts,
            'Un borrador privado no debe filtrar cambios de versión públicos al Comprador',
        );

        // Integridad referencial: no se puede eliminar la ciudad mientras tenga concierto asociado
        const blockedDeleteCity = await request(app)
            .post(`/cities/${testCityId}/delete`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.equal(blockedDeleteCity.status, 409);

        // 4. Sesión A (ADMIN) publica el concierto -> Sesión B lo detecta y aparece al filtrar por la nueva ciudad!
        const publishConcert = await request(app)
            .post(`/concerts/${testConcertId}/publish`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});
        assert.equal(publishConcert.status, 200);

        const buyerV3 = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.notEqual(buyerV3.body.data.versions.concerts, buyerV2.body.data.versions.concerts, 'Sesión B debe detectar la publicación del concierto');

        const filteredNewCity = await request(app)
            .post(`/concerts?status=PUBLISHED&city_id=${testCityId}&genre_id=${genreId}`)
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.equal(filteredNewCity.status, 200);
        assert.equal(filteredNewCity.body.data.length, 1);
        assert.equal(String(filteredNewCity.body.data[0].id), testConcertId);
        assert.equal(filteredNewCity.body.data[0].city_name, cityName2);

        // Búsqueda por texto `q` por nombre de artista y ciudad (fix SQL)
        const searchByArtist = await request(app)
            .post(`/concerts?status=PUBLISHED&q=${encodeURIComponent(`Artista Sync ${tag}`)}`)
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.equal(searchByArtist.status, 200);
        assert.ok(searchByArtist.body.data.some(c => String(c.id) === testConcertId));

        // 5. Sesión A modifica el concierto -> Sesión B detecta el cambio
        const updateConcert = await request(app)
            .post(`/concerts/${testConcertId}/update`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: `Show Sync Editado ${tag}` });
        assert.equal(updateConcert.status, 200);

        const buyerV4 = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.notEqual(buyerV4.body.data.versions.concerts, buyerV3.body.data.versions.concerts);

        // 6. Sesión A cancela el concierto -> Sesión B detecta el cambio y sale de PUBLISHED
        const cancelConcert = await request(app)
            .post(`/concerts/${testConcertId}/cancel`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});
        assert.equal(cancelConcert.status, 200);

        const buyerV5 = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.notEqual(buyerV5.body.data.versions.concerts, buyerV4.body.data.versions.concerts);

        const afterCancelFiltered = await request(app)
            .post(`/concerts?status=PUBLISHED&city_id=${testCityId}`)
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.equal(afterCancelFiltered.status, 200);
        assert.equal(afterCancelFiltered.body.data.length, 0);

        // 7. Sesión A crea y modifica una promoción -> admin_promotions y promotions_sig cambian
        const adminV0 = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.ok(adminV0.body.data.versions.admin_promotions);

        const createPromo = await request(app)
            .post('/admin/promotions/create')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                code: `SYNC${tag}`,
                description: 'Cupón temporal de prueba de sincronización',
                discountType: 'PERCENTAGE',
                discountValue: 15,
                minOrderAmount: 0,
                concertId: null,
                maxUses: 10,
                validFrom: new Date(Date.now() - 3600000).toISOString(),
                validUntil: new Date(Date.now() + 86400000 * 10).toISOString(),
            });
        assert.equal(createPromo.status, 201);
        const testPromoId = String(createPromo.body.data.id);
        createdPromoIds.push(testPromoId);

        const buyerV6 = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.notEqual(buyerV6.body.data.versions.promotions_sig, buyerV5.body.data.versions.promotions_sig);

        const updatePromo = await request(app)
            .post(`/admin/promotions/${testPromoId}/update`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ description: 'Cupón actualizado', status: 'INACTIVE' });
        assert.equal(updatePromo.status, 200);

        const buyerV7 = await request(app)
            .post('/sync/versions')
            .set('Authorization', `Bearer ${buyerToken}`);
        assert.notEqual(buyerV7.body.data.versions.promotions_sig, buyerV6.body.data.versions.promotions_sig);
    } catch (err) {
        console.error('TEST_ERROR_DETAIL:', err);
        throw err;
    } finally {
        // Limpieza estricta de los registros temporales de prueba sin tocar datos reales.
        for (const promoId of createdPromoIds) {
            await pool.query('DELETE FROM promotions WHERE id = ?', [promoId]).catch(() => {});
        }
        for (const concertId of createdConcertIds) {
            await pool.query('DELETE FROM admin_audit_log WHERE entity_type = ? AND entity_id = ?', ['CONCERT', concertId]).catch(() => {});
            await pool.query('DELETE FROM concert_genres WHERE concert_id = ?', [concertId]).catch(() => {});
            await pool.query('DELETE FROM ticket_types WHERE concert_id = ?', [concertId]).catch(() => {});
            await pool.query('DELETE FROM concerts WHERE id = ?', [concertId]).catch(() => {});
        }
        for (const cityId of createdCityIds) {
            if (adminToken) {
                await request(app)
                    .post(`/cities/${cityId}/delete`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .catch(() => {});
            }
        }
        await pool.end();
    }
});
