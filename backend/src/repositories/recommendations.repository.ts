import type { PoolConnection } from 'mysql2/promise';
import { MysqlAuthRepository } from './mysql.repository.js';
import { ManagementRepository, concertSelect } from './management.repository.ts';
import type { ConcertRow } from '../types/management.types.ts';
import type { AffinityLinks, ArtistLink, GenreLink, SignalConcert } from '../types/recommendations.types.ts';
import type { PreferencesPatch } from '../validators/recommendations.schemas.ts';

// Tanto el historial como la exclusión usan la misma definición de entrada válida propia.
const validTickets = `FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id JOIN orders o ON o.id = oi.order_id
    WHERE o.user_id = ? AND o.status = 'CONFIRMED' AND t.status IN ('VALID', 'USED')`;

// Repositorio de recomendaciones: preferencias de usuario, historial de compras y conciertos candidatos.
export class RecommendationsRepository {
    private readonly management: ManagementRepository;
    constructor(private readonly connection: PoolConnection) { this.management = new ManagementRepository(connection); }
    // Devuelve las preferencias de recomendaciones y notificaciones del usuario (por defecto activas).
    async preferences(userId: string) {
        const preferences = await new MysqlAuthRepository(this.connection).preferences(userId);
        return { recommendations_enabled: preferences?.recommendations_enabled ?? true, notifications_enabled: preferences?.notifications_enabled ?? true };
    }
    // Actualiza preferencias bloqueando la fila del usuario para evitar carreras.
    async setPreference(userId: string, patch: PreferencesPatch) {
        await this.connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
        await this.connection.execute('INSERT IGNORE INTO user_preferences (user_id) VALUES (?)', [userId]);
        const fields = (['recommendations_enabled', 'notifications_enabled'] as const).filter(key => patch[key] !== undefined);
        await this.connection.execute(`UPDATE user_preferences SET ${fields.map(key => `${key} = ?`).join(',')} WHERE user_id = ?`, [...fields.map(key => Number(patch[key])), userId]);
        return this.preferences(userId);
    }
    // Obtiene conciertos pasados o actuales a los que el usuario compró entradas.
    history(userId: string): Promise<SignalConcert[]> {
        return this.management.rows<SignalConcert>(`SELECT c.id, c.city_id, owned.attended FROM concerts c
            JOIN (SELECT t.concert_id, MAX(t.status = 'USED') AS attended ${validTickets} GROUP BY t.concert_id) owned ON owned.concert_id = c.id
            WHERE c.status IN ('PUBLISHED', 'FINISHED') ORDER BY c.id`, [userId]);
    }
    // Conciertos futuros publicados para los que el usuario todavía no compró entrada.
    candidates(userId: string): Promise<ConcertRow[]> {
        return this.management.rows<ConcertRow>(`${concertSelect} WHERE c.status = 'PUBLISHED' AND c.starts_at > NOW()
            AND NOT EXISTS (SELECT 1 ${validTickets} AND t.concert_id = c.id)
            ORDER BY c.starts_at, c.id`, [userId]);
    }
    // Obtiene géneros y artistas asociados a un conjunto de conciertos para calcular afinidad.
    async links(ids: string[]): Promise<AffinityLinks> {
        if (!ids.length) return { genres: [], artists: [] };
        const marks = ids.map(() => '?').join(',');
        const genres = await this.management.rows<GenreLink>(`SELECT cg.concert_id, g.id AS genre_id, g.name
            FROM concert_genres cg JOIN genres g ON g.id = cg.genre_id WHERE cg.concert_id IN (${marks}) ORDER BY g.id`, ids);
        // Sin catálogo separado de artistas, se normaliza artist_name como clave de agrupación.
        const artists = await this.management.rows<ArtistLink>(`SELECT id AS concert_id, LOWER(TRIM(artist_name)) AS artist_key, TRIM(artist_name) AS name
            FROM concerts WHERE id IN (${marks}) ORDER BY id`, ids);
        return { genres, artists: artists.map(({ artist_key, ...link }) => ({ ...link, artist_id: String(artist_key) })) };
    }
    // Enriquece las filas de conciertos con artistas, géneros y precios.
    details(rows: ConcertRow[]) { return this.management.concertDetails(rows); }
}
