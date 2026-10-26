import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Fields, Row, Value } from '../types/management.types.ts';
import type { ArtistQuery } from '../validators/artists.schemas.ts';
import { PERMISSIONS as P } from '../utils/access.util.js';
import { ManagementRepository, concertSelect } from './management.repository.ts';
import type { ConcertRow } from '../types/management.types.ts';

const normalize = <T extends Row>(row: T): T => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value !== null && (key === 'id' || key.endsWith('_id')) ? String(value) : value])) as T;
const columns = ['stage_name', 'slug', 'bio', 'city_id', 'image_url', 'website', 'status', 'published_at', 'created_by_user_id'] as const;
const profileSelect = `SELECT a.id, a.stage_name, a.slug, a.bio, a.city_id, ci.name AS city_name, a.image_url, a.website, a.status,
    a.published_at, a.created_at, a.updated_at FROM artist_profiles a LEFT JOIN cities ci ON ci.id = a.city_id`;

export class ArtistsRepository {
    constructor(private readonly connection: PoolConnection) {}
    async rows<T extends Row = Row>(sql: string, params: Value[] = []): Promise<T[]> {
        const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
        return (rows as T[]).map(normalize);
    }
    async execute(sql: string, params: Value[] = []): Promise<number> {
        return (await this.connection.execute<ResultSetHeader>(sql, params))[0].affectedRows;
    }
    async insert(data: Fields): Promise<string> {
        const keys = columns.filter(key => data[key] !== undefined);
        await this.execute(`INSERT INTO artist_profiles (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(key => data[key] ?? null));
        return String((await this.rows('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'))[0].id);
    }
    async update(id: string, data: Fields): Promise<void> {
        const keys = columns.filter(key => data[key] !== undefined);
        if (keys.length) await this.execute(`UPDATE artist_profiles SET ${keys.map(key => `${key} = ?`).join(',')} WHERE id = ?`, [...keys.map(key => data[key] ?? null), id]);
    }
    // Parent lock for every write on a profile and its members/genres.
    async lock(id: string): Promise<Row | undefined> {
        return (await this.rows('SELECT id, status, published_at FROM artist_profiles WHERE id = ? FOR UPDATE', [id]))[0];
    }
    async profile(id: string): Promise<Row | undefined> { return (await this.rows(`${profileSelect} WHERE a.id = ?`, [id]))[0]; }
    async list(query: ArtistQuery) {
        const where = ["a.status = 'PUBLISHED'"]; const values: Value[] = [];
        if (query.q) { where.push('a.stage_name LIKE ?'); values.push(`%${query.q}%`); }
        if (query.city_id) { where.push('a.city_id = ?'); values.push(query.city_id); }
        if (query.genre_id) { where.push('EXISTS (SELECT 1 FROM artist_profile_genres g WHERE g.artist_profile_id = a.id AND g.genre_id = ?)'); values.push(query.genre_id); }
        const clause = ` WHERE ${where.join(' AND ')}`;
        const total = Number((await this.rows(`SELECT COUNT(*) AS total FROM artist_profiles a${clause}`, values))[0].total);
        const data = await this.rows(`${profileSelect}${clause} ORDER BY a.stage_name, a.id LIMIT ? OFFSET ?`,
            [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data: await this.withGenres(data), total };
    }
    mine(userId: string) {
        return this.rows(`${profileSelect} JOIN artist_members m ON m.artist_profile_id = a.id AND m.user_id = ?
            ORDER BY a.stage_name, a.id`, [userId]).then(rows => this.withGenres(rows));
    }
    async withGenres(rows: Row[]) {
        if (!rows.length) return [];
        const ids = rows.map(row => String(row.id));
        const genres = await this.rows(`SELECT g.artist_profile_id, ge.id, ge.name, ge.slug FROM artist_profile_genres g JOIN genres ge ON ge.id = g.genre_id
            WHERE g.artist_profile_id IN (${ids.map(() => '?').join(',')}) ORDER BY ge.name`, ids);
        return rows.map(row => ({ ...row, genres: genres.filter(g => g.artist_profile_id === row.id).map(({ artist_profile_id: _id, ...genre }) => genre) }));
    }
    async replaceGenres(id: string, genreIds: string[]): Promise<void> {
        await this.execute('DELETE FROM artist_profile_genres WHERE artist_profile_id = ?', [id]);
        if (genreIds.length) await this.execute(`INSERT INTO artist_profile_genres (artist_profile_id, genre_id) VALUES ${genreIds.map(() => '(?, ?)').join(',')}`,
            genreIds.flatMap(genre => [id, genre]));
    }
    async memberRole(id: string, userId: string): Promise<string | undefined> {
        return (await this.rows<{ member_role: string }>('SELECT member_role FROM artist_members WHERE artist_profile_id = ? AND user_id = ?', [id, userId]))[0]?.member_role;
    }
    // Public view shows names only; members (and admins) also see emails.
    members(id: string, withEmail: boolean) {
        return this.rows(`SELECT m.user_id, u.first_name, u.last_name, ${withEmail ? 'u.email,' : ''} m.member_role, m.created_at
            FROM artist_members m JOIN users u ON u.id = m.user_id WHERE m.artist_profile_id = ?
            ORDER BY FIELD(m.member_role, 'OWNER', 'MEMBER'), m.created_at, m.user_id`, [id]);
    }
    // Membership never grants a profile: the account must already hold artist.profile.manage (ARTISTA or ADMIN).
    async candidate(email: string): Promise<{ id: string; artist: boolean } | undefined> {
        const row = (await this.rows(`SELECT u.id, EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id = u.id AND p.code = ?) AS artist
            FROM users u WHERE u.email = ? AND u.status = 'ACTIVE' AND u.is_guest = 0`, [P.artistProfileManage, email]))[0];
        return row ? { id: String(row.id), artist: Number(row.artist) === 1 } : undefined;
    }
    addMember(id: string, userId: string, role: string) {
        return this.execute('INSERT INTO artist_members (artist_profile_id, user_id, member_role) VALUES (?, ?, ?)', [id, userId, role]);
    }
    setMemberRole(id: string, userId: string, role: string) {
        return this.execute('UPDATE artist_members SET member_role = ? WHERE artist_profile_id = ? AND user_id = ?', [role, id, userId]);
    }
    removeMember(id: string, userId: string) { return this.execute('DELETE FROM artist_members WHERE artist_profile_id = ? AND user_id = ?', [id, userId]); }
    // Performances: concerts that bill this profile. Drafts stay private to their organizer.
    async concerts(id: string) {
        const management = new ManagementRepository(this.connection);
        const rows = await management.rows<ConcertRow>(`${concertSelect} JOIN concert_artists ca ON ca.concert_id = c.id
            WHERE ca.artist_profile_id = ? AND c.status <> 'DRAFT' ORDER BY c.starts_at DESC, c.id DESC LIMIT 200`, [id]);
        return management.concertDetails(rows);
    }
    async owners(id: string): Promise<number> {
        return Number((await this.rows("SELECT COUNT(*) AS total FROM artist_members WHERE artist_profile_id = ? AND member_role = 'OWNER'", [id]))[0].total);
    }
}
