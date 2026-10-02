import type { ConcertRow } from '../types/management.types.ts';
import type { AffinityLinks, RecommendationProfile, SignalConcert } from '../types/recommendations.types.ts';

const numericIdOrder = (left: string, right: string) => BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0;

export function buildProfile(history: SignalConcert[], favorites: SignalConcert[], links: AffinityLinks): RecommendationProfile {
    const historyIds = new Set(history.map(c => c.id));
    const attendedIds = new Set(history.filter(c => Number(c.attended) === 1).map(c => c.id));
    const favoriteIds = new Set(favorites.map(c => c.id));
    const genresFor = (ids: Set<string>) => new Set([...links.genres, ...links.artistGenres].filter(link => ids.has(link.concert_id)).map(link => link.genre_id));
    const historyGenres = genresFor(historyIds);
    const favoriteGenres = genresFor(favoriteIds);
    // One vote per distinct concert; buying several tickets cannot inflate affinity.
    const cities = new Map<string, number>();
    const signals = new Map([...history, ...favorites].map(concert => [concert.id, concert]));
    for (const concert of signals.values()) cities.set(concert.city_id, (cities.get(concert.city_id) ?? 0) + 1);
    const cityId = [...cities].sort(([idA, countA], [idB, countB]) => countB - countA || numericIdOrder(idA, idB))[0]?.[0];
    return { genres: new Set([...historyGenres, ...favoriteGenres]), historyGenres, attendedGenres: genresFor(attendedIds),
        seenArtists: new Set(links.artists.filter(link => attendedIds.has(link.concert_id)).map(link => link.artist_id)),
        favoriteGenres, favoriteArtists: new Set(links.artists.filter(link => favoriteIds.has(link.concert_id)).map(link => link.artist_id)),
        favorites: favoriteIds, cityId };
}

export function rankConcerts(candidates: ConcertRow[], profile: RecommendationProfile, links: AffinityLinks, limit: number) {
    // Index batched relations once; no per-concert SQL or repeated full-array scans.
    function group<T extends { concert_id: string }>(rows: T[]) {
        const result = new Map<string, T[]>();
        for (const row of rows) { const values = result.get(row.concert_id) ?? []; values.push(row); result.set(row.concert_id, values); }
        return result;
    }
    const genres = group(links.genres), artists = group(links.artists), artistGenres = group(links.artistGenres);
    const ranked = candidates.map(concert => {
        let score = 0; const reasons: string[] = [];
        const concertGenres = genres.get(concert.id) ?? [], concertArtists = artists.get(concert.id) ?? [], relatedGenres = artistGenres.get(concert.id) ?? [];
        const genre = concertGenres.find(g => profile.genres.has(g.genre_id));
        if (genre) {
            score += 5;
            reasons.push(profile.attendedGenres.has(genre.genre_id) ? `Porque asististe a conciertos relacionados con ${genre.name}.` :
                profile.historyGenres.has(genre.genre_id) ? `Porque tenés entradas confirmadas para conciertos relacionados con ${genre.name}.` :
                    `Porque guardaste conciertos relacionados con ${genre.name}.`);
        }
        const artist = concertArtists.find(a => profile.seenArtists.has(a.artist_id));
        if (artist) { score += 4; reasons.push(`Porque ya usaste entradas para ver a ${artist.name}.`); }
        const artistGenre = relatedGenres.find(g => profile.genres.has(g.genre_id));
        if (artistGenre) { score += 3; reasons.push(`Porque sus artistas interpretan ${artistGenre.name}, un género afín a tus conciertos.`); }
        const favorite = profile.favorites.has(concert.id);
        if (favorite || concertGenres.some(g => profile.favoriteGenres.has(g.genre_id)) || concertArtists.some(a => profile.favoriteArtists.has(a.artist_id)) || relatedGenres.some(g => profile.favoriteGenres.has(g.genre_id))) {
            score += 2; reasons.push(favorite ? 'Porque guardaste este concierto en favoritos.' : 'Porque guardaste eventos similares.');
        }
        if (concert.city_id === profile.cityId) { score += 1; reasons.push(`Porque se realiza en ${concert.city_name}, una ciudad de tus conciertos.`); }
        return { concert, score, reason: reasons.join(' ') || 'Un próximo concierto publicado para descubrir.' };
    });
    const relevant = ranked.some(item => item.score > 0) ? ranked.filter(item => item.score > 0) : ranked;
    return relevant.sort((a, b) => b.score - a.score || a.concert.start_datetime.getTime() - b.concert.start_datetime.getTime() || numericIdOrder(a.concert.id, b.concert.id)).slice(0, limit);
}
