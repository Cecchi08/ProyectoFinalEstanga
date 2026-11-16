import type { PoolConnection } from 'mysql2/promise';
import { ManagementRepository, concertSelect } from './management.repository.ts';
import type { ConcertRow, Principal, Value } from '../types/management.types.ts';
import type { PageQuery } from '../validators/commerce.schemas.ts';
import { PERMISSIONS as P, can } from '../utils/access.util.js';

// Repositorio de participación en puerta: lista conciertos asignados al staff y asistentes por concierto.
export class ParticipationRepository {
    private readonly management: ManagementRepository;
    constructor(private readonly connection: PoolConnection) { this.management = new ManagementRepository(connection); }

    // Devuelve los conciertos donde el usuario puede validar entradas QR.
    assignments(user: Principal, query: PageQuery) {
        // Los validadores globales (ADMIN) ven todos los conciertos; el resto solo sus asignaciones en concert_staff.
        const global = can(user, P.ticketsValidateAll);
        return this.concerts(global ? 'TRUE' :
            'EXISTS (SELECT 1 FROM concert_staff cs WHERE cs.concert_id = c.id AND cs.user_id = ?)',
        global ? [] : [user.id], query);
    }

    // Consulta paginada de conciertos aplicando el filtro de alcance correspondiente.
    private async concerts(where: string, values: Value[], query: PageQuery) {
        const total = Number((await this.management.rows(`SELECT COUNT(*) AS total FROM concerts c WHERE ${where}`, values))[0].total);
        const rows = await this.management.rows<ConcertRow>(`${concertSelect} WHERE ${where}
            ORDER BY c.starts_at, c.id LIMIT ? OFFSET ?`, [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data: await this.management.concertDetails(rows), total };
    }

    // Lista los asistentes (entradas emitidas) de un concierto verificando permisos dentro de la propia query.
    async attendees(concertId: string, user: Principal, query: PageQuery) {
        // Se repite el predicado de acceso en la consulta para evitar filtrar datos si se revocó un permiso en paralelo.
        const access: string[] = []; const values: Value[] = [concertId];
        if (can(user, P.concertsManageAll)) access.push('TRUE');
        if (can(user, P.concertsManage)) { access.push('c.organizer_user_id = ?'); values.push(user.id); }
        access.push('EXISTS (SELECT 1 FROM concert_staff cs WHERE cs.concert_id = c.id AND cs.user_id = ?)'); values.push(user.id);
        const from = `FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id JOIN orders o ON o.id = oi.order_id
            JOIN users u ON u.id = o.user_id JOIN ticket_types tt ON tt.id = t.ticket_type_id JOIN concerts c ON c.id = t.concert_id
            WHERE c.id = ? AND (${access.join(' OR ') || 'FALSE'})`;
        const total = Number((await this.management.rows(`SELECT COUNT(*) AS total ${from}`, values))[0].total);
        const data = await this.management.rows(`SELECT t.id AS ticket_id, tt.name AS ticket_type_name,
            u.first_name, u.last_name, t.status, o.status AS purchase_status, t.used_at ${from}
            ORDER BY t.id LIMIT ? OFFSET ?`, [...values, String(query.limit), String((query.page - 1) * query.limit)]);
        return { data, total };
    }
}
