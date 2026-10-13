# API — VENTI

Contrato consolidado de las rutas existentes en `backend/src/routes`. No hay endpoints de pagos, administración de usuarios/roles, creación de asignaciones Staff ni recordatorios programados.

Base: `http://localhost:3000`. JSON (`Content-Type: application/json` al enviar body); bodies con esquema estricto. Emails normalizados a minúsculas y sin espacios exteriores. Contraseña nueva: mínimo 12 caracteres, máximo 72 bytes UTF-8 (límite de bcrypt). IDs como strings; importes de respuesta como decimal string. Fechas de conciertos ISO 8601 con zona; respuestas UTC.

Éxito: `{ "success": true, "data": ... }`.
Error: `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`. `details` solo aparece cuando corresponde. Sin stack traces, SQL ni secretos.

**Público**: sin Bearer. **Sesión**: cualquier usuario autenticado activo, según política de verificación. **Opcional**: se puede enviar Bearer para ampliar visibilidad; un Bearer inválido devuelve 401. **O/A**: ORGANIZER propietario o ADMIN. Los roles se consultan en MySQL; el cliente no puede asignarlos.

Listados paginados: query `page=1&limit=20`, máximo 100; respuesta `{success:true,data:[...],pagination:{page,limit,total,total_pages}}`. Notificaciones usa otro `data` indicado abajo. Sin resultados: array vacío y `total_pages:0`. Todos los errores pueden incluir 500; rutas de sesión pueden devolver 401/403. No reintentar escrituras automáticamente ante pérdida de conexión: consultar antes su resultado.

## Autenticación

| Método y ruta | Body / autenticación | Resultado |
|---|---|---|
| POST `/auth/register` | `{first_name,last_name,email,password}` | 201: usuario público, `roles:["USER"]`, mensaje. Envía verificación. |
| POST `/auth/verify-email` | `{token}` | 200: email verificado; token de un solo uso. |
| POST `/auth/resend-verification` | `{email}` | 200: mensaje genérico; invalida verificaciones anteriores. |
| POST `/auth/login` | `{email,password}` | 200: sesión. |
| POST `/auth/refresh` | `{refreshToken}` | 200: nueva sesión; revoca refresh anterior atómicamente. |
| POST `/auth/logout` | `{refreshToken}` | 200: mensaje; idempotente. No requiere access vigente. |
| GET `/auth/me` | `Authorization: Bearer <accessToken>` | 200: `{user,roles,preferences}`. |
| POST `/auth/forgot-password` | `{email}` | 200: mensaje genérico para cuentas existentes, ausentes o inactivas. |
| POST `/auth/reset-password` | `{token,password}` | 200: cambia contraseña y revoca todos los refresh. |
| GET `/auth/oauth/:provider` | Público; `mode=web` opcional; con `codeChallenge` S256 usa intercambio, obligatorio en `mode=mobile` | 302 al proveedor y cookie HttpOnly. |
| GET `/auth/oauth/:provider/callback` | Público; `state`, `code` o `error`; cookie del mismo navegador | Sesión JSON (web sin challenge) o 302 al destino Web/Mobile con código efímero. |
| POST `/auth/oauth/:provider/link` | Bearer + `{mode?,codeChallenge?}` | `{authorizationUrl}` y cookie: inicia vinculación explícita al usuario autenticado. |
| POST `/auth/oauth/exchange` | `{code,codeVerifier}` | 200: sesión; código de un solo uso. |

Sesión: `{user,roles,accessToken,refreshToken,tokenType:"Bearer",expiresIn:900}` (expiración configurable). `user` contiene id, nombres, email, avatar, email_verified_at, estado y fechas; nunca password_hash. `preferences` contiene `recommendations_enabled` y `notifications_enabled`.

Estados: 400 JSON o estado OAuth inválido; 401 credenciales/token inválidos, caducados o consumidos; 403 falta de permisos, usuario pendiente de verificación u origen CORS; 404 ruta/recurso inexistente; 409 email o vinculación en conflicto; 422 validación; 429 límite; 500 error interno/configuración externa ausente.

Las rutas de auth son públicas salvo `/auth/me` y `/auth/oauth/:provider/link`, que requieren sesión sin rol especial. `/auth` tiene rate limit por IP configurable, y registro/login/recuperación/reenvío comparten un límite más estricto de 10 por ventana. 429 incluye `Retry-After`. Los errores de proveedor/state y validación se detallan en la sección OAuth.

Tokens persistidos de refresh, verificación y recuperación: 32 bytes aleatorios, representación hex de 64 caracteres; MySQL guarda exclusivamente SHA-256. Refresh 30 días, verificación 24 horas, recuperación 30 minutos por defecto. Todos configurables por env. Un refresh revocado no puede volver a usarse; no hay familia adicional ni revocación masiva por replay porque el esquema no la contiene.

## OAuth web

Abrir `/auth/oauth/google`, `/auth/oauth/github` o `/auth/oauth/facebook` en el navegador. La API crea un state de un uso (10 minutos), cookie HttpOnly SameSite=Lax (Secure en producción) y PKCE S256 para Google/GitHub. El callback consume el state ligado al mismo navegador y proveedor, canjea el código en servidor y responde JSON sin cache. Los tokens de proveedores no se persisten.

La identidad se resuelve primero por `(provider_id,provider_user_id)`. Si existe un usuario por email, el autovínculo requiere garantía de email verificado del proveedor **y** cuenta local previamente verificada. Así se evita conservar una contraseña que alguien pudiera haber prerregistrado usando un email ajeno.

Google usa `email_verified` de UserInfo ([referencia oficial](https://developers.google.com/identity/openid-connect/reference)); GitHub selecciona un email verificado de `/user/emails` ([referencia oficial](https://docs.github.com/en/rest/users/emails)). GitHub admite PKCE S256 ([flujo oficial](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)). Para Facebook se adopta una política conservadora: no inferir verificación del email a partir de atributos del perfil. Una cuenta nueva recibe verificación local; con la política por defecto no obtiene sesión hasta verificarla. Una cuenta existente debe usar vinculación explícita autenticada.

Si el proveedor no entrega email, un usuario nuevo recibe `OAUTH_EMAIL_REQUIRED`: registrarse por email, verificar, iniciar sesión y vincular explícitamente. La vinculación explícita se completa en un navegador que conserve la cookie de `/link`; el cliente web debe usar `credentials: include`. No se acepta un `userId` ni un redirect arbitrario del cliente.

En Etapa 5, `mode=web&codeChallenge=<S256>` redirige a `WEB_OAUTH_REDIRECT_URL` con un código efímero y utiliza `/auth/oauth/exchange`, igual que Mobile. El destino es fijo y configurado por servidor (HTTPS en producción). El modo web sin challenge conserva la respuesta JSON anterior.

## React Native / Expo

1. El cliente genera `codeVerifier` aleatorio de 43–128 caracteres permitidos por PKCE y conserva ese valor.
2. Calcula `codeChallenge = base64url(SHA256(codeVerifier))`, sin padding.
3. Abre en navegador del sistema `/auth/oauth/google?mode=mobile&codeChallenge=...` (también github/facebook). Inicio y callback se hacen en ese mismo navegador para conservar cookie.
4. El callback redirige exclusivamente a `APP_DEEP_LINK`, por ejemplo `venti://oauth-callback?code=<código efímero>`. Nunca coloca access/refresh tokens en la URL.
5. El cliente POSTea `{code,codeVerifier}` a `/auth/oauth/exchange`. El código vence en 60 segundos y solo se consume si el verifier coincide.
6. Recibe la sesión y guarda el refresh en SecureStore nativo; el frontend Web usa localStorage. El access permanece en memoria.

Las respuestas de error OAuth son JSON en la API; si el navegador externo muestra un error, cerrarlo y regresar al ingreso. `APP_DEEP_LINK` y callbacks provienen exclusivamente del entorno, sin redirecciones proporcionadas por usuarios.

## Email

Las URLs SMTP llevan el token en el fragmento para que no llegue en requests HTTP ni Referer. El cliente debe leer `#token=...` y enviarlo en JSON. La verificación y reset no se ejecutan mediante GET, evitando consumo accidental por escáneres de enlaces. Reenviar invalida el enlace previo. Las respuestas de recuperación nunca incluyen tokens ni informan si el email existe.

## Catálogos

En esta tabla `{catalog}` representa **cada una** de estas rutas reales: `artists`, `genres`, `provinces`, `cities`, `venues`. No es un parámetro abierto del servidor.

| Método | Ruta | Auth/rol | Body/query | Respuesta / errores relevantes |
| --- | --- | --- | --- | --- |
| GET | `/{catalog}` | Público | Paginación, `q`; cities permite `province_id`, venues `city_id` | 200 lista; 422 filtros. |
| GET | `/{catalog}/:id` | Público | — | 200 objeto; 404, 422. |
| POST | `/{catalog}` | ADMIN | Campos de la tabla siguiente | 201 objeto; 409 duplicado, 422 referencia/datos. |
| PATCH | `/{catalog}/:id` | ADMIN | Uno o más campos del mismo catálogo | 200 objeto; 404, 409, 422. |
| DELETE | `/{catalog}/:id` | ADMIN | Sin body | 204 sin cuerpo; 404, 409 recurso relacionado. |
| GET | `/concert-types` | Público | — | 200 array `{id,code,name}`. |

| Catálogo | Body POST (PATCH parcial) | Datos principales de respuesta |
| --- | --- | --- |
| artists | `{name,description?,image_url?,genre_ids?}` | id, nombre, descripción, imagen, `genres`. |
| genres | `{name}` | id, nombre. |
| provinces | `{name}` | id, nombre. |
| cities | `{name,province_id}` | id, nombre, provincia. |
| venues | `{name,city_id,address,capacity?}` | id, nombre, ciudad, dirección, capacidad. |

`?` indica opcional; descripción/imagen/capacidad admiten null. Imagen HTTP(S); capacidad positiva; IDs relacionados existentes. Las relaciones en uso impiden eliminaciones destructivas.

## Conciertos y tipos de entrada

`ConcertInput`: `{name,venue_id,concert_type_id,start_datetime,end_datetime?,description?,image_url?,artist_ids?,genre_ids?,ticket_types?,organizer_id?}`. `organizer_id` solo ADMIN, con organizador activo y perfil; ORGANIZER usa su propia identidad. Arrays sin IDs duplicados; `artist_ids` conserva orden. `TicketInput`: `{name,price,stock_total,sale_start?,sale_end?,max_per_purchase?}`. Precio numérico no negativo de hasta dos decimales, stock entero no negativo; máximo positivo o null. Fin posterior al inicio; ventana de venta anterior/al inicio del concierto.

`Concert` incluye id, estado/tipo, organizador, venue, ciudad/provincia, fechas, descripción, imagen y arrays `artists`, `genres`, `ticket_types`. Un tipo de entrada incluye id, concert_id, precio, stock total, ventana y máximo. Stock disponible se revalida transaccionalmente al reservar.

| Método | Ruta | Auth/rol | Body/query | Respuesta / errores |
| --- | --- | --- | --- | --- |
| GET | `/concerts` | Opcional | Paginación y filtros indicados abajo | 200 lista Concert; 403 filtro privado, 422. |
| GET | `/concerts/:id` | Opcional | — | 200 Concert; 404 inexistente/no visible. |
| POST | `/concerts` | ORGANIZER o ADMIN | ConcertInput | 201 Concert DRAFT; 403, 422 referencia/fecha/perfil. |
| PATCH | `/concerts/:id` | O/A | ConcertInput parcial sin organizer_id ni ticket_types | 200 Concert; 403, 404, 409 estado/inicio, 422. |
| DELETE | `/concerts/:id` | O/A | Sin body | 204; 403, 404, 409 si no es borrador eliminable. |
| POST | `/concerts/:id/publish` | O/A | `{}` o sin body | 200 Concert; 409 estado, 422 incompleto/fecha. |
| POST | `/concerts/:id/cancel` | O/A | `{}` o sin body | 200 Concert CANCELLED; 409 estado. Repetición cancelada conserva estado. |
| GET | `/concerts/:concertId/ticket-types` | Opcional | — | 200 array TicketType, misma visibilidad del concierto; 404. |
| POST | `/concerts/:concertId/ticket-types` | O/A | TicketInput | 201 TicketType; 403, 404, 409 estado, 422. |
| PATCH | `/ticket-types/:id` | O/A del padre | TicketInput parcial | 200 TicketType; 403, 404, 409 estado/stock comprometido, 422. |
| DELETE | `/ticket-types/:id` | O/A del padre | Sin body | 204; 403, 404, 409 uso/estado/última entrada requerida. |

Filtros `/concerts`: `q`, `name`, `artist_id`, `genre_id`, `venue_id`, `city_id`, `concert_type_id`, `type=CONCERT|FESTIVAL|LIVE_SHOW`, `date_from`, `date_to`, `status=DRAFT|PUBLISHED|CANCELLED|FINISHED`, `mine=true|false`. Fechas ISO con zona. Público/USER/STAFF solo ven PUBLISHED; ORGANIZER también propios; ADMIN todos. `mine=true` y estados privados requieren ORGANIZER/ADMIN.

Publicar exige artista, género y al menos un tipo de entrada válido; para permitir reservas debe haber cupo disponible. Conciertos iniciados/cancelados/finalizados no admiten edición ordinaria. Cancelar preserva historial y emite avisos; no reembolsa automáticamente.

## Compras, tickets y QR

| Método | Ruta | Auth/rol | Body/query | Respuesta / errores |
| --- | --- | --- | --- | --- |
| POST | `/purchases` | Sesión | `{concertId?,items:[{ticketTypeId,quantity}]}` | 201 compra RESERVED con items/total/expires_at; 404 tipo, 409 sin stock/fuera de venta/máximo, 422. |
| GET | `/purchases/me` | Sesión, propias incluso ADMIN | Paginación | 200 lista de compras. |
| GET | `/purchases/:id` | Propietario o ADMIN | — | 200 compra con items; 404 ajena/inexistente. |
| POST | `/purchases/:id/confirm` | Propietario o ADMIN | `{}` o sin body | 200 compra CONFIRMED; emite un ticket por unidad y aviso; 404, 409 vencida/estado/venta. |
| POST | `/purchases/:id/cancel` | Propietario o ADMIN | `{}` o sin body | 200 compra CANCELLED o REFUNDED e invalida tickets; 404, 409 estado/usadas/inicio. |
| GET | `/tickets` | Sesión, propios incluso ADMIN | Paginación | 200 lista de tickets con qr_token y datos del concierto/venue. |
| GET | `/tickets/:id` | Propietario o ADMIN | — | 200 ticket; 404 ajeno/inexistente. |
| POST | `/tickets/validate` | STAFF asignado o ADMIN | `{concertId,qrToken}` | 200 `{result:"VALID",ticket_id,concert_id,status:"USED"}`; errores debajo. |

Cantidad entera 1–100; máximo 100 unidades por compra, tipos no repetidos y del mismo concierto. Reserva hasta 15 minutos, acortada por inicio/cierre de venta. Confirmación no integra una pasarela. Segunda confirmación: 409 `INVALID_STATE`; reserva vencida: 409 `RESERVATION_EXPIRED`. Cancelar una confirmada devuelve internamente y libera stock si no hay tickets utilizados y el estado/fecha lo permite.

QR es un token de 64 caracteres hex, no una URL. Validación: 403 `STAFF_NOT_ASSIGNED`/`FORBIDDEN`; 404 `INVALID`; 409 `ALREADY_USED`, `WRONG_CONCERT`, `CANCELLED` o `INVALID`; 422 formato inválido. Dos escaneos concurrentes no pueden aceptar el mismo ticket. Tickets contienen `status`, `used_at`, `concert_status`; solo ACTIVE de compra CONFIRMED y concierto PUBLISHED pueden ingresar.

## Favoritos y Staff

| Método | Ruta | Auth/rol | Body/query | Respuesta / errores |
| --- | --- | --- | --- | --- |
| GET | `/favorites` | Sesión, propios | Paginación, `concert_id?` | 200 lista Concert visible; 422. |
| POST | `/favorites/:concertId` | Sesión | `{}` o sin body, sin query | 200 `{concert_id,favorite:true}`; idempotente; 404 no visible, 422. |
| DELETE | `/favorites/:concertId` | Sesión | `{}` o sin body, sin query | 200 `{concert_id,favorite:false}`; idempotente; 404 concierto inexistente. |
| GET | `/staff/assignments` | STAFF o ADMIN | Paginación | 200 Concert asignados; ADMIN global; 403, 422. |
| GET | `/concerts/:id/attendees` | STAFF asignado, ORGANIZER propietario o ADMIN | Paginación | 200 lista `{ticket_id,ticket_type_name,first_name,last_name,status,purchase_status,used_at}`; 403 ámbito, 404 concierto. |

Asistentes incluye una fila por ticket emitido; no expone email, QR ni credenciales. No existe endpoint para crear/modificar asignaciones.

## Venti Discover y preferencias

| Método | Ruta | Auth/rol | Body/query | Respuesta / errores |
| --- | --- | --- | --- | --- |
| GET | `/recommendations` | Sesión | `limit=20` (1–50) | 200 `{enabled,recommendations:[{concert,reason}]}`; 422. |
| GET | `/preferences` | Sesión | Sin query | 200 `{recommendations_enabled,notifications_enabled}`. |
| PATCH | `/preferences` | Sesión | Uno o ambos booleanos, sin query | 200 ambas preferencias; 422 vacío/campos extra/tipos. |

Siempre actúa sobre la identidad autenticada, incluso ADMIN. Defaults true si falta fila. Discover OFF devuelve array vacío; ON usa historial/favoritos y próximos publicados, excluyendo eventos adquiridos/no elegibles. Puede persistir un aviso de recomendación deduplicado por usuario/concierto cuando las preferencias lo permiten. No hay IA externa.

## Notificaciones

| Método | Ruta | Auth/rol | Body/query | Respuesta / errores |
| --- | --- | --- | --- | --- |
| GET | `/notifications` | Sesión, propias | Paginación | 200 `data:{items,unread_count}` y pagination; 422. |
| PATCH | `/notifications/read-all` | Sesión, propias | Vacío, sin query | 200 `{updated}`. |
| PATCH | `/notifications/:id/read` | Sesión, propia | Vacío, sin query | 200 `{updated}`; 404 ajena/inexistente, 422 ID. |

Item: `{id,type,title,message,concert_id,purchase_id,read_at,created_at,concert_status}`. Tipos: RECOMMENDATION, PURCHASE_CONFIRMED, CONCERT_REMINDER, SCHEDULE_CHANGE, CONCERT_CANCELLED, IMPORTANT_INFO. No hay endpoint de envío arbitrario ni recordatorios automáticos. Lectura repetida conserva la primera fecha; `unread_count` cuenta toda la bandeja. OFF suprime avisos opcionales y por favoritos; confirmaciones/cambios de compras vigentes se mantienen.

## Estadísticas

| Método | Ruta | Auth/rol | Query | Respuesta / errores |
| --- | --- | --- | --- | --- |
| GET | `/organizer/statistics` | ORGANIZER | `from?`, `to?`, `concert_id?` | 200 resumen propio; 403, 404 concierto ajeno, 422. |
| GET | `/organizer/concerts/:id/statistics` | ORGANIZER propietario | Igual; ID del path prevalece | 200 resumen del concierto; 403, 404, 422. |
| GET | `/admin/statistics` | ADMIN | Igual | 200 resumen global + users/organizers; 403, 404 concierto, 422. |

`from`/`to`: AAAA-MM-DD, inclusivos en UTC sobre creación de compra. Resumen: `{tickets_sold,revenue,confirmed_purchases,attendees,tickets_used,tickets_pending,capacity,occupancy_percent,concerts,active_concerts,sales_by_day:[{date,tickets_sold,revenue}],activity:[{status,purchases}]}`. ADMIN añade `users,organizers`. Sin datos: ceros/arrays vacíos.

Ventas/recaudación: solo compras actualmente CONFIRMED y precio histórico de items; utilizadas/asistentes cuenta tickets USED, no personas únicas. Capacidad/conciertos/usuarios reflejan estado actual, sin filtro de fecha de compra. Concierto cancelado conserva ventas confirmadas hasta devolución. ORGANIZER nunca amplía el ámbito a terceros; ADMIN sin rol ORGANIZER usa el endpoint global.
