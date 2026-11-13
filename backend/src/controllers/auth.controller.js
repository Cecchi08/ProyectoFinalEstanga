import { unauthorized } from '../utils/app-error.util.js';
export class AuthController {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    register = async (req, res) => { res.status(201).json({ success: true, data: await this.auth.register(req.body) }); };
    login = async (req, res) => {
        console.info('[AUTH_STAGE:login:controller_start]');
        const data = await this.auth.login(req.body.email, req.body.password);
        console.info('[AUTH_STAGE:login:controller_serializing]');
        res.json({ success: true, data });
        console.info('[AUTH_STAGE:login:controller_done]');
    };
    refresh = async (req, res) => {
        console.info('[AUTH_STAGE:refresh:controller_start]');
        const data = await this.auth.refresh(req.body.refreshToken);
        console.info('[AUTH_STAGE:refresh:controller_serializing]');
        res.json({ success: true, data });
        console.info('[AUTH_STAGE:refresh:controller_done]');
    };
    logout = async (req, res) => { res.json({ success: true, data: await this.auth.logout(req.body.refreshToken) }); };
    me = async (req, res) => {
        if (!req.user)
            throw unauthorized();
        res.json({ success: true, data: await this.auth.me(req.user.id) });
    };
    updateMe = async (req, res) => {
        if (!req.user)
            throw unauthorized();
        res.json({ success: true, data: await this.auth.updateProfile(req.user.id, req.body) });
    };
    verifyEmail = async (req, res) => { res.json({ success: true, data: await this.auth.verifyEmail(req.body.token) }); };
    resendVerification = async (req, res) => { res.json({ success: true, data: await this.auth.requestEmail(req.body.email, 'verification') }); };
    forgotPassword = async (req, res) => { res.json({ success: true, data: await this.auth.requestEmail(req.body.email, 'reset') }); };
    resetPassword = async (req, res) => { res.json({ success: true, data: await this.auth.resetPassword(req.body.token, req.body.password) }); };
}
