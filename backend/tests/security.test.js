import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:net';
import express from 'express';
import request from 'supertest';
import { SmtpMailer } from '../src/services/email.service.js';
import { errorHandler } from '../src/middlewares/error.middleware.js';
import { loadEnv } from '../src/config/env.config.js';
import { testEnv } from './helpers.js';
test('error 500 no filtra stack, SQL ni secretos', async () => {
    const app = express();
    app.get('/fail', () => { throw new Error('SELECT secret-password FROM users'); });
    app.use(errorHandler());
    const response = await request(app).get('/fail').expect(500);
    assert.deepEqual(response.body, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } });
});
test('env rechaza secreto débil, JWT largo y OAuth parcialmente configurado', () => {
    const base = { DB_USER: 'test', SMTP_HOST: 'localhost', SMTP_FROM: 'test@example.com', JWT_ACCESS_SECRET: 'x'.repeat(48) };
    assert.throws(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' }));
    assert.throws(() => loadEnv({ ...base, JWT_ACCESS_EXPIRES_IN: '120m' }));
    assert.throws(() => loadEnv({ ...base, GOOGLE_CLIENT_ID: 'alone' }));
    assert.throws(() => loadEnv({ ...base, CORS_ORIGINS: '*' }));
});
test('SMTP entrega verificación y recuperación con tokens en fragmento', async () => {
    const received = [];
    const server = createServer(socket => {
        socket.setEncoding('utf8');
        let buffer = '';
        let message = null;
        socket.write('220 localhost ESMTP test\r\n');
        socket.on('data', chunk => {
            buffer += chunk;
            let end;
            while ((end = buffer.indexOf('\r\n')) !== -1) {
                const line = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                if (message) {
                    if (line === '.') {
                        received.push(message.join('\r\n'));
                        message = null;
                        socket.write('250 accepted\r\n');
                    }
                    else
                        message.push(line);
                }
                else if (line.startsWith('EHLO') || line.startsWith('HELO'))
                    socket.write('250 localhost\r\n');
                else if (line === 'DATA') {
                    message = [];
                    socket.write('354 send message\r\n');
                }
                else if (line === 'QUIT') {
                    socket.end('221 bye\r\n');
                }
                else
                    socket.write('250 OK\r\n');
            }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const env = testEnv();
    env.SMTP_PORT = address.port;
    const mailer = new SmtpMailer(env);
    try {
        mailer.enqueue({ to: 'user@example.com', kind: 'verification', token: 'a'.repeat(64) });
        mailer.enqueue({ to: 'user@example.com', kind: 'reset', token: 'b'.repeat(64) });
        await mailer.close();
        assert.equal(received.length, 2);
        const decoded = received.map(m => m.replace(/=\r\n/g, '').replace(/=3D/g, '='));
        assert.ok(decoded.some(m => m.includes('/verify-email#token=' + 'a'.repeat(64))));
        assert.ok(decoded.some(m => m.includes('/reset-password#token=' + 'b'.repeat(64))));
    }
    finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
