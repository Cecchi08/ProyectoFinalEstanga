// Applies one migration file from database/migrations to the configured database (backend/.env). Does not drop data.
// Usage: node scripts/db-migrate.mjs --file <migration.sql> --backup <file.sql> --confirm <database-name>
// Guards: the backup file must exist and not be empty, --confirm must match the database name and the
// migration must select that database. Statements run in order and stop at the first failure.
import { readFile, stat } from 'node:fs/promises';
import { parse } from 'dotenv';
import mysql from 'mysql2/promise';
import { databaseConfig } from '../src/config/db.config.js';
import { schemaStatements } from './schema-statements.js';

const arg = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const file = arg('--file'), backup = arg('--backup'), confirm = arg('--confirm');
const fail = message => { console.error(message); process.exit(2); };
if (!file || !backup || !confirm) fail('Uso: node scripts/db-migrate.mjs --file <migracion.sql> --backup <archivo.sql> --confirm <nombre-de-la-base>');
if (!(await stat(backup).catch(() => null))?.size) fail('El respaldo no existe o está vacío: generalo antes con scripts/db-backup.mjs.');
const config = databaseConfig(parse(await readFile(new URL('../.env', import.meta.url))));
if (confirm !== config.database) fail(`--confirm no coincide con la base configurada (${config.database}).`);
const script = await readFile(file, 'utf8');
if (!script.includes(`USE ${config.database};`)) fail(`La migración no selecciona la base ${config.database}; no la aplico sobre otra.`);
const connection = await mysql.createConnection({ ...config, multipleStatements: false, connectTimeout: 15000 });
try {
    await connection.query("SET time_zone = '+00:00'");
    const statements = schemaStatements(script);
    for (const [index, statement] of statements.entries()) {
        try { await connection.query(statement); }
        catch (error) { console.error(`Falló la sentencia ${index + 1}/${statements.length} (${error.code}): ${statement.split('\n').find(line => line.trim() && !line.startsWith('--'))?.slice(0, 100)}`); throw error; }
    }
    console.log(`Migración aplicada en ${config.database}: ${statements.length} sentencias.`);
} finally {
    await connection.end();
}
