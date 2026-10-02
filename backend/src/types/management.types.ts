import type { PoolConnection } from 'mysql2/promise';

export interface Principal { id: string; roles: string[] }
declare global {
    namespace Express { interface Request { user?: Principal } }
}
export interface Database {
    read<T>(work: (repo: { connection: PoolConnection }) => Promise<T>): Promise<T>;
    transaction<T>(work: (repo: { connection: PoolConnection }) => Promise<T>): Promise<T>;
}
export type Value = string | number | Date | null;
export type Fields = Record<string, Value | undefined>;
export type Row = Record<string, Value>;
export type Catalog = 'artists' | 'genres' | 'provinces' | 'cities' | 'venues';
export interface ConcertRow extends Row {
    id: string;
    organizer_id: string;
    status: string;
    start_datetime: Date;
    end_datetime: Date | null;
}
export interface TicketRow extends Row {
    id: string;
    concert_id: string;
    price: string;
    stock_total: number;
    sale_start: Date | null;
    sale_end: Date | null;
    max_per_purchase: number | null;
}
