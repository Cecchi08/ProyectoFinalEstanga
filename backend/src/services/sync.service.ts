import type { Database, Principal } from '../types/management.types.ts';
import { SyncRepository } from '../repositories/sync.repository.ts';

export class SyncService {
    constructor(private readonly db: Database) {}

    async versions(user?: Principal) {
        return this.db.read(async connection => {
            const repo = new SyncRepository(connection.connection);
            return repo.versions(user);
        });
    }
}

