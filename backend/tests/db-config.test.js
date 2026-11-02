import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseConfig } from '../src/config/db.config.js';

// Fictitious values: no connection is opened.
const publicUrl = 'mysql://app:secret@proxy.example.net:41234/venti';
const otherUrl = 'mysql://app:secret@otro.example.net:3306/venti';

test('la URL pública es la vía preferida de conexión (MYSQL_PUBLIC_URL y luego DATABASE_URL)', () => {
    assert.equal(databaseConfig({ MYSQL_PUBLIC_URL: publicUrl }).host, 'proxy.example.net');
    assert.equal(databaseConfig({ DATABASE_URL: publicUrl }).host, 'proxy.example.net');
    assert.equal(databaseConfig({ MYSQL_PUBLIC_URL: publicUrl, DATABASE_URL: otherUrl }).host, 'proxy.example.net');
    const config = databaseConfig({ MYSQL_PUBLIC_URL: publicUrl });
    assert.deepEqual([config.port, config.user, config.password, config.database], [41234, 'app', 'secret', 'venti']);
});

test('sin URL se usan las variables MYSQLHOST/MYSQLPORT/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE', () => {
    const config = databaseConfig({ MYSQLHOST: '127.0.0.1', MYSQLPORT: '3307', MYSQLUSER: 'root', MYSQLPASSWORD: 'clave', MYSQLDATABASE: 'venti' });
    assert.deepEqual([config.host, config.port, config.user, config.password, config.database], ['127.0.0.1', 3307, 'root', 'clave', 'venti']);
    // Alias heredados que siguen usándose en desarrollo y en la suite de pruebas.
    assert.equal(databaseConfig({ DB_HOST: '127.0.0.1', DB_USER: 'root', DB_NAME: 'venti_test' }).host, '127.0.0.1');
});

test('TLS de proveedores cloud: se activa solo cuando la URL lo pide', () => {
    assert.equal(databaseConfig({ MYSQL_PUBLIC_URL: publicUrl }).ssl, undefined);
    assert.deepEqual(databaseConfig({ MYSQL_PUBLIC_URL: `${publicUrl}?ssl=true` }).ssl, { rejectUnauthorized: false });
    assert.deepEqual(databaseConfig({ MYSQL_PUBLIC_URL: `${publicUrl}?ssl-mode=REQUIRED` }).ssl, { rejectUnauthorized: false });
    assert.equal(databaseConfig({ MYSQL_PUBLIC_URL: `${publicUrl}?ssl=false` }).ssl, undefined);
});

test('una configuración incompleta o inválida no arranca', () => {
    assert.throws(() => databaseConfig({}), /incompleta/);
    assert.throws(() => databaseConfig({ MYSQLHOST: 'db.example.net' }), /incompleta/);
    assert.throws(() => databaseConfig({ MYSQL_PUBLIC_URL: 'not-a-url' }), /válida/);
    assert.throws(() => databaseConfig({ MYSQL_PUBLIC_URL: 'mysql://proxy.example.net:3306/venti' }), /usuario/);
});
