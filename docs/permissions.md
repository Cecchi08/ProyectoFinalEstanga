# Seguridad y autorización

Resumen de cómo la API decide quién puede hacer qué. La tabla completa de permisos por perfil y por endpoint está en [Perfiles, permisos y endpoints](PERMISOS.md).

## Perfiles

Un usuario tiene uno o más perfiles (filas en `user_roles`). Los perfiles se combinan: los permisos efectivos son la unión de los de cada uno.

| Perfil | Para qué | Cómo se activa |
| --- | --- | --- |
| COMPRADOR | Comprar entradas, Venti Discover y notificaciones. | Automático al registrarse; también por autoservicio |
| ARTISTA | Perfil de artista o banda: espacios, presupuestos y reservas. | Autoservicio desde `/profiles` o un ADMIN |
| ORGANIZADOR | Conciertos propios, entradas, staff, estadísticas propias, reservas de espacios y cotizaciones de servicios. | Un ADMIN desde `/admin/users` |
| VENUE | Organizaciones, establecimientos, espacios, presupuestos y reservas recibidas. | Un ADMIN |
| EMPRESA_SERVICIOS | Empresa de servicios para eventos: catálogo, integrantes y respuesta de cotizaciones. | Un ADMIN |
| ADMIN | Todos los permisos, salvo `tickets.validate` (usa `tickets.validate_all`). | Un ADMIN; el primero se carga por SQL |
| GUEST | Invitado sin registro completo. No se asigna ni se quita a mano. | Flujo de invitado |

**STAFF ya no es un perfil.** El control de ingreso depende de la asignación por concierto en `concert_staff`, que hace el organizador desde el editor del concierto. Mientras una cuenta está asignada a un concierto publicado, la API le agrega el permiso `tickets.validate`. ADMIN valida cualquier concierto con `tickets.validate_all`.

Los cambios de perfil quedan en `admin_audit_log`:

- `ROLE_GRANTED` y `ROLE_REVOKED`: los hace un ADMIN.
- `ROLE_SELF_ACTIVATED`: autoservicio de COMPRADOR y ARTISTA.
- Si una persona pide ORGANIZADOR, VENUE o EMPRESA_SERVICIOS por sí misma, recibe `403 ADMIN_APPROVAL_REQUIRED`.

La API impide dejar una cuenta sin perfiles (`LAST_ROLE`) y dejar la plataforma sin un ADMIN activo (`LAST_ADMIN`).

## Cómo se autoriza un pedido

1. `authenticate` exige un JWT Bearer HS256 con firma, emisor, audiencia y vencimiento válidos.
2. En cada pedido se relee de MySQL, en una sola consulta, el usuario activo, sus perfiles y la unión de sus permisos. Por eso quitar un perfil, un permiso o una asignación de staff surte efecto en el pedido siguiente, aunque el token de acceso siga vigente.
3. `requirePermission(...códigos)` deja pasar si el usuario tiene al menos uno de los permisos. En los servicios, `can(usuario, ...códigos)` aplica la misma regla.
4. Encima del permiso, el servicio valida la **propiedad o la membresía**:
   - dueño del concierto;
   - asignación en `concert_staff`;
   - miembro de la organización (`organization_members`: OWNER, ADMIN o STAFF), tanto de espacios como de empresas de servicios;
   - miembro del perfil de artista (`artist_members`: OWNER o MEMBER).

El catálogo de códigos está en `backend/src/utils/access.util.js`. Las asignaciones de permisos a perfiles (`role_permissions`) se siembran en `database/venti_shema2.sql`.

La autorización por rol (`authorize(...)`, `roles.includes(...)`) ya no se usa. El frontend lee los permisos de `GET /auth/me` y oculta pantallas con la misma regla `can(...)`. Esos guards son solo de interfaz: la decisión real la toma la API. Ante un `403`, el frontend recarga los permisos.

## Cuentas suspendidas

- Un ADMIN suspende una cuenta con `POST /admin/users/:id/suspend`, indicando un motivo. La cuenta pasa a `users.status = BLOCKED` y se revocan sus refresh tokens.
- El login, el refresh y cada pedido autenticado rechazan las cuentas que no están activas.
- La reactivación usa `POST /admin/users/:id/reactivate`.
- Las dos acciones se auditan (`USER_SUSPENDED` y `USER_REACTIVATED`).
- Nadie puede suspender su propia cuenta, ni al último ADMIN activo.

## Pagos simulados

Venti no procesa pagos reales ni pide datos de tarjeta.

- **Compras de entradas**: el pago simulado (`APPROVED` o `REJECTED`) confirma la compra o la deja pendiente. Cancelar una compra confirmada libera el stock, anula las entradas y marca el pago como reembolsado.
- **Reservas directas de espacios**: quedan en `HOLD` después del pago, hasta que el espacio las acepta. Una reserva `CONFIRMED` solo la puede cancelar quien reservó; el espacio recibe `409 RESERVATION_CONFIRMED`.
- **Empresas de servicios**: Venti no cobra sus servicios. Aceptar una cotización la deja contratada y el pago se arregla entre las partes.

## Sesión y transporte

- **Tokens**: el token de acceso dura 15 minutos por defecto. El logout y el reset de contraseña revocan los refresh tokens; no hay lista negra de tokens de acceso.
- **CORS**: usa una lista exacta de orígenes (`CORS_ORIGINS`).
- **Límite de pedidos**: el rate limiting por IP cubre `/auth`, con un límite más estricto para registro, login y envío de emails.
- **Proxies**: no habilitar confianza arbitraria en `X-Forwarded-For`. `TRUST_PROXY_HOPS` tiene que coincidir con los proxies reales.
- **SQL**: la sesión usa UTC y consultas parametrizadas. Los identificadores interpolados salen de constantes internas, nunca del cliente.
- **Verificación de email**: el envío y la confirmación del email funcionan. Pero hoy el bloqueo de login para cuentas sin verificar está desactivado en el código (`AuthService.verified`, marcado como temporal para pruebas). Por eso `REQUIRE_EMAIL_VERIFICATION=true` todavía no impide el ingreso.
