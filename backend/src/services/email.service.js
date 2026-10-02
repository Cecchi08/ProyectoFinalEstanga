import nodemailer from 'nodemailer';
export class SmtpMailer {
    env;
    transporter;
    pending = new Set();
    constructor(env) {
        this.env = env;
        this.transporter = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT,
            secure: env.SMTP_SECURE, requireTLS: env.NODE_ENV === 'production' && !env.SMTP_SECURE,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
            connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
            disableFileAccess: true, disableUrlAccess: true });
    }
    enqueue(message) {
        // SMTP latency must not reveal whether forgot-password found an account.
        const pending = this.send(message).catch(() => { console.error('[EMAIL_DELIVERY_FAILED] Revisar SMTP; se puede solicitar un nuevo enlace.'); });
        this.pending.add(pending);
        void pending.finally(() => this.pending.delete(pending));
    }
    async send(message) {
        const verification = message.kind === 'verification';
        const url = new URL(verification ? this.env.EMAIL_VERIFY_URL : this.env.PASSWORD_RESET_URL);
        // Fragments are not sent to HTTP servers or through Referer headers.
        url.hash = new URLSearchParams({ token: message.token }).toString();
        await this.transporter.sendMail({ from: this.env.SMTP_FROM, to: message.to,
            subject: verification ? 'VENTI: verificá tu email' : 'VENTI: recuperá tu contraseña',
            text: `${verification ? 'Verificá tu email' : 'Elegí una nueva contraseña'}: ${url.toString()}\n\nSi no lo solicitaste, ignorá este mensaje.` });
    }
    async close() { await Promise.allSettled(this.pending); this.transporter.close(); }
}
