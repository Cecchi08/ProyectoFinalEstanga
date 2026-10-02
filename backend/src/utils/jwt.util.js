import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ROLES } from '../types/auth.types.js';
import { unauthorized } from './app-error.util.js';
const claims = z.object({ sub: z.string().regex(/^[1-9]\d*$/), roles: z.array(z.enum(ROLES)).min(1), exp: z.number(), iat: z.number() });
export class AccessTokens {
    env;
    expiresIn;
    constructor(env) {
        this.env = env;
        this.expiresIn = parseInt(env.JWT_ACCESS_EXPIRES_IN, 10) * (env.JWT_ACCESS_EXPIRES_IN.endsWith('m') ? 60 : 1);
    }
    sign(id, roles) {
        return jwt.sign({ roles }, this.env.JWT_ACCESS_SECRET, { algorithm: 'HS256', subject: id,
            expiresIn: this.expiresIn, issuer: this.env.JWT_ISSUER, audience: this.env.JWT_AUDIENCE });
    }
    verify(token) {
        try {
            const payload = claims.parse(jwt.verify(token, this.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'],
                issuer: this.env.JWT_ISSUER, audience: this.env.JWT_AUDIENCE, maxAge: this.expiresIn }));
            return { id: payload.sub, roles: payload.roles };
        }
        catch {
            throw unauthorized();
        }
    }
}
