import type { PoolConnection } from 'mysql2/promise';
import { MysqlAuthRepository } from './mysql.repository.js';
import { ManagementRepository, concertSelect } from './management.repository.ts';
import type { ConcertRow } from '../types/management.types.ts';
import type { AffinityLinks, ArtistGenreLink, ArtistLink, GenreLink, SignalConcert } from '../types/recommendations.types.ts';

// Both history and exclusion use the same definition of a valid owned ticket.
const validTickets = `FROM tickets t JOIN ticket_statuses ts ON ts.id = t.status_id
    JOIN purchase_items pi ON pi.id = t.purchase_item_id JOIN purchases p ON p.id = pi.purchase_id
    JOIN purchase_statuses ps ON ps.id = p.status_id JOIN ticket_types tt ON tt.id = pi.ticket_type_id
    WHERE p.user_id = ? AND ps.code = 'CONFIRMED' AND ts.code IN ('ACTIVE', 'USED')`;

export class RecommendationsRepository {
    private readonly management: ManagementRepository;
    constructor(private readonly connection: PoolConnection) { this.management = new ManagementRepository(connection); }
    async preferences(userId: string): Promise<{ recommendations_enabled: boolean }> {
        const preferences = await new MysqlAuthRepository(this.connection).preferences(userId);
        return { recommendations_enabled: preferences?.recommendations_enabled ?? true };
    }
    async setPreference(userId: string, enabled: boolean) {
        await this.connection.execute(`INSERT INTO user_preferences (user_id, recommendations_enabled) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE recommendations_enabled = ?`, [userId, enabled, enabled]);
        return { recommendations_enabled: enabled };
    }
    history(userId: string): Promise<SignalConcert[]> {
        return this.management.rows<SignalConcert>(`SELECT c.id, v.city_id, owned.attended FROM concerts c
            JOIN venues v ON v.id = c.venue_id JOIN concert_statuses cs ON cs.id = c.status_id
            JOIN (SELECT tt.concert_id, MAX(ts.code = 'USED') AS attended ${validTickets} GROUP BY tt.concert_id) owned ON owned.concert_id = c.id
            WHERE cs.code IN ('PUBLISHED', 'FINISHED') ORDER BY c.id`, [userId]);
    }
    favorites(userId: string): Promise<SignalConcert[]> {
        return this.management.rows<SignalConcert>(`SELECT c.id, v.city_id, 0 AS attended FROM favorites f
            JOIN concerts c ON c.id = f.concert_id JOIN venues v ON v.id = c.venue_id
            JOIN concert_statuses cs ON cs.id = c.status_id
            WHERE f.user_id = ? AND cs.code IN ('PUBLISHED', 'FINISHED') ORDER BY c.id`, [userId]);
    }
    candidates(userId: string): Promise<ConcertRow[]> {
        return this.management.rows<ConcertRow>(`${concertSelect} WHERE s.code = 'PUBLISHED' AND c.start_datetime > NOW()
            AND NOT EXISTS (SELECT 1 ${validTickets} AND tt.concert_id = c.id)
            ORDER BY c.start_datetime, c.id`, [userId]);
    }
    async links(ids: string[]): Promise<AffinityLinks> {
        if (!ids.length) return { genres: [], artists: [], artistGenres: [] };
        const marks = ids.map(() => '?').join(',');
        const genres = await this.management.rows<GenreLink>(`SELECT cg.concert_id, g.id AS genre_id, g.name
            FROM concert_genres cg JOIN genres g ON g.id = cg.genre_id WHERE cg.concert_id IN (${marks}) ORDER BY g.id`, ids);
        const artists = await this.management.rows<ArtistLink>(`SELECT ca.concert_id, a.id AS artist_id, a.name
            FROM concert_artists ca JOIN artists a ON a.id = ca.artist_id WHERE ca.concert_id IN (${marks}) ORDER BY a.id`, ids);
        const artistGenres = await this.management.rows<ArtistGenreLink>(`SELECT ca.concert_id, ca.artist_id, g.id AS genre_id, g.name
            FROM concert_artists ca JOIN artist_genres ag ON ag.artist_id = ca.artist_id JOIN genres g ON g.id = ag.genre_id
            WHERE ca.concert_id IN (${marks}) ORDER BY ca.artist_id, g.id`, ids);
        return { genres, artists, artistGenres };
    }
    details(rows: ConcertRow[]) { return this.management.concertDetails(rows); }
}
