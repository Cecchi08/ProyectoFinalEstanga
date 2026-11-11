import type { Request, Response } from 'express';
import { AppError, unauthorized } from '../utils/app-error.util.js';
import { CommerceService } from '../services/commerce.service.ts';
import { idSchema } from '../validators/management.schemas.ts';
import { idempotencyKeySchema, pageSchema, purchasePaymentSchema, promotionQuerySchema } from '../validators/commerce.schemas.ts';

const principal = (req: Request) => { if (!req.user) throw unauthorized(); return req.user; };
const id = (req: Request) => idSchema.parse(req.params.id);
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

export class CommerceController {
    constructor(private readonly service: CommerceService) {}
    create = async (req: Request, res: Response) => {
        const user = principal(req);
        const header = req.get('Idempotency-Key');
        if (!header) throw new AppError(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Falta el encabezado Idempotency-Key.', undefined);
        const result = await this.service.create(req.body, user, idempotencyKeySchema.parse(header));
        // Reintento con la misma clave y contenido: 200 con la compra original, sin reservar stock ni pagos de nuevo.
        if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
        ok(res, result.purchase, result.replayed ? 200 : 201);
    };
    purchase = async (req: Request, res: Response) => { ok(res, await this.service.purchase(id(req), principal(req))); };
    validatePromotion = async (req: Request, res: Response) => { ok(res, await this.service.validatePromotion(req.body, req.user)); };
    ticket = async (req: Request, res: Response) => { ok(res, await this.service.ticket(id(req), principal(req))); };
    transition = (action: 'confirm' | 'cancel') => async (req: Request, res: Response) => {
        const outcome = action === 'confirm' ? purchasePaymentSchema.parse(req.body ?? {}).outcome : undefined;
        const result = await this.service.transition(id(req), action, principal(req), outcome);
        if (result && typeof result === 'object' && 'replayed' in result && result.replayed) {
            res.setHeader('Idempotent-Replayed', 'true');
        }
        ok(res, result);
    };
    list = (kind: 'purchases' | 'tickets') => async (req: Request, res: Response) => {
        const query = pageSchema.parse(req.query && Object.keys(req.query).length ? req.query : req.body ?? {});
        const result = await this.service[kind](principal(req), query);
        res.json({ success: true, data: result.data, pagination: { ...query, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });
    };
    validate = async (req: Request, res: Response) => { ok(res, await this.service.validate(req.body, principal(req))); };
    listPromotions = async (req: Request, res: Response) => {
        const query = promotionQuerySchema.parse(req.query && Object.keys(req.query).length ? req.query : req.body ?? {});
        const result = await this.service.adminListPromotions(query, principal(req));
        res.json({ success: true, data: result.items, pagination: { page: query.page, limit: query.limit, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });
    };
    getPromotion = async (req: Request, res: Response) => { ok(res, await this.service.adminGetPromotion(id(req), principal(req))); };
    createPromotion = async (req: Request, res: Response) => { ok(res, await this.service.adminCreatePromotion(req.body, principal(req)), 201); };
    updatePromotion = async (req: Request, res: Response) => { ok(res, await this.service.adminUpdatePromotion(id(req), req.body, principal(req))); };
    deletePromotion = async (req: Request, res: Response) => { ok(res, await this.service.adminDeletePromotion(id(req), principal(req))); };
}
