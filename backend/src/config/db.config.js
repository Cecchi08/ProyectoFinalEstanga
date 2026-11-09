import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { MysqlAuthRepository } from '../repositories/mysql.repository.js';

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

// Conexión única y directa a MySQL, pensada para Vercel Serverless: manda la URL pública y,
// si no existe, las variables sueltas. No hay bases ni hosts de respaldo.
const URL_VARIABLES = ['MYSQL_PUBLIC_URL', 'DATABASE_URL'];
export function databaseConfig(source = process.env) {
    const connectionUrl = URL_VARIABLES.map(name => source[name]?.trim()).find(Boolean);
    let config;
    let tlsParameter = '';
    if (connectionUrl) {
        let url;
        try { url = new URL(connectionUrl); }
        catch { throw new Error('MYSQL_PUBLIC_URL o DATABASE_URL no es una URL válida.'); }
        if (!['mysql:', 'mysql2:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname || url.pathname === '/')
            throw new Error('La URL MySQL debe incluir host, usuario y nombre de base.');
        config = {
            host: url.hostname,
            port: url.port ? Number(url.port) : 3306,
            user: decode(url.username),
            password: decode(url.password),
            database: source.MYSQLDATABASE?.trim() || source.MYSQL_DATABASE?.trim()
                || source.DB_NAME?.trim() || decode(url.pathname.slice(1)),
        };
        // Proveedores cloud (Aiven, Railway, PlanetScale…) exigen TLS: se activa si la URL lo pide o si hay CA configurada.
        tlsParameter = (url.searchParams.get('ssl') ?? url.searchParams.get('sslmode') ?? url.searchParams.get('ssl-mode') ?? '').toLowerCase();
    } else {
        config = {
            host: source.MYSQLHOST?.trim() || source.DB_HOST?.trim(),
            port: source.MYSQLPORT || source.DB_PORT || '3306',
            user: source.MYSQLUSER?.trim() || source.DB_USER?.trim(),
            password: source.MYSQLPASSWORD ?? source.DB_PASSWORD ?? '',
            database: source.MYSQLDATABASE?.trim() || source.MYSQL_DATABASE?.trim() || source.DB_NAME?.trim() || 'venti',
        };
        config.port = Number(config.port);
    }
    if (!config.host || !config.user || !config.database || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
        throw new Error('Configuración MySQL incompleta: configure MYSQL_PUBLIC_URL (o host, puerto, usuario y base).');
    const ca = readCertificateAuthority(source);
    if (['true', '1', 'required', 'require'].includes(tlsParameter) || ca) {
        if (ca)
            // Aiven y proveedores con CA propia: se valida la cadena contra el certificado provisto.
            config.ssl = { ca, rejectUnauthorized: true };
        else if (source.NODE_ENV === 'production')
            throw new Error('TLS hacia MySQL en producción requiere MYSQL_SSL_CA o MYSQL_SSL_CA_PATH para validar el certificado; no se desactiva la verificación en producción.');
        else
            config.ssl = { rejectUnauthorized: false };
    }
    return config;
}

export function createPool(env) {
    const db = databaseConfig(env);
    // Límites ajustados a Serverless: pocas conexiones por instancia, corte rápido y keep-alive para evitar ETIMEDOUT.
    return mysql.createPool({ ...db, connectionLimit: env.DB_CONNECTION_LIMIT ?? 5, timezone: 'Z',
        supportBigNumbers: true, bigNumberStrings: true, charset: 'utf8mb4', multipleStatements: false,
        waitForConnections: true, queueLimit: 100, connectTimeout: 10000, enableKeepAlive: true, keepAliveInitialDelay: 10000 });
}
export class MysqlDatabase {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async run(transaction, work) {
        const connection = await this.pool.getConnection();
        try {
            // timezone:'Z' controls conversion only; the server session must also use UTC.
            await connection.query("SET time_zone = '+00:00'");
            if (transaction)
                await connection.beginTransaction();
            const result = await work(new MysqlAuthRepository(connection));
            if (transaction)
                await connection.commit();
            return result;
        }
        catch (error) {
            if (transaction)
                await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    read(work) { return this.run(false, work); }
    transaction(work) { return this.run(true, work); }
}
