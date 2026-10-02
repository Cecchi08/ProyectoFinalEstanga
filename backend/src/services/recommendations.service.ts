import type { Database } from '../types/management.types.ts';
import { RecommendationsRepository } from '../repositories/recommendations.repository.ts';
import { buildProfile, rankConcerts } from './recommendation-scoring.service.ts';

export class RecommendationsService {
    constructor(private readonly database: Database) {}
    preferences(userId: string) { return this.database.read(repo => new RecommendationsRepository(repo.connection).preferences(userId)); }
    setPreference(userId: string, enabled: boolean) {
        return this.database.transaction(repo => new RecommendationsRepository(repo.connection).setPreference(userId, enabled));
    }
    recommendations(userId: string, limit: number) {
        return this.database.read(async db => {
            const repo = new RecommendationsRepository(db.connection);
            if (!(await repo.preferences(userId)).recommendations_enabled) return { enabled: false, recommendations: [] };
            const history = await repo.history(userId), favorites = await repo.favorites(userId), candidates = await repo.candidates(userId);
            const ids = [...new Set([...history, ...favorites, ...candidates].map(concert => concert.id))];
            const links = await repo.links(ids);
            const ranked = rankConcerts(candidates, buildProfile(history, favorites, links), links, limit);
            const details = await repo.details(ranked.map(item => item.concert));
            return { enabled: true, recommendations: ranked.map((item, index) => ({ concert: details[index], reason: item.reason })) };
        });
    }
}
