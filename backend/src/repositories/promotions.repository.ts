import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Value } from '../types/management.types.ts';
import type { PromotionRow } from '../utils/promotion.util.ts';

const columns = `id, code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses,
    status, valid_from, valid_until`;
const text = (value: unknown) => value === null || value === undefined ? null : String(value);

// Promotion rows and redemptions. Every method runs on the caller's connection: this class never opens or commits a
// transaction, so consuming/releasing a use is atomic with the purchase transition that triggers it.
export class PromotionsRepository {
    constructor(private readonly connection: PoolConnection) {}
    private async rows(sql: string, params: Value[] = []): Promise<RowDataPacket[]> {
        return (await this.connection.execute<RowDataPacket[]>(sql, params))[0];
    }
    private async execute(sql: string, params: Value[] = []): Promise<number> {
        return (await this.connection.execute<ResultSetHeader>(sql, params))[0].affectedRows;
    }
    private map(row: RowDataPacket | undefined): PromotionRow | undefined {
        if (!row) return undefined;
        return { ...row, id: String(row.id), concert_id: text(row.concert_id), discount_value: String(row.discount_value),
            min_order_amount: String(row.min_order_amount), max_uses: row.max_uses === null ? null : Number(row.max_uses),
            current_uses: Number(row.current_uses) } as PromotionRow;
    }
    // Plain (non-locking) read: used to preview/price a purchase; the authoritative check happens under lock at confirmation.
    async byCode(code: string): Promise<PromotionRow | undefined> {
        return this.map((await this.rows(`SELECT ${columns} FROM promotions WHERE code = ?`, [code]))[0]);
    }
    // Row lock: serializes every consume/release of the same promotion, so max_uses cannot be exceeded.
    async lock(id: string): Promise<PromotionRow | undefined> {
        return this.map((await this.rows(`SELECT ${columns} FROM promotions WHERE id = ? FOR UPDATE`, [id]))[0]);
    }
    // Consumes or reactivates one use for the order.
    // 1) If an active redemption already exists (released_at IS NULL), it returns 'ALREADY_ACTIVE' without incrementing.
    // 2) If a released redemption exists (released_at IS NOT NULL), it reactivates it (released_at = NULL, consumed_at = NOW)
    //    and increments current_uses (checking max_uses).
    // 3) If no redemption exists, it inserts a new record and increments current_uses.
    async consume(promotionId: string, orderId: string): Promise<'CONSUMED' | 'ALREADY_ACTIVE' | 'EXHAUSTED'> {
        const rows = await this.rows('SELECT id, released_at FROM promotion_redemptions WHERE order_id = ? FOR UPDATE', [orderId]);
        if (rows.length > 0) {
            const existing = rows[0];
            if (existing.released_at === null) {
                return 'ALREADY_ACTIVE';
            }
            // Reactivate released redemption
            const updated = await this.execute(`UPDATE promotions SET current_uses = current_uses + 1
                WHERE id = ? AND (max_uses IS NULL OR current_uses < max_uses)`, [promotionId]);
            if (updated !== 1) return 'EXHAUSTED';
            await this.execute(`UPDATE promotion_redemptions SET promotion_id = ?, consumed_at = UTC_TIMESTAMP(), released_at = NULL
                WHERE id = ?`, [promotionId, existing.id]);
            return 'CONSUMED';
        }
        const updated = await this.execute(`UPDATE promotions SET current_uses = current_uses + 1
            WHERE id = ? AND (max_uses IS NULL OR current_uses < max_uses)`, [promotionId]);
        if (updated !== 1) return 'EXHAUSTED';
        await this.execute('INSERT INTO promotion_redemptions (promotion_id, order_id, consumed_at, released_at) VALUES (?, ?, UTC_TIMESTAMP(), NULL)', [promotionId, orderId]);
        return 'CONSUMED';
    }
    // Frees the use consumed by the order, at most once: only an unreleased redemption is released.
    async release(promotionId: string, orderId: string): Promise<boolean> {
        const released = await this.execute(`UPDATE promotion_redemptions SET released_at = UTC_TIMESTAMP()
            WHERE order_id = ? AND promotion_id = ? AND released_at IS NULL`, [orderId, promotionId]);
        if (released !== 1) return false;
        await this.execute('UPDATE promotions SET current_uses = current_uses - 1 WHERE id = ? AND current_uses > 0', [promotionId]);
        return true;
    }

    async byId(id: string): Promise<(PromotionRow & { active_redemptions_count?: number; total_redemptions_count?: number }) | undefined> {
        const row = (await this.rows(`SELECT p.*,
            (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.promotion_id = p.id AND pr.released_at IS NULL) AS active_redemptions_count,
            (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.promotion_id = p.id) AS total_redemptions_count
            FROM promotions p WHERE p.id = ?`, [id]))[0];
        if (!row) return undefined;
        return {
            ...this.map(row)!,
            active_redemptions_count: Number(row.active_redemptions_count ?? 0),
            total_redemptions_count: Number(row.total_redemptions_count ?? 0),
        };
    }

    async list(params: { page?: number; limit?: number; q?: string; status?: string }): Promise<{ items: (PromotionRow & { concert_title?: string | null })[]; total: number }> {
        const page = Math.max(1, params.page ?? 1);
        const limit = Math.min(100, Math.max(1, params.limit ?? 20));
        const offset = (page - 1) * limit;
        const conditions: string[] = ['1=1'];
        const values: Value[] = [];

        if (params.q) {
            conditions.push('(p.code LIKE ? OR p.description LIKE ?)');
            const search = `%${params.q.trim()}%`;
            values.push(search, search);
        }
        if (params.status) {
            conditions.push('p.status = ?');
            values.push(params.status);
        }

        const where = conditions.join(' AND ');
        const [countRow] = await this.rows(`SELECT COUNT(*) as c FROM promotions p WHERE ${where}`, values);
        const total = Number(countRow?.c ?? 0);

        const rows = await this.rows(
            `SELECT p.*, c.title as concert_title
             FROM promotions p
             LEFT JOIN concerts c ON c.id = p.concert_id
             WHERE ${where}
             ORDER BY p.id DESC
             LIMIT ${limit} OFFSET ${offset}`,
            values,
        );

        return {
            items: rows.map(r => ({
                ...this.map(r)!,
                concert_title: r.concert_title ? String(r.concert_title) : null,
            })),
            total,
        };
    }

    async create(data: {
        code: string;
        description: string;
        discountType: 'PERCENTAGE' | 'FIXED';
        discountValue: number;
        minOrderAmount: number;
        concertId?: string | null;
        maxUses?: number | null;
        validFrom: Date;
        validUntil: Date;
    }): Promise<PromotionRow> {
        const [res] = await this.connection.execute<ResultSetHeader>(
            `INSERT INTO promotions
             (code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'ACTIVE', ?, ?)`,
            [
                data.code.trim().toUpperCase(),
                data.description.trim(),
                data.discountType,
                data.discountValue.toFixed(2),
                (data.minOrderAmount ?? 0).toFixed(2),
                data.concertId || null,
                data.maxUses ?? null,
                data.validFrom,
                data.validUntil,
            ],
        );
        return (await this.byId(String(res.insertId)))!;
    }

    async update(id: string, data: {
        description?: string;
        status?: 'ACTIVE' | 'INACTIVE';
        maxUses?: number | null;
        validUntil?: Date;
    }): Promise<PromotionRow | undefined> {
        const sets: string[] = [];
        const values: Value[] = [];
        if (data.description !== undefined) {
            sets.push('description = ?');
            values.push(data.description.trim());
        }
        if (data.status !== undefined) {
            sets.push('status = ?');
            values.push(data.status);
        }
        if (data.maxUses !== undefined) {
            sets.push('max_uses = ?');
            values.push(data.maxUses);
        }
        if (data.validUntil !== undefined) {
            sets.push('valid_until = ?');
            values.push(data.validUntil);
        }
        if (sets.length === 0) return this.byId(id);
        values.push(id);
        await this.execute(`UPDATE promotions SET ${sets.join(', ')} WHERE id = ?`, values);
        return this.byId(id);
    }

    async delete(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
        const [redemptions] = await this.rows('SELECT COUNT(*) as c FROM promotion_redemptions WHERE promotion_id = ?', [id]);
        const count = Number(redemptions?.c ?? 0);
        if (count > 0) {
            await this.execute("UPDATE promotions SET status = 'INACTIVE' WHERE id = ?", [id]);
            return { deleted: false, deactivated: true };
        }
        const affected = await this.execute('DELETE FROM promotions WHERE id = ?', [id]);
        return { deleted: affected > 0, deactivated: false };
    }
}

