import { createApp } from './app.js';
import { loadEnv } from './config/env.config.js';
import { closeSharedPool, getSharedPool, MysqlDatabase } from './config/db.config.js';
import { SmtpMailer } from './services/email.service.js';

if (process.env.VERCEL && !process.env.TRUST_PROXY_HOPS)
    process.env.TRUST_PROXY_HOPS = '1';

const env = loadEnv();
const pool = getSharedPool(env);
const database = new MysqlDatabase(pool);
const mailer = new SmtpMailer(env);
export const app = createApp({ env, database, mailer });
export default app;

async function main() {
    try {
        await pool.query('SELECT 1');
    }
    catch (error) {
        await closeSharedPool();
        const code = error && typeof error === 'object' && 'code' in error ? ` (${String(error.code).slice(0, 40)})` : '';
        throw new Error(`No se pudo conectar con MySQL${code}. Revise host, puerto, usuario, permisos y disponibilidad de la base.`,
            { cause: error });
    }
    const server = app.listen(env.PORT, () => console.info(`VENTI API escuchando en puerto ${env.PORT}`));
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    let closing = false;
    const shutdown = () => {
        if (closing)
            return;
        closing = true;
        const deadline = setTimeout(() => process.exit(1), 30000);
        deadline.unref();
        server.close(() => { void Promise.allSettled([closeSharedPool(), mailer.close()]).then(() => { clearTimeout(deadline); }); });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    server.on('error', (error) => {
        const details = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
            ? ` (code: ${error.code})`
            : '';
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
            console.error(`El puerto ${env.PORT} ya está en uso. Cierra la otra instancia del backend o usa otro puerto.${details}`);
        }
        else {
            console.error(`No se pudo iniciar el servidor HTTP.${details}`);
            if (error instanceof Error)
                console.error(error.message);
        }
        shutdown();
        process.exitCode = 1;
    });
}

// En Vercel la app se exporta como función serverless: no se abre puerto ni se prueba la
// conexión en el arranque (ese SELECT 1 solo aportaba timeouts y logs de ETIMEDOUT en frío).
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL)
    void main().catch(error => { console.error(error instanceof Error ? error.message : 'Error de inicio.'); process.exitCode = 1; });
