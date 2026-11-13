import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { MysqlAuthRepository } from '../repositories/mysql.repository.js';
import { AppError } from '../utils/app-error.util.js';

function decode(value) {
    try { return decodeURIComponent(value); }
    catch { throw new Error('La URL MySQL contiene codificación porcentual inválida.'); }
}

// Certificado CA del proveedor (Aiven lo exige). Se acepta el PEM en MYSQL_SSL_CA o la ruta del archivo en MYSQL_SSL_CA_PATH.
function readCertificateAuthority(source) {
    const inline = source.MYSQL_SSL_CA?.trim();
    if (inline) return inline.replace(/\\n/g, '\n');
    const filePath = source.MYSQL_SSL_CA_PATH?.trim();
    if (!filePath) return null;
    try { return readFileSync(filePath, 'utf8'); }
    catch { throw new Error('MYSQL_SSL_CA_PATH no apunta a un archivo de certificado legible.'); }
}

// Conexión única y directa a MySQL mediante MYSQL_PUBLIC_URL (Vercel Serverless y local).
// No hay variables alternativas ni fallbacks.
export function databaseConfig(source = process.env) {
    const connectionUrl = source.MYSQL_PUBLIC_URL?.trim();
    if (!connectionUrl)
        throw new Error('Configuración MySQL incompleta: configure MYSQL_PUBLIC_URL.');
    let url;
    try { url = new URL(connectionUrl); }
    catch { throw new Error('MYSQL_PUBLIC_URL no es una URL válida.'); }
    if (!['mysql:', 'mysql2:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname || url.pathname === '/')
        throw new Error('MYSQL_PUBLIC_URL debe incluir protocolo mysql://, host, usuario y nombre de base.');
    const port = url.port ? Number(url.port) : 3306;
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('MYSQL_PUBLIC_URL contiene un puerto inválido.');
    const config = {
        host: url.hostname,
        port,
        user: decode(url.username),
        password: decode(url.password),
        database: decode(url.pathname.slice(1)),
    };
    // Proveedores cloud (Aiven) exigen TLS: se activa si la URL lo pide o si hay CA configurada.
    const tlsParameter = (url.searchParams.get('ssl') ?? url.searchParams.get('sslmode') ?? url.searchParams.get('ssl-mode') ?? '').toLowerCase();
    const ca = readCertificateAuthority(source);
    if (['true', '1', 'required', 'require'].includes(tlsParameter) || ca) {
        if (ca)
            // Aiven y proveedores con CA propia: se valida la cadena contra el certificado provisto.
            config.ssl = { ca, rejectUnauthorized: true };
        else if (source.NODE_ENV === 'production') {
            console.error('[DB_CONFIG_ERROR]: TLS hacia MySQL en producción requiere MYSQL_SSL_CA o MYSQL_SSL_CA_PATH para validar el certificado; no se desactiva la verificación en producción.');
            throw new Error('TLS hacia MySQL en producción requiere MYSQL_SSL_CA o MYSQL_SSL_CA_PATH para validar el certificado; no se desactiva la verificación en producción.');
        } else
            config.ssl = { rejectUnauthorized: false };
    }
    return config;
}

export function createPool(env = process.env) {
    const db = databaseConfig(env);
    // Límites ajustados a Serverless: pocas conexiones por instancia, corte rápido y keep-alive para evitar ETIMEDOUT.
    return mysql.createPool({ ...db, connectionLimit: env.DB_CONNECTION_LIMIT ?? 5, timezone: 'Z',
        supportBigNumbers: true, bigNumberStrings: true, charset: 'utf8mb4', multipleStatements: false,
        waitForConnections: true, queueLimit: 100, connectTimeout: 10000, enableKeepAlive: true, keepAliveInitialDelay: 10000 });
}

let sharedPool = null;
export function getSharedPool(env = process.env) {
    if (!sharedPool)
        sharedPool = createPool(env);
    return sharedPool;
}

export async function closeSharedPool() {
    if (!sharedPool)
        return;
    const pool = sharedPool;
    sharedPool = null;
    await pool.end();
}
export class MysqlDatabase {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async run(transaction, work) {
        console.info(`[DB_STAGE:getConnection:start] (transaction=${transaction})`);
        let connection;
        try {
            connection = await this.pool.getConnection();
            console.info('[DB_STAGE:getConnection:success]');
        } catch (connError) {
            const code = connError && typeof connError === 'object' && 'code' in connError && connError.code ? ` (${connError.code})` : '';
            console.error(`[DB_STAGE:getConnection:error]${code}:`, connError instanceof Error ? connError.message : String(connError));
            if (connError instanceof Error && connError.stack) {
                console.error('[DB_STAGE:getConnection:stack]', connError.stack);
            }
            throw connError;
        }
        try {
            // timezone:'Z' controls conversion only; the server session must also use UTC.
            console.info('[DB_STAGE:setTimeZone]');
            await connection.query("SET time_zone = '+00:00'");
            if (transaction) {
                console.info('[DB_STAGE:beginTransaction]');
                await connection.beginTransaction();
            }
            console.info('[DB_STAGE:work_start]');
            const result = await work(new MysqlAuthRepository(connection));
            console.info('[DB_STAGE:work_done]');
            if (transaction) {
                console.info('[DB_STAGE:commit]');
                await connection.commit();
            }
            return result;
        }
        catch (error) {
            if (!(error instanceof AppError)) {
                const code = error && typeof error === 'object' && 'code' in error && error.code ? ` (${error.code})` : '';
                const msg = error instanceof Error ? error.message : String(error);
                const safeMsg = msg
                    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
                    .replace(/'[^']*'/g, "'[REDACTED]'");
                console.error(`[DB_STAGE:work_error]${code}:`, safeMsg);
                if (error instanceof Error && error.stack) {
                    console.error('[DB_STAGE:work_stack]', error.stack);
                }
            } else {
                console.info(`[DB_STAGE:work_app_error] code=${error.code} status=${error.status}`);
            }
            if (transaction) {
                try {
                    await connection.rollback();
                } catch (rollbackErr) {
                    console.error('[DB_STAGE:rollback_error]:', rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr));
                }
            }
            throw error;
        }
        finally {
            connection.release();
        }
    }
    read(work) { return this.run(false, work); }
    transaction(work) { return this.run(true, work); }
}
