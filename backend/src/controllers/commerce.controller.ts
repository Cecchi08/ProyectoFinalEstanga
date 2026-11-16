import type { Request, Response } from 'express';
import { AppError, unauthorized } from '../utils/app-error.util.js';
import { CommerceService } from '../services/commerce.service.ts';
import { idSchema } from '../validators/management.schemas.ts';
import { idempotencyKeySchema, pageSchema, purchasePaymentSchema, promotionQuerySchema } from '../validators/commerce.schemas.ts';

// Helpers locales para extraer usuario autenticado, validar ID numérico de ruta y responder JSON estándar.
const principal = (req: Request) => { if (!req.user) throw unauthorized(); return req.user; };
const id = (req: Request) => idSchema.parse(req.params.id);
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

// Controlador de comercio: compras, pagos simulados, emisión/validación de QR y administración de promociones.
export class CommerceController {
    constructor(private readonly service: CommerceService) {}
    // Crea una orden reservando stock usando Idempotency-Key obligatoria.
    create = async (req: Request, res: Response) => {
        const user = principal(req);
        const header = req.get('Idempotency-Key');
        if (!header) throw new AppError(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Falta el encabezado Idempotency-Key.', undefined);
        const result = await this.service.create(req.body, user, idempotencyKeySchema.parse(header));
        // Reintento con la misma clave y contenido: 200 con la compra original, sin reservar stock ni pagos de nuevo.
        if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
        ok(res, result.purchase, result.replayed ? 200 : 201);
    };
    // Devuelve el detalle de una compra puntual.
    purchase = async (req: Request, res: Response) => { ok(res, await this.service.purchase(id(req), principal(req))); };
    // Valida un código promocional sin consumir cupos.
    validatePromotion = async (req: Request, res: Response) => { ok(res, await this.service.validatePromotion(req.body, req.user)); };
    // Devuelve una entrada digital puntual con su token QR.
    ticket = async (req: Request, res: Response) => { ok(res, await this.service.ticket(id(req), principal(req))); };
    // Ejecuta confirmación de pago (emite QR) o cancelación/reembolso sobre una orden.
    transition = (action: 'confirm' | 'cancel') => async (req: Request, res: Response) => {
        const outcome = action === 'confirm' ? purchasePaymentSchema.parse(req.body ?? {}).outcome : undefined;
        const result = await this.service.transition(id(req), action, principal(req), outcome);
        if (result && typeof result === 'object' && 'replayed' in result && result.replayed) {
            res.setHeader('Idempotent-Replayed', 'true');
        }
        ok(res, result);
    };
    // Lista paginada de compras o entradas del usuario autenticado.
    list = (kind: 'purchases' | 'tickets') => async (req: Request, res: Response) => {
        const query = pageSchema.parse(req.query && Object.keys(req.query).length ? req.query : req.body ?? {});
        const result = await this.service[kind](principal(req), query);
        res.json({ success: true, data: result.data, pagination: { ...query, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });
    };
    // Valida un código QR escaneado en puerta por personal Staff.
    validate = async (req: Request, res: Response) => { ok(res, await this.service.validate(req.body, principal(req))); };
    // Lista promociones para el panel administrativo con filtros y paginación.
    listPromotions = async (req: Request, res: Response) => {
        const query = promotionQuerySchema.parse(req.query && Object.keys(req.query).length ? req.query : req.body ?? {});
        const result = await this.service.adminListPromotions(query, principal(req));
        res.json({ success: true, data: result.items, pagination: { page: query.page, limit: query.limit, total: result.total, total_pages: Math.ceil(result.total / query.limit) } });
    };
    // Obtiene una promoción por ID (admin).
    getPromotion = async (req: Request, res: Response) => { ok(res, await this.service.adminGetPromotion(id(req), principal(req))); };
    // Crea una nueva promoción o cupón (admin).
    createPromotion = async (req: Request, res: Response) => { ok(res, await this.service.adminCreatePromotion(req.body, principal(req)), 201); };
    // Actualiza vigencia, descripción o tope de usos de una promoción (admin).
    updatePromotion = async (req: Request, res: Response) => { ok(res, await this.service.adminUpdatePromotion(id(req), req.body, principal(req))); };
    // Elimina o desactiva una promoción (admin).
    deletePromotion = async (req: Request, res: Response) => { ok(res, await this.service.adminDeletePromotion(id(req), principal(req))); };
}
