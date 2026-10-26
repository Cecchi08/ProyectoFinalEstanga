// Recreates the configured database (backend/.env) from database/venti_shema2.sql. DESTRUCTIVE.
// Usage: node scripts/db-recreate.mjs --backup <file.sql> --confirm <database-name>
// Guards: the backup file must exist and not be empty, --confirm must match the database name,
// and users/concerts must still be empty (catalog tables such as marketplace_cities may hold rows).
import { readFile, stat } from 'node:fs/promises';
import { parse } from 'dotenv';
import mysql from 'mysql2/promise';
import { databaseConfig } from '../src/config/db.config.js';
import { SCHEMA_FILE, schemaStatements } from './schema-statements.js';

const arg = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const backup = arg('--backup'), confirm = arg('--confirm');
const fail = message => { console.error(message); process.exit(2); };
if (!backup || !confirm) fail('Uso: node scripts/db-recreate.mjs --backup <archivo.sql> --confirm <nombre-de-la-base>');
if (!(await stat(backup).catch(() => null))?.size) fail('El respaldo no existe o está vacío: generalo antes con scripts/db-backup.mjs.');
const config = databaseConfig(parse(await readFile(new URL('../.env', import.meta.url))));
if (confirm !== config.database) fail(`--confirm no coincide con la base configurada (${config.database}).`);
const script = await readFile(SCHEMA_FILE, 'utf8');
if (!script.includes(`CREATE DATABASE IF NOT EXISTS ${config.database} `) || !script.includes(`USE ${config.database};`))
    fail(`El esquema no crea la base ${config.database}; no lo cargo sobre otra.`);
const connection = await mysql.createConnection({ ...config, database: undefined, multipleStatements: false, connectTimeout: 15000 });
try {
    for (const table of ['users', 'concerts']) {
        const [rows] = await connection.query('SELECT COUNT(*) AS n FROM ?? . ??', [config.database, table]).catch(error => {
            if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') return [[{ n: 0 }]];
            throw error;
        });
        if (Number(rows[0].n) !== 0) fail(`${table} tiene ${rows[0].n} filas: la base no está vacía, no la recreo.`);
    }
    await connection.query("SET time_zone = '+00:00'");
    await connection.query('DROP DATABASE IF EXISTS ??', [config.database]);
    const statements = schemaStatements(script);
    for (const [index, statement] of statements.entries()) {
        try { await connection.query(statement); }
        catch (error) { console.error(`Falló la sentencia ${index + 1}/${statements.length} (${error.code}): ${statement.split('\n')[0].slice(0, 100)}`); throw error; }
    }
    const [[check]] = await connection.query(`SELECT
        (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE') AS tables,
        (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?) AS triggers,
        (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?) AS routines,
        (SELECT COUNT(*) FROM roles) AS roles, (SELECT COUNT(*) FROM permissions) AS permissions,
        (SELECT COUNT(*) FROM role_permissions) AS grants, (SELECT COUNT(*) FROM users) AS users`, [config.database, config.database, config.database]);
    console.log(`Base ${config.database} recreada: ${statements.length} sentencias.`, JSON.stringify(check));
} finally {
    await connection.end();
}
