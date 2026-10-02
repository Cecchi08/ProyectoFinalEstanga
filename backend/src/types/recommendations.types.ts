import type { Row } from './management.types.ts';

export interface SignalConcert extends Row { id: string; city_id: string; attended: number | string }
export interface GenreLink extends Row { concert_id: string; genre_id: string; name: string }
export interface ArtistLink extends Row { concert_id: string; artist_id: string; name: string }
export interface ArtistGenreLink extends GenreLink { artist_id: string }
export interface AffinityLinks { genres: GenreLink[]; artists: ArtistLink[]; artistGenres: ArtistGenreLink[] }
export interface RecommendationProfile {
    genres: Set<string>;
    historyGenres: Set<string>;
    attendedGenres: Set<string>;
    seenArtists: Set<string>;
    favoriteGenres: Set<string>;
    favoriteArtists: Set<string>;
    favorites: Set<string>;
    cityId?: string;
}
