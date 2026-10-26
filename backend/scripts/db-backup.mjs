// Logical backup of the configured database (backend/.env), read-only.
// Usage: node scripts/db-backup.mjs <output.sql>
// Dumps tables (structure + rows), views, routines, triggers and events. Never prints credentials.
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import mysql from 'mysql2/promise';
import { databaseConfig } from '../src/config/db.config.js';

const output = process.argv[2];
if (!output) { console.error('Uso: node scripts/db-backup.mjs <archivo.sql>'); process.exit(2); }
const config = databaseConfig(parse(await readFile(new URL('../.env', import.meta.url))));
const connection = await mysql.createConnection({
    ...config, multipleStatements: false, connectTimeout: 15000, timezone: 'Z', dateStrings: true,
    supportBigNumbers: true, bigNumberStrings: true,
    // Keep JSON as its textual form so it is re-inserted byte for byte.
    typeCast: (field, next) => field.type === 'JSON' ? field.string() : next(),
});
const id = name => `\`${String(name).replaceAll('`', '``')}\``;
const lines = [];
const counts = [];
try {
    await connection.query("SET time_zone = '+00:00'");
    await connection.query('SET SESSION TRANSACTION READ ONLY');
    await connection.query('START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT');
    const [[meta]] = await connection.query('SELECT DATABASE() AS db, VERSION() AS version, @@session.transaction_read_only AS ro, UTC_TIMESTAMP() AS at');
    if (Number(meta.ro) !== 1) throw new Error('La sesión no quedó en solo lectura; aborto.');
    const db = meta.db;
    lines.push(`-- Respaldo lógico de ${id(db)} · MySQL ${meta.version} · ${meta.at} UTC`, 'SET NAMES utf8mb4;', "SET time_zone = '+00:00';",
        'SET FOREIGN_KEY_CHECKS = 0;', `CREATE DATABASE IF NOT EXISTS ${id(db)};`, `USE ${id(db)};`, '');
    const [objects] = await connection.query("SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME", [db]);
    for (const table of objects.filter(o => o.type === 'BASE TABLE')) {
        const [[create]] = await connection.query(`SHOW CREATE TABLE ${id(table.name)}`);
        lines.push(`DROP TABLE IF EXISTS ${id(table.name)};`, `${create['Create Table']};`);
        const [rows] = await connection.query(`SELECT * FROM ${id(table.name)}`);
        for (const row of rows)
            lines.push(`INSERT INTO ${id(table.name)} (${Object.keys(row).map(id).join(', ')}) VALUES (${Object.values(row).map(value => connection.escape(value)).join(', ')});`);
        counts.push([table.name, rows.length]);
        lines.push('');
    }
    for (const view of objects.filter(o => o.type === 'VIEW')) {
        const [[create]] = await connection.query(`SHOW CREATE VIEW ${id(view.name)}`);
        lines.push(`DROP VIEW IF EXISTS ${id(view.name)};`, `${create['Create View']};`, '');
    }
    lines.push('DELIMITER $$');
    const [routines] = await connection.query('SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS type FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?', [db]);
    for (const routine of routines) {
        const [[create]] = await connection.query(`SHOW CREATE ${routine.type} ${id(routine.name)}`);
        lines.push(`DROP ${routine.type} IF EXISTS ${id(routine.name)}$$`, `${create[routine.type === 'PROCEDURE' ? 'Create Procedure' : 'Create Function']}$$`);
    }
    const [triggers] = await connection.query('SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?', [db]);
    for (const trigger of triggers) {
        const [[create]] = await connection.query(`SHOW CREATE TRIGGER ${id(trigger.name)}`);
        lines.push(`DROP TRIGGER IF EXISTS ${id(trigger.name)}$$`, `${create['SQL Original Statement']}$$`);
    }
    const [events] = await connection.query('SELECT EVENT_NAME AS name FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?', [db]);
    for (const event of events) {
        const [[create]] = await connection.query(`SHOW CREATE EVENT ${id(event.name)}`);
        lines.push(`DROP EVENT IF EXISTS ${id(event.name)}$$`, `${create['Create Event']}$$`);
    }
    lines.push('DELIMITER ;', 'SET FOREIGN_KEY_CHECKS = 1;', '');
    await writeFile(output, lines.join('\n'), { encoding: 'utf8', flag: 'wx' });
    console.log(`Respaldo de ${db}: ${counts.length} tablas, ${objects.length - counts.length} vistas, ${routines.length} rutinas, ${triggers.length} triggers, ${events.length} eventos.`);
    for (const [name, total] of counts) if (total) console.log(`  ${name}: ${total} filas`);
    console.log(`Filas totales: ${counts.reduce((sum, [, total]) => sum + total, 0)} · archivo: ${output}`);
} finally {
    await connection.query('ROLLBACK').catch(() => {});
    await connection.end();
}
