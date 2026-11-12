// Servicio de envío de correos electrónicos vía SMTP para Venti con soporte para suspensión y reactivación.
import nodemailer from 'nodemailer';
import { waitUntil } from '@vercel/functions';

export class SmtpMailer {
    env;
    transporter;
    pending = new Set();

    constructor(env) {
        this.env = env;
        this.transporter = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            requireTLS: env.NODE_ENV === 'production' && !env.SMTP_SECURE,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            disableFileAccess: true,
            disableUrlAccess: true,
        });
    }

    // Encola el correo de forma asíncrona sin bloquear la respuesta de la petición HTTP.
    enqueue(message) {
        const pending = this.send(message).catch((err) => {
            console.error('[EMAIL_DELIVERY_FAILED] Error al entregar correo:', err?.message ?? err);
        });
        // 1. Mantiene la promesa para el cierre graceful
        this.pending.add(pending);
        void pending.finally(() => this.pending.delete(pending));
        // 2. Notifica a Vercel Functions para mantener el proceso hasta completar el envío
        try {
            waitUntil(pending);
        } catch {
            // Ignorado fuera del entorno de ejecución de Vercel
        }
    }

    // Procesa y envía el correo según el tipo de notificación con plantillas coherentes con la identidad de Venti.
    async send(message) {
        // Notificación por correo de suspensión de cuenta
        if (message.kind === 'suspension') {
            const userName = message.userName ? ` ${message.userName}` : '';
            const text = `Hola${userName},\n\nTe informamos que tu cuenta en Venti ha sido suspendida.${message.reason ? '\n\nMotivo informado por el equipo de administración:\n' + message.reason : ''}\n\nSi considerás que esto es un error o necesitás más detalles, comunicate con el equipo de soporte de Venti.\n\nAtentamente,\nEquipo de Venti`;
            const html = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #0E0E10; color: #FFFFFF; border-radius: 8px;">
                <div style="border-bottom: 2px solid #E5B32E; padding-bottom: 12px; margin-bottom: 20px;">
                  <h1 style="color: #F5C542; margin: 0; font-size: 24px; letter-spacing: 2px;">VENTI</h1>
                  <p style="color: #A1A1AA; margin: 4px 0 0 0; font-size: 12px; text-transform: uppercase;">Aviso de cuenta</p>
                </div>
                <h2 style="color: #EF4444; margin-top: 0;">Tu cuenta ha sido suspendida</h2>
                <p style="color: #D4D4D8; line-height: 1.6;">
                  Hola${userName ? ` <strong>${message.userName}</strong>` : ''}, te informamos que el acceso a tu cuenta en Venti ha sido temporalmente suspendido por un administrador.
                </p>
                ${message.reason ? `
                <div style="background-color: #18181B; border-left: 4px solid #EF4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
                  <strong style="color: #F43F5E; font-size: 13px; text-transform: uppercase;">Motivo de la suspensión:</strong>
                  <p style="color: #E4E4E7; margin: 6px 0 0 0; font-style: italic;">${message.reason}</p>
                </div>` : ''}
                <p style="color: #A1A1AA; font-size: 14px; line-height: 1.5;">
                  Si considerás que esto se debe a un error o deseás solicitar una revisión, comunicate con el equipo de soporte de Venti.
                </p>
                <div style="border-top: 1px solid #27272A; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #71717A;">
                  Venti · Plataforma de música en vivo
                </div>
              </div>
            `;
            await this.transporter.sendMail({
                from: this.env.SMTP_FROM,
                to: message.to,
                subject: 'VENTI: Tu cuenta ha sido suspendida',
                text,
                html,
            });
            return;
        }

        // Notificación por correo de reactivación de cuenta
        if (message.kind === 'reactivation') {
            const userName = message.userName ? ` ${message.userName}` : '';
            const text = `Hola${userName},\n\n¡Buenas noticias! Tu cuenta en Venti ha sido reactivada. Ya podés volver a ingresar y acceder a tus funciones habituales.${message.reason ? '\n\nDetalle adicional:\n' + message.reason : ''}\n\nIngresá a la plataforma con tus credenciales habituales.\n\nAtentamente,\nEquipo de Venti`;
            const html = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #0E0E10; color: #FFFFFF; border-radius: 8px;">
                <div style="border-bottom: 2px solid #E5B32E; padding-bottom: 12px; margin-bottom: 20px;">
                  <h1 style="color: #F5C542; margin: 0; font-size: 24px; letter-spacing: 2px;">VENTI</h1>
                  <p style="color: #A1A1AA; margin: 4px 0 0 0; font-size: 12px; text-transform: uppercase;">Aviso de cuenta</p>
                </div>
                <h2 style="color: #10B981; margin-top: 0;">Tu cuenta ha sido reactivada</h2>
                <p style="color: #D4D4D8; line-height: 1.6;">
                  Hola${userName ? ` <strong>${message.userName}</strong>` : ''}, nos alegra comunicarte que tu cuenta en Venti ha sido reactivada exitosamente. Ya podés iniciar sesión con normalidad.
                </p>
                ${message.reason ? `
                <div style="background-color: #18181B; border-left: 4px solid #10B981; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
                  <strong style="color: #10B981; font-size: 13px; text-transform: uppercase;">Detalle de la reactivación:</strong>
                  <p style="color: #E4E4E7; margin: 6px 0 0 0;">${message.reason}</p>
                </div>` : ''}
                <p style="color: #A1A1AA; font-size: 14px; line-height: 1.5;">
                  Gracias por ser parte de nuestra comunidad de música en vivo.
                </p>
                <div style="border-top: 1px solid #27272A; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #71717A;">
                  Venti · Plataforma de música en vivo
                </div>
              </div>
            `;
            await this.transporter.sendMail({
                from: this.env.SMTP_FROM,
                to: message.to,
                subject: 'VENTI: Tu cuenta ha sido reactivada',
                text,
                html,
            });
            return;
        }

        // Validación de correo y recuperación de contraseña estándar
        const verification = message.kind === 'verification';
        const url = new URL(verification ? this.env.EMAIL_VERIFY_URL : this.env.PASSWORD_RESET_URL);
        url.hash = new URLSearchParams({ token: message.token }).toString();
        await this.transporter.sendMail({
            from: this.env.SMTP_FROM,
            to: message.to,
            subject: verification ? 'VENTI: verificá tu email' : 'VENTI: recuperá tu contraseña',
            text: `${verification ? 'Verificá tu email' : 'Elegí una nueva contraseña'}: ${url.toString()}\n\nSi no lo solicitaste, ignorá este mensaje.`,
        });
    }

    async close() {
        await Promise.allSettled(this.pending);
        this.transporter.close();
    }
}
