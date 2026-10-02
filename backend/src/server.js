import { createApp } from './app.js';
import { loadEnv } from './config/env.config.js';
import { createPool, MysqlDatabase } from './config/db.config.js';
import { SmtpMailer } from './services/email.service.js';
async function main() {
    const env = loadEnv();
    const pool = createPool(env);
    const database = new MysqlDatabase(pool);
    try {
        await database.read(async (repo) => { await repo.findUserById('0'); });
    }
    catch {
        await pool.end();
        throw new Error('No se pudo conectar con MySQL o falta importar schema.sql.');
    }
    const mailer = new SmtpMailer(env);
    const server = createApp({ env, database, mailer }).listen(env.PORT, () => console.info(`VENTI API escuchando en puerto ${env.PORT}`));
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    let closing = false;
    const shutdown = () => {
        if (closing)
            return;
        closing = true;
        const deadline = setTimeout(() => process.exit(1), 30000);
        deadline.unref();
        server.close(() => { void Promise.allSettled([pool.end(), mailer.close()]).then(() => { clearTimeout(deadline); }); });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    server.on('error', () => { console.error('No se pudo iniciar el servidor HTTP.'); shutdown(); process.exitCode = 1; });
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Error de inicio.'); process.exitCode = 1; });
