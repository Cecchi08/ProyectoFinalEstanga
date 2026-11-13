// Punto de entrada para Vercel: expone la app Express (ya configurada en src/server.js)
// como Serverless Function. El proyecto es ESM ("type": "module"), por eso se usa import.
let app;
let initError = null;

try {
    const serverModule = await import('../src/server.js');
    app = serverModule.default || serverModule.app;
    console.info('[INIT_STAGE:success] Express app inicializada para Vercel Serverless');
} catch (error) {
    initError = error;
    const code = error && typeof error === 'object' && 'code' in error && error.code ? ` (code: ${error.code})` : '';
    console.error(`[INIT_STAGE:error] Error al inicializar función serverless${code}:`, error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
        console.error('[INIT_STAGE:stack]', error.stack);
    }
}

export default function handler(req, res) {
    if (initError) {
        const code = initError && typeof initError === 'object' && 'code' in initError && initError.code ? ` (${initError.code})` : '';
        console.error(`[INIT_STAGE:handler_failed_init] Invocación rechazada por fallo previo en inicialización${code}:`, initError instanceof Error ? initError.message : String(initError));
        const payload = JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' }
        });
        if (typeof res.status === 'function' && typeof res.json === 'function') {
            res.status(500).json(JSON.parse(payload));
        } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(payload);
        }
        return;
    }
    return app(req, res);
}

