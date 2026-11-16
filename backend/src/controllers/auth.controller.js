import { unauthorized } from '../utils/app-error.util.js';
// Controlador de autenticación: expone registro, login, refresh, perfil propio y recuperación de clave.
export class AuthController {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    // Registra un nuevo usuario y devuelve HTTP 201.
    register = async (req, res) => { res.status(201).json({ success: true, data: await this.auth.register(req.body) }); };
    // Inicia sesión con email y contraseña y emite access + refresh token.
    login = async (req, res) => {
        console.info('[AUTH_STAGE:login:controller_start]');
        const data = await this.auth.login(req.body.email, req.body.password);
        console.info('[AUTH_STAGE:login:controller_serializing]');
        res.json({ success: true, data });
        console.info('[AUTH_STAGE:login:controller_done]');
    };
    // Rota el refresh token y emite un nuevo par de tokens de sesión.
    refresh = async (req, res) => {
        console.info('[AUTH_STAGE:refresh:controller_start]');
        const data = await this.auth.refresh(req.body.refreshToken);
        console.info('[AUTH_STAGE:refresh:controller_serializing]');
        res.json({ success: true, data });
        console.info('[AUTH_STAGE:refresh:controller_done]');
    };
    // Revoca el refresh token actual al cerrar sesión.
    logout = async (req, res) => { res.json({ success: true, data: await this.auth.logout(req.body.refreshToken) }); };
    // Devuelve los datos, roles y permisos vigentes del usuario autenticado.
    me = async (req, res) => {
        if (!req.user)
            throw unauthorized();
        res.json({ success: true, data: await this.auth.me(req.user.id) });
    };
    // Actualiza nombre, apellido y teléfono del usuario autenticado.
    updateMe = async (req, res) => {
        if (!req.user)
            throw unauthorized();
        res.json({ success: true, data: await this.auth.updateProfile(req.user.id, req.body) });
    };
    // Confirma la verificación de correo electrónico mediante token.
    verifyEmail = async (req, res) => { res.json({ success: true, data: await this.auth.verifyEmail(req.body.token) }); };
    // Reenvía el correo de verificación de cuenta.
    resendVerification = async (req, res) => { res.json({ success: true, data: await this.auth.requestEmail(req.body.email, 'verification') }); };
    // Solicita el envío de correo para restablecer contraseña.
    forgotPassword = async (req, res) => { res.json({ success: true, data: await this.auth.requestEmail(req.body.email, 'reset') }); };
    // Restablece la contraseña utilizando el token de recuperación.
    resetPassword = async (req, res) => { res.json({ success: true, data: await this.auth.resetPassword(req.body.token, req.body.password) }); };
}
