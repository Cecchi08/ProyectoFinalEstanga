import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseConfig } from '../src/config/db.config.js';

// Fictitious values: no connection is opened.
const internal = 'mysql://app:secret@mysql.railway.internal:3306/venti';
const proxy = 'mysql://app:secret@proxy.example.net:41234/venti';
const railway = { RAILWAY_SERVICE_ID: 'svc-1' };

test('fuera de Railway la URL pública va primero (desarrollo y scripts locales)', () => {
    assert.equal(databaseConfig({ MYSQL_PUBLIC_URL: proxy, MYSQL_URL: internal }).host, 'proxy.example.net');
    assert.equal(databaseConfig({ MYSQL_URL: internal }).host, 'mysql.railway.internal');
    assert.equal(databaseConfig({ DB_HOST: '127.0.0.1', DB_USER: 'root', DB_NAME: 'venti_test' }).host, '127.0.0.1');
});

test('en Railway la API usa solo MYSQL_URL de la red privada e ignora MYSQL_PUBLIC_URL', () => {
    const config = databaseConfig({ ...railway, MYSQL_PUBLIC_URL: proxy, MYSQL_URL: internal });
    assert.deepEqual([config.host, config.port, config.user, config.database], ['mysql.railway.internal', 3306, 'app', 'venti']);
    assert.equal(databaseConfig({ RAILWAY_ENVIRONMENT_ID: 'env-1', MYSQL_URL: internal }).host, 'mysql.railway.internal');
    // Without a URL, the MYSQLHOST variables of the private network also work.
    assert.equal(databaseConfig({ ...railway, MYSQLHOST: 'mysql.railway.internal', MYSQLUSER: 'app', MYSQLDATABASE: 'venti' }).host, 'mysql.railway.internal');
});

test('en Railway, apuntar al proxy público o tener solo MYSQL_PUBLIC_URL es un error de configuración', () => {
    assert.throws(() => databaseConfig({ ...railway, MYSQL_URL: proxy }), /red privada/);
    assert.throws(() => databaseConfig({ ...railway, MYSQL_PUBLIC_URL: proxy }), /incompleta/);
    assert.throws(() => databaseConfig({ ...railway, MYSQLHOST: 'proxy.example.net', MYSQLUSER: 'app', MYSQLDATABASE: 'venti' }), /red privada/);
});
