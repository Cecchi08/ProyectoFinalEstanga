import type { Database } from '../types/management.types.ts';
import { RecommendationsRepository } from '../repositories/recommendations.repository.ts';
import { buildProfile, rankConcerts } from './recommendation-scoring.service.ts';
import { NotificationsRepository } from '../repositories/notifications.repository.ts';
import type { PreferencesPatch } from '../validators/recommendations.schemas.ts';

export class RecommendationsService {
    constructor(private readonly database: Database) {}
    preferences(userId: string) { return this.database.read(repo => new RecommendationsRepository(repo.connection).preferences(userId)); }
    setPreference(userId: string, patch: PreferencesPatch) {
        return this.database.transaction(repo => new RecommendationsRepository(repo.connection).setPreference(userId, patch));
    }
    async recommendations(userId: string, limit: number) {
        const result = await this.database.read(async db => {
            const repo = new RecommendationsRepository(db.connection);
            if (!(await repo.preferences(userId)).recommendations_enabled) return { enabled: false, recommendations: [] };
            const history = await repo.history(userId), candidates = await repo.candidates(userId);
            const ids = [...new Set([...history, ...candidates].map(concert => concert.id))];
            const links = await repo.links(ids);
            const ranked = rankConcerts(candidates, buildProfile(history, links), links, limit);
            const details = await repo.details(ranked.map(item => item.concert));
            return { enabled: true, recommendations: ranked.map((item, index) => ({ concert: details[index], reason: item.reason })) };
        });
        const first = result.recommendations[0];
        if (first) await this.database.transaction(async db => {
            // Same parent-first order as commerce/management; never hold a user lock while waiting for a concert.
            await db.connection.execute('SELECT id FROM concerts WHERE id = ? FOR UPDATE', [first.concert.id]);
            await db.connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
            await new NotificationsRepository(db.connection).recommendation(userId, first.concert.id, first.reason);
        });
        return result;
    }
}
