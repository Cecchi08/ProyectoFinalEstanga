import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { Principal, Value } from '../types/management.types.ts';
import { PERMISSIONS as P, can } from '../utils/access.util.js';

export interface SyncVersionsPayload {
    server_time: string;
    versions: Record<string, string>;
}

const ts = (expr: string) => `COALESCE(DATE_FORMAT(${expr}, '%Y-%m-%dT%H:%i:%s.%f'), '')`;

export class SyncRepository {
    constructor(private readonly connection: PoolConnection) {}

    private async row(sql: string, params: Value[] = []): Promise<Record<string, unknown>> {
        const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
        return (rows[0] as Record<string, unknown> | undefined) ?? {};
    }

    async versions(user?: Principal): Promise<SyncVersionsPayload> {
        const columns: string[] = [];
        const params: Value[] = [];

        // ---- Dominios públicos ----
        columns.push(
            `(SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, code, name))), 0)) FROM provinces) AS provinces`,
            `(SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, province_id, name))), 0)) FROM districts) AS districts`,
            `(SELECT CONCAT(
                (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, province_id, district_id, name, COALESCE(postal_code, '')))), 0)) FROM cities),
                '|',
                (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', city_id, is_active, sort_order))), 0)) FROM marketplace_cities)
            )) AS cities`,
            `(SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, name, slug))), 0)) FROM genres) AS genres`,
        );

        // Conciertos visibles para el usuario actual (públicos o propios/admin según permisos).
        const concertScope = can(user, P.concertsManageAll)
            ? 'TRUE'
            : user && can(user, P.concertsManage)
              ? `(c.status = 'PUBLISHED' OR c.organizer_user_id = ?)`
              : `c.status = 'PUBLISHED'`;
        if (!can(user, P.concertsManageAll) && user && can(user, P.concertsManage)) {
            params.push(user.id);
        }
        const concertChildScope = can(user, P.concertsManageAll)
            ? 'TRUE'
            : user && can(user, P.concertsManage)
              ? `c.status = 'PUBLISHED' OR c.organizer_user_id = ?`
              : `c.status = 'PUBLISHED'`;
        const pushConcertScope = () => {
            if (!can(user, P.concertsManageAll) && user && can(user, P.concertsManage)) {
                params.push(user.id);
            }
        };
        pushConcertScope();
        pushConcertScope();
        pushConcertScope();

        columns.push(
            `(SELECT CONCAT(
                (SELECT CONCAT(COUNT(*), ':', COALESCE(MAX(c.id), 0), ':', ${ts('MAX(c.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', c.id, c.status, COALESCE(c.city_id, ''), COALESCE(c.venue_id, ''), ${ts('c.updated_at')}))), 0)) FROM concerts c WHERE ${concertScope}),
                '|',
                (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(tt.updated_at)')}, ':', COALESCE(SUM(tt.quantity_sold), 0), ':', COALESCE(SUM(tt.quantity_total), 0), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', tt.id, tt.price, tt.is_active, tt.quantity_total, tt.quantity_sold))), 0)) FROM ticket_types tt JOIN concerts c ON c.id = tt.concert_id WHERE ${concertChildScope}),
                '|',
                (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', cg.concert_id, cg.genre_id))), 0)) FROM concert_genres cg JOIN concerts c ON c.id = cg.concert_id WHERE ${concertChildScope}),
                '|',
                (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', ca.concert_id, ca.artist_profile_id, ca.billing_order))), 0)) FROM concert_artists ca JOIN concerts c ON c.id = ca.concert_id WHERE ${concertChildScope}),
                '|',
                (SELECT CONCAT(COUNT(*), ':', COALESCE(SUM(oi.quantity), 0)) FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'PENDING' AND o.expires_at > NOW())
            )) AS concerts`,
        );

        // Artistas (públicos + propios si tiene permiso de artista o admin).
        const artistScope = can(user, P.artistsAdmin)
            ? 'TRUE'
            : user && can(user, P.artistProfileManage)
              ? `(ap.status = 'PUBLISHED' OR EXISTS (SELECT 1 FROM artist_members am WHERE am.artist_profile_id = ap.id AND am.user_id = ?))`
              : `ap.status = 'PUBLISHED'`;
        if (!can(user, P.artistsAdmin) && user && can(user, P.artistProfileManage)) {
            params.push(user.id);
        }
        columns.push(
            `(SELECT CONCAT(
                (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(ap.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', ap.id, ap.status, COALESCE(ap.city_id, ''), ${ts('ap.updated_at')}))), 0)) FROM artist_profiles ap WHERE ${artistScope}),
                '|',
                (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', apg.artist_profile_id, apg.genre_id))), 0)) FROM artist_profile_genres apg)
            )) AS artists`,
        );

        // Marketplace público (espacios publicados, establecimientos publicados, tipos, amenities, disponibilidad agregada anónima).
        columns.push(
            `(SELECT CONCAT(
                (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(v.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', v.id, v.status, v.price_per_hour, ${ts('v.updated_at')}))), 0)) FROM venues v WHERE v.status = 'PUBLISHED'),
                '|',
                (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(e.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', e.id, e.status, e.city_id, ${ts('e.updated_at')}))), 0)) FROM establishments e WHERE e.status = 'PUBLISHED'),
                '|',
                (SELECT CONCAT(COUNT(*), ':', COALESCE(MAX(vb.id), 0)) FROM venue_blocks vb WHERE vb.ends_at > UTC_TIMESTAMP()),
                '|',
                (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(r.updated_at)')}, ':', SUM(CASE WHEN r.status_code = 'HOLD' AND r.hold_expires_at > UTC_TIMESTAMP() THEN 1 ELSE 0 END)) FROM reservations r WHERE r.status_code IN ('HOLD', 'CONFIRMED'))
            )) AS marketplace`,
        );

        // Servicios públicos (categorías, empresas publicadas, ofertas publicadas, disponibilidad agregada).
        columns.push(
            `(SELECT CONCAT(
                (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, code, name))), 0)) FROM service_categories),
                '|',
                (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(sp.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', sp.organization_id, sp.status, sp.is_verified, ${ts('sp.updated_at')}))), 0)) FROM service_providers sp WHERE sp.status = 'PUBLISHED'),
                '|',
                (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(so.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', so.id, so.status, COALESCE(so.base_price, ''), ${ts('so.updated_at')}))), 0)) FROM service_offerings so WHERE so.status = 'PUBLISHED'),
                '|',
                (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(sq.updated_at)')}) FROM service_quotes sq WHERE sq.status = 'ACCEPTED')
            )) AS services`,
        );

        // Firma anónima de promociones activas (no expone códigos ni información privada).
        columns.push(
            `(SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, discount_type, discount_value, min_order_amount, COALESCE(concert_id, ''), COALESCE(max_uses, ''), current_uses, ${ts('valid_from')}, ${ts('valid_until')}, ${ts('updated_at')}))), 0)) FROM promotions) AS promotions_sig`,
        );

        // ---- Dominios privados del usuario autenticado ----
        if (user?.id) {
            columns.push(
                `(SELECT CONCAT(
                    (SELECT CONCAT(COALESCE(u.status, ''), ':', ${ts('u.updated_at')}, ':', COALESCE(u.first_name, ''), ':', COALESCE(u.last_name, ''), ':', COALESCE(u.phone, '')) FROM users u WHERE u.id = ?),
                    '|',
                    (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(ur.role_id), 0)) FROM user_roles ur WHERE ur.user_id = ?),
                    '|',
                    (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', pr.id, pr.status, ${ts('pr.decided_at')}))), 0)) FROM profile_requests pr WHERE pr.user_id = ?)
                )) AS me`,
            );
            params.push(user.id, user.id, user.id);

            columns.push(
                `(SELECT COALESCE((SELECT CONCAT(recommendations_enabled, ':', notifications_enabled, ':', ${ts('updated_at')}) FROM user_preferences WHERE user_id = ?), 'default')) AS preferences`,
                `(SELECT CONCAT(COUNT(*), ':', COALESCE(SUM(read_at IS NULL), 0), ':', COALESCE(MAX(id), 0)) FROM notifications WHERE user_id = ?) AS notifications`,
                `(SELECT CONCAT(
                    COUNT(*), ':',
                    ${ts('MAX(updated_at)')}, ':',
                    COALESCE(SUM(status = 'PENDING' AND expires_at > NOW()), 0), ':',
                    COALESCE(SUM(status = 'PENDING' AND (expires_at IS NULL OR expires_at <= NOW())), 0), ':',
                    COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, refund_status, ${ts('updated_at')}))), 0)
                ) FROM orders WHERE user_id = ?) AS purchases`,
                `(SELECT CONCAT(
                    COUNT(*), ':',
                    ${ts('MAX(t.updated_at)')}, ':',
                    COALESCE(SUM(t.status = 'VALID'), 0), ':',
                    COALESCE(SUM(t.status = 'USED'), 0), ':',
                    COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', t.id, t.status, c.status, ${ts('t.updated_at')}, ${ts('c.updated_at')}))), 0)
                ) FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id JOIN orders o ON o.id = oi.order_id JOIN concerts c ON c.id = t.concert_id WHERE o.user_id = ?) AS tickets`,
            );
            params.push(user.id, user.id, user.id, user.id);

            // Propuestas visibles al usuario.
            if (can(user, P.artistsAdmin)) {
                columns.push(
                    `(SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, ${ts('updated_at')}))), 0)) FROM artist_proposals) AS proposals`,
                );
            } else {
                columns.push(
                    `(SELECT CONCAT(COUNT(*), ':', ${ts('MAX(p.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', p.id, p.status, ${ts('p.updated_at')}))), 0))
                        FROM artist_proposals p
                        LEFT JOIN concerts c ON c.id = p.concert_id
                        WHERE p.sender_user_id = ?
                           OR c.organizer_user_id = ?
                           OR EXISTS (SELECT 1 FROM artist_members am WHERE am.artist_profile_id = p.artist_profile_id AND am.user_id = ?)
                           OR EXISTS (SELECT 1 FROM establishments e JOIN organization_members om ON om.organization_id = e.organization_id WHERE e.id = p.establishment_id AND om.user_id = ?)
                    ) AS proposals`,
                );
                params.push(user.id, user.id, user.id, user.id);
            }

            // Operaciones marketplace propias / de sus organizaciones (o todas si marketplace.admin).
            if (can(user, P.marketplaceAdmin)) {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}) FROM organizations),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, ${ts('updated_at')}))), 0)) FROM establishments),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, ${ts('updated_at')}))), 0)) FROM venues),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(MAX(id), 0), ':', COALESCE(BIT_XOR(id), 0)) FROM venue_blocks),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, ${ts('updated_at')}))), 0)) FROM quotes),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}, ':', SUM(CASE WHEN status_code = 'HOLD' AND hold_expires_at <= UTC_TIMESTAMP() THEN 1 ELSE 0 END), ':', SUM(CASE WHEN status_code = 'CONFIRMED' AND teardown_end_at <= UTC_TIMESTAMP() THEN 1 ELSE 0 END)) FROM reservations)
                    )) AS marketplace_ops`,
                );
            } else {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', om.organization_id, om.user_id, om.member_role))), 0)) FROM organization_members om WHERE om.organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = ?)),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(e.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', e.id, e.status, ${ts('e.updated_at')}))), 0)) FROM establishments e JOIN organization_members om ON om.organization_id = e.organization_id WHERE om.user_id = ?),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(v.updated_at)')}) FROM venues v JOIN establishments e ON e.id = v.establishment_id JOIN organization_members om ON om.organization_id = e.organization_id WHERE om.user_id = ?),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(MAX(vb.id), 0), ':', COALESCE(BIT_XOR(vb.id), 0)) FROM venue_blocks vb JOIN establishments e ON e.id = vb.establishment_id JOIN organization_members om ON om.organization_id = e.organization_id WHERE om.user_id = ?),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(q.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', q.id, q.status, ${ts('q.updated_at')}))), 0)) FROM quotes q JOIN venues v ON v.id = q.venue_id JOIN establishments e ON e.id = v.establishment_id WHERE q.requester_user_id = ? OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = e.organization_id AND om.user_id = ?)),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(r.updated_at)')}, ':', COALESCE(SUM(CASE WHEN r.status_code = 'HOLD' AND r.hold_expires_at <= UTC_TIMESTAMP() THEN 1 ELSE 0 END), 0), ':', COALESCE(SUM(CASE WHEN r.status_code = 'CONFIRMED' AND r.teardown_end_at <= UTC_TIMESTAMP() THEN 1 ELSE 0 END), 0), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', r.id, r.status_code, ${ts('r.updated_at')}))), 0)) FROM reservations r JOIN establishments e ON e.id = r.establishment_id WHERE r.user_id = ? OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = e.organization_id AND om.user_id = ?))
                    )) AS marketplace_ops`,
                );
                params.push(user.id, user.id, user.id, user.id, user.id, user.id, user.id, user.id);
            }

            // Operaciones de empresas de servicios y cotizaciones técnicas.
            if (can(user, P.servicesAdmin)) {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}) FROM service_providers),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}) FROM service_offerings),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, ${ts('updated_at')}))), 0)) FROM service_quotes)
                    )) AS services_ops`,
                );
            } else {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(sp.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', sp.organization_id, sp.status, sp.is_verified, ${ts('sp.updated_at')}))), 0)) FROM service_providers sp JOIN organization_members om ON om.organization_id = sp.organization_id WHERE om.user_id = ?),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(so.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', so.id, so.status, ${ts('so.updated_at')}))), 0)) FROM service_offerings so JOIN organization_members om ON om.organization_id = so.organization_id WHERE om.user_id = ?),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(sq.updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', sq.id, sq.status, ${ts('sq.updated_at')}))), 0)) FROM service_quotes sq WHERE sq.requester_user_id = ? OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = sq.organization_id AND om.user_id = ?))
                    )) AS services_ops`,
                );
                params.push(user.id, user.id, user.id, user.id);
            }

            // Staff y control de puerta (asignaciones + tickets de conciertos accesibles).
            if (can(user, P.ticketsValidateAll) || can(user, P.concertsManageAll)) {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', concert_id, user_id))), 0)) FROM concert_staff),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}, ':', COALESCE(SUM(status = 'USED'), 0)) FROM tickets)
                    )) AS staff`,
                );
            } else {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', cs.concert_id, cs.user_id))), 0)) FROM concert_staff cs WHERE cs.user_id = ?),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(t.updated_at)')}, ':', COALESCE(SUM(t.status = 'USED'), 0))
                         FROM tickets t JOIN concerts c ON c.id = t.concert_id
                         WHERE c.organizer_user_id = ?
                            OR EXISTS (SELECT 1 FROM concert_staff cs WHERE cs.concert_id = c.id AND cs.user_id = ?))
                    )) AS staff`,
                );
                params.push(user.id, user.id, user.id);
            }

            // Estadísticas según alcance real del usuario.
            if (can(user, P.statisticsGlobal)) {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}) FROM orders),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(SUM(status = 'USED'), 0), ':', ${ts('MAX(updated_at)')}) FROM tickets),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}) FROM concerts),
                        '|',
                        (SELECT COUNT(*) FROM users)
                    )) AS statistics`,
                );
            } else if (can(user, P.statisticsOwn)) {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(c.updated_at)')}) FROM concerts c WHERE c.organizer_user_id = ?),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(o.updated_at)')}) FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN concerts c ON c.id = oi.concert_id WHERE c.organizer_user_id = ?),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(SUM(t.status = 'USED'), 0), ':', ${ts('MAX(t.updated_at)')}) FROM tickets t JOIN concerts c ON c.id = t.concert_id WHERE c.organizer_user_id = ?)
                    )) AS statistics`,
                );
                params.push(user.id, user.id, user.id);
            }

            // ---- Dominios administrativos (estrictamente validados por permiso) ----
            if (can(user, P.ordersReadAll, P.catalogsManage)) {
                columns.push(
                    `(SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, code, description, status, discount_type, discount_value, min_order_amount, COALESCE(concert_id, ''), COALESCE(max_uses, ''), current_uses, ${ts('valid_from')}, ${ts('valid_until')}, ${ts('updated_at')}))), 0)) FROM promotions) AS admin_promotions`,
                );
            }
            if (can(user, P.usersManage)) {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}, ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, ${ts('updated_at')}))), 0)) FROM users),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', user_id, role_id))), 0)) FROM user_roles),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, ${ts('decided_at')}))), 0)) FROM profile_requests),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(MAX(id), 0)) FROM admin_audit_log)
                    )) AS admin_users`,
                );
            }
            if (can(user, P.usersManage, P.marketplaceAdmin)) {
                columns.push(
                    `(SELECT CONCAT(
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}) FROM organizations),
                        '|',
                        (SELECT COUNT(*) FROM organization_members),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}) FROM establishments),
                        '|',
                        (SELECT CONCAT(COUNT(*), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', organization_id, status, is_verified, ${ts('updated_at')}))), 0)) FROM service_providers)
                    )) AS admin_organizations`,
                );
            }
            if (can(user, P.marketplaceAdmin)) {
                columns.push(
                    `(SELECT CONCAT(COUNT(*), ':', ${ts('MAX(updated_at)')}, ':', COALESCE(SUM(status = 'PENDING_REVIEW'), 0), ':', COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, status, ${ts('updated_at')}))), 0)) FROM establishments) AS admin_establishments`,
                );
            }
        }

        const raw = await this.row(`SELECT ${columns.join(', ')}`, params);
        const versions: Record<string, string> = {};
        for (const [key, value] of Object.entries(raw)) {
            versions[key] = value == null ? '0' : String(value);
        }

        return {
            server_time: new Date().toISOString(),
            versions,
        };
    }
}
