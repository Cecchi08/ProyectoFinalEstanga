import { AppError } from './app-error.util.js';
import { hashToken, randomToken } from './token.util.js';
/** Short-lived, single-use capabilities. Only token hashes are kept; no session tokens are stored here. */
export class EphemeralStore {
    ttlMs;
    limit;
    entries = new Map();
    constructor(ttlMs, limit = 10000) {
        this.ttlMs = ttlMs;
        this.limit = limit;
    }
    put(value) {
        for (const [key, entry] of this.entries)
            if (entry.expires <= Date.now())
                this.entries.delete(key);
        if (this.entries.size >= this.limit)
            throw new AppError(429, 'OAUTH_BUSY', 'Reintentá más tarde.');
        const token = randomToken();
        this.entries.set(hashToken(token), { value, expires: Date.now() + this.ttlMs });
        return token;
    }
    take(token, accepts) {
        const key = hashToken(token);
        const entry = this.entries.get(key);
        if (!entry)
            return null;
        if (entry.expires <= Date.now()) {
            this.entries.delete(key);
            return null;
        }
        if (!accepts(entry.value))
            return null;
        this.entries.delete(key);
        return entry.value;
    }
}
