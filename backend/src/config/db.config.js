import mysql from 'mysql2/promise';
import { MysqlAuthRepository } from '../repositories/mysql.repository.js';

function decode(value) {
    try { return decodeURIComponent(value); }
    catch { throw new Error('MYSQL_URL contiene codificación porcentual inválida.'); }
}

export function databaseConfig(source = process.env) {
    const connectionUrl = source.MYSQL_PUBLIC_URL?.trim() || source.MYSQL_URL?.trim();
    let config;
    if (connectionUrl) {
        let url;
        try { url = new URL(connectionUrl); }
        catch { throw new Error('MYSQL_PUBLIC_URL o MYSQL_URL no es una URL válida.'); }
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
        throw new Error('Configuración MySQL incompleta: configure URL o host, puerto, usuario y base.');
    return config;
}

export function createPool(env) {
    const db = databaseConfig(env);
    return mysql.createPool({ ...db, connectionLimit: env.DB_CONNECTION_LIMIT ?? 10, timezone: 'Z',
        supportBigNumbers: true, bigNumberStrings: true, charset: 'utf8mb4', multipleStatements: false,
        waitForConnections: true, queueLimit: 100, connectTimeout: 10000 });
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
