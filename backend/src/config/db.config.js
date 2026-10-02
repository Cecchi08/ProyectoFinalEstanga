import mysql from 'mysql2/promise';
import { MysqlAuthRepository } from '../repositories/mysql.repository.js';
export function createPool(env) {
    return mysql.createPool({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD,
        database: env.DB_NAME, connectionLimit: env.DB_CONNECTION_LIMIT, timezone: 'Z',
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
