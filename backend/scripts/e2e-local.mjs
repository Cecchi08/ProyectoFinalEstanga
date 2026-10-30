// Browser checks must only ever talk to the servers they start on 127.0.0.1.
// A developer API on [::]:3000 (for example `node dist/server.js` with the Railway .env) would otherwise
// answer http://localhost:3000 first, and the run would write to that database.
export const LOOPBACK_BROWSER_ARGS = ['--host-resolver-rules=MAP localhost 127.0.0.1'];

export function listenLoopback(app, port) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, '127.0.0.1', () => resolve(server));
        server.once('error', error => reject(error.code === 'EADDRINUSE'
            ? new Error(`El puerto ${port} de 127.0.0.1 está ocupado: detené ese proceso antes de correr las pruebas de navegador.`)
            : error));
    });
}

// Requests Playwright makes itself (route.fetch) do not use the browser's resolver: pin them to 127.0.0.1 too.
export const loopbackUrl = url => url.replace(/^http:\/\/localhost:/, 'http://127.0.0.1:');
