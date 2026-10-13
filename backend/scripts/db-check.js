import 'dotenv/config';
import { createPool } from '../src/config/db.config.js';

let pool;
try {
    pool = createPool({ ...process.env, DB_CONNECTION_LIMIT: 1 });
    const [rows] = await pool.query('SELECT 1 AS connected, DATABASE() AS database_name');
    const actual = rows[0]?.database_name;
    console.info(`MySQL: conexión OK; SELECT 1=${rows[0]?.connected}; base=${actual ?? '(sin seleccionar)'}.`);
    if (actual !== 'venti') {
        console.error(`schema.sql usa la base "venti"; la conexión usa "${actual ?? '(sin seleccionar)'}". Configure Railway con una base venti e importe schema.sql allí.`);
        process.exitCode = 1;
    }
} catch (error) {
    const configMessage = error instanceof Error && /^(MYSQL_PUBLIC_URL|MYSQL_URL|La URL MySQL|Configuración MySQL)/.test(error.message)
        ? error.message : undefined;
    const code = error && typeof error === 'object' && 'code' in error ? ` (${String(error.code).slice(0, 40)})` : '';
    console.error(configMessage ? `MySQL: ${configMessage}` : `MySQL: conexión fallida${code}. Verifique host, puerto, usuario, permisos y disponibilidad.`);
    process.exitCode = 1;
} finally {
    if (pool) await pool.end();
}
