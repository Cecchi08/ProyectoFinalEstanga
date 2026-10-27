# Venti: estado del proyecto

Revisión del 2026-10-27 sobre `main` en `8243a55`, actualizada el mismo día con la verificación de la sección 11 (`main` local en `136e6fa`, sin push). Los tests y el e2e se corrieron solo contra un MySQL 8 local aislado; no se conectó a Railway. Cada afirmación indica el archivo que la respalda.

## 1. Resumen ejecutivo

**Qué es.** Venti es una aplicación académica: un marketplace de música en vivo con cuatro frentes.

- **Conciertos y entradas:** descubrir y publicar conciertos, comprar entradas con QR y controlar el ingreso.
- **Espacios:** reservar salas y escenarios.
- **Empresas de servicios:** pedir cotizaciones a empresas de servicios para eventos.
- **Perfiles de artista:** artistas y bandas que aparecen en el cartel de los conciertos.

Los pagos son siempre simulados (`README.md`).

**Qué está listo.** Los once módulos de la sección 4 tienen backend, pantallas y autorización por permisos. Con el esquema vigente pasan **170/170 tests de backend, 13/13 de frontend y 8/8 casos del e2e** (sección 11). Typecheck y lint pasan en el backend y en el frontend.

**Qué falta:**

- TLS verificado hacia MySQL: Railway no entrega una CA verificable (sección 13).
- Algunas decisiones de producto (sección 7).

**Riesgo principal.** La conexión a MySQL no usa TLS. El servidor de Railway lo acepta, pero la app se conecta sin cifrar y, desde fuera de Railway, lo hace por Internet (sección 8). La migración de revisión de establecimientos ya está aplicada en Railway desde el 2026-10-27 (sección 12).

## 2. Arquitectura

### Backend (Node 22+, Express 5, TypeScript y JavaScript)

- **Arranque:** `backend/src/server.js` arranca la app definida en `backend/src/app.js`.
- **Middleware global (`app.js`):**
  - `helmet` con `referrerPolicy: no-referrer`;
  - CORS con lista exacta (`CORS_ORIGINS`);
  - `express.json` con límite de 16 kB;
  - `trust proxy` según `TRUST_PROXY_HOPS`;
  - `notFound` y `errorHandler` (`src/middlewares/error.middleware.js`).
- **Capas:** `src/routes` → `src/controllers` → `src/services` → `src/repositories`. Además:
  - validación con Zod en `src/validators`, aplicada por `src/middlewares/validation.middleware.js`;
  - autenticación y permisos en `src/middlewares/auth.middleware.js`: `authenticate`, `requirePermission`, `authorizeConcertOwner` y `authorizeStaffAssignment`.
- **Rutas:** 140 manejadores en 11 módulos.

| Archivo en `src/routes/` | Manejadores | Contenido |
| --- | --- | --- |
| `auth.routes.js` | 13 | Registro, login, refresh, verificación, reset, OAuth (con rate limit) |
| `management.routes.ts` | 20 | Conciertos, tipos de entrada, staff, catálogos |
| `commerce.routes.ts` | 8 | Compras, pago simulado, entradas, validación QR |
| `participation.routes.ts` | 2 | Asignaciones de staff y asistentes |
| `marketplace.routes.ts` | 38 | Organizaciones, establecimientos, espacios, bloqueos, presupuestos, reservas, pagos |
| `services.routes.ts` | 28 | Empresas de servicios, servicios, integrantes, disponibilidad, cotizaciones |
| `artists.routes.ts` | 12 | Perfiles de artista, integrantes, presentaciones |
| `admin.routes.ts` | 10 | `/me/profiles`, `/admin/users`, suspensión, auditoría, organizaciones |
| `statistics.routes.ts` | 3 | Estadísticas propias y globales |
| `recommendations.routes.ts` | 3 | Venti Discover y preferencias |
| `notifications.routes.ts` | 3 | Notificaciones |

- **Transacciones:** viven en los servicios.
- **Concurrencia de reservas:** el marketplace llama a los procedimientos `sp_create_reservation_hold` y `sp_simulate_payment` fuera de la transacción de la aplicación y reintenta ante `ER_LOCK_DEADLOCK` (`src/services/marketplace.service.ts`).

### Frontend (Expo SDK 57, React Native 0.86, React 19, Expo Router; también se exporta a Web)

No es React con Vite. Es una sola base de código para Android, iOS y Web (`frontend/package.json`, `frontend/app.json`).

- **Rutas:** 58 archivos en `frontend/app/`.
  - El grupo `(auth)` contiene login, registro, verificación y reset.
  - El grupo `(app)` contiene las secciones autenticadas.
- **Shell:** `src/components/layout/Shell.tsx`. Arma la navegación lateral en escritorio y la inferior en móvil, según permisos. La pestaña Staff aparece si hay asignaciones.
- **Contextos:**
  - `src/contexts/AuthContext.tsx`: sesión, `can(...)` con los permisos de `GET /auth/me` y recarga de permisos al volver a la app y ante un 403;
  - `src/contexts/NotificationsContext.tsx`: contador de no leídas;
  - `src/contexts/PreferencesContext.tsx`.
- **Guards:**
  - `Require` y `Guard` en `Shell.tsx`;
  - 8 layouts con `Guard permissions={[...]}`: `admin`, `admin/users`, `artists`, `organizer`, `marketplace/manage`, `marketplace/quotes`, `marketplace/reservations` y `services/quotes`.
- **Cliente HTTP:** `src/services/http.ts` y `src/services/api.ts`. Valida el sobre `{success,data}` y hace refresh automático.
- **Almacenamiento:** `src/services/storage.ts` (SecureStore) y `storage.web.ts` (localStorage).
- **Tema:** `src/components/ui/theme.ts`, en violeta eléctrico y solo modo oscuro. En Web, `src/components/layout/webStyles.web.ts` agrega variables CSS `--venti-*`, foco visible y `prefers-reduced-motion`.

### Base de datos (`database/venti_shema2.sql`, 1605 líneas, MySQL 8)

Es el único esquema; `database/schema.sql` se eliminó en `27f3f24`. Contenido:

- **56 tablas**, agrupadas así:
  - identidad y acceso: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `admin_audit_log`, tokens y `oauth_accounts`;
  - catálogos: `provinces`, `districts`, `cities`, `genres`, `marketplace_cities`;
  - marketplace: `organizations`, `organization_members`, `establishments`, `venues` y sus fotos, comodidades y horarios, `quotes`, `reservations`, `reservation_occupancies`, `venue_blocks`, `payments`;
  - conciertos: `concerts`, `concert_genres`, `concert_artists`, `concert_staff`, `ticket_types`, `orders`, `order_items`, `order_payments`, `tickets`, `ticket_validations`;
  - artistas: `artist_profiles`, `artist_members`, `artist_profile_genres`;
  - servicios: `service_categories`, `service_providers`, `service_offerings`, `service_quotes`, `service_quote_items`;
  - otros: `recommendations`, `notifications`.
- **1 vista:** `v_blocked_slots`, la ocupación efectiva de reservas y bloqueos.
- **9 triggers:** `trg_reservations_*` (4), `trg_occupancies_*` (3) y `trg_venue_blocks_*` (2). Garantizan que las franjas no se superpongan, que las reservas sean inmutables y que los estados avancen solo por transiciones válidas.
- **5 procedimientos:**
  - `sp_assert_slot_free`;
  - `sp_create_reservation_hold`;
  - `sp_simulate_payment`;
  - `sp_expire_holds`;
  - `sp_complete_reservations`.
- **1 evento:** `ev_reservations_maintenance`, que corre cada minuto, vence los HOLD y completa las reservas.
- **Datos iniciales:** se cargan con `INSERT IGNORE`: 7 roles, 25 permisos y sus asignaciones, estados, categorías de servicios y catálogos del marketplace.
- **Migraciones:** `database/migrations/20261026_perfiles_y_pagos.sql` ya está aplicada en Railway y no hay que volver a ejecutarla.

### Conexión a Railway

`backend/src/config/db.config.js` lee la conexión en este orden:

1. `MYSQL_PUBLIC_URL` o `MYSQL_URL`;
2. si no están, `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD` y `MYSQLDATABASE`;
3. si tampoco, las variables `DB_*`.

La base por defecto es `venti`. `backend/scripts/db-check.js` verifica con `SELECT 1` que la base conectada sea `venti`.

Otros scripts operativos, que requieren confirmación explícita: `db-backup.mjs`, `db-migrate.mjs` y `db-recreate.mjs`.

El pool no configura TLS (no hay `ssl` en `db.config.js`). Ver la sección 8.

## 3. Roles y permisos

**Modelo.** La API autoriza por permiso. En cada pedido, `MysqlAuthRepository.access` relee el usuario, sus perfiles y la unión de sus permisos (`backend/src/repositories/mysql.repository.js`). Las referencias:

- catálogo de códigos: `backend/src/utils/access.util.js`;
- asignaciones a perfiles: `role_permissions` en `venti_shema2.sql`;
- tabla completa por endpoint: `docs/PERMISOS.md`;
- explicación de seguridad: `docs/permissions.md`.

| Rol | Permisos (además de `concerts.browse`, `tickets.purchase` y `marketplace.venues.browse`) | Activación |
| --- | --- | --- |
| ADMIN | Todos, salvo `tickets.validate` | El primero por SQL, después `/admin/users` |
| COMPRADOR | Solo los tres básicos | Automático al registrarse |
| ARTISTA | `marketplace.quotes.request`, `marketplace.reservations.create`, `artist.profile.manage` | Autoservicio con `POST /me/profiles` |
| ORGANIZADOR | `concerts.manage`, `concerts.staff.manage`, `statistics.own`, `marketplace.quotes.request`, `marketplace.reservations.create`, `services.quotes.request` | Un ADMIN |
| VENUE | `marketplace.establishments.manage`, `marketplace.quotes.respond`, `marketplace.reservations.manage`, `services.quotes.request` | Un ADMIN |
| EMPRESA_SERVICIOS | `services.manage`, `services.quotes.respond` | Un ADMIN |
| GUEST | Solo los tres básicos | Flujo de invitado; no se asigna a mano |

**Dónde se aplican:**

- **Backend:** `requirePermission(...)` en cada archivo de `src/routes/`, y `can(user, ...)` en los servicios para la propiedad y la membresía. Ejemplos: `commerce.service.ts:140` y `participation.repository.ts:13`.
  - Las reglas de negocio de perfiles también viven en `src/services/admin.service.ts`: `ADMIN_APPROVAL_REQUIRED`, `LAST_ROLE`, `LAST_ADMIN` y `SELF_SUSPEND`.
- **Frontend:** `can(...)` de `AuthContext`, los menús de `Shell.tsx` y los `Guard` de los layouts. Los guards de la interfaz no reemplazan la autorización de la API.

**Regla de STAFF.** STAFF no es un perfil. Aparece en dos lugares distintos:

1. **Control de ingreso por concierto.** El organizador asigna cuentas en `concert_staff` (`POST /concerts/:id/staff`).
   - Mientras una cuenta tiene una asignación a un concierto `PUBLISHED`, `access()` le agrega `tickets.validate` (`mysql.repository.js:53-61`). Ningún rol tiene ese permiso.
   - Ese permiso ordena la interfaz (pestaña Staff). La validación la autoriza el servicio, por concierto: `POST /tickets/validate` exige asignación en `concert_staff` para ese concierto o `tickets.validate_all` (`commerce.service.ts:140`). Sin asignación responde `403 STAFF_NOT_ASSIGNED`.
   - La ruta no tiene `requirePermission` desde `4f2f698`. Con el gate en la ruta, un concierto cancelado hacía desaparecer el permiso derivado: el staff recibía `FORBIDDEN` en vez de `CANCELLED` y el intento no quedaba en `ticket_validations` (`commerce.routes.ts`).
   - ADMIN valida cualquier concierto con `tickets.validate_all`.
2. **Rol de miembro de una organización.** `organization_members.member_role ENUM('OWNER','ADMIN','STAFF')` (`venti_shema2.sql:240`) se usa en espacios y en empresas de servicios.
   - STAFF puede ver la organización, pero no gestionarla.
   - Gestionan OWNER y ADMIN, y siempre queda al menos un OWNER (`validators/marketplace.schemas.ts:17`, `services.service.ts:132-155`).

## 4. Funcionalidades por módulo

| Módulo | Estado | Respaldo y observaciones |
| --- | --- | --- |
| Autenticación y verificación de email | **Hecho** | `auth.routes.js`, `services/auth.service.js`. Bcrypt, JWT de acceso de 15 minutos con refresh token, OAuth Google/GitHub/Facebook con PKCE, rate limit. La verificación de email se reactivó en `27f3f24`: con `REQUIRE_EMAIL_VERIFICATION=true`, login, refresh, OAuth y cada pedido autenticado devuelven `403 EMAIL_VERIFICATION_REQUIRED`. El envío real depende de un SMTP configurado. |
| Cuentas y perfiles | **Hecho** | `admin.service.ts`, `features/auth/ProfilesScreen.tsx`, `features/admin/UsersScreen.tsx`. Autoservicio de COMPRADOR y ARTISTA; asignación y quita por ADMIN; suspensión que revoca sesiones. Todo queda auditado. La suspensión de **organizaciones** (`organizations.status` = `SUSPENDED`) existe en el esquema, pero no tiene endpoint: se puede ver, no cambiar. |
| Conciertos | **Hecho** | `management.service.ts`, `features/organizer/ConcertEditor.tsx`, `features/concerts/`. CRUD, publicación y cancelación con avisos. Lugar en texto libre o desde una reserva confirmada. Desde `c3e69b8`, un concierto en un espacio del marketplace solo se publica con una reserva propia `CONFIRMED` que cubra la fecha, revalidada al publicar (`management.service.ts`, `booked`). Filtros por texto, artista, género, espacio, ciudad, fechas y precio (`min_price`/`max_price`). |
| Entradas | **Hecho** | `commerce.service.ts`, `features/purchases/`. Compra en estado PENDING con vencimiento. Pago simulado APPROVED o REJECTED. Cancelar una compra confirmada libera el stock, anula las entradas y marca el pago como reembolsado. |
| QR | **Hecho** | `utils/qr.util.ts`, `features/tickets/TicketsScreen.tsx`, `features/staff/StaffScreen.tsx`. QR de 64 caracteres hexadecimales, un solo uso (`ticket_validations`). Escaneo con cámara en Android e iOS; en Web, entrada manual o lector USB. En `4f2f698` se corrigió la autorización de `POST /tickets/validate` (sección 11). |
| Marketplace: búsqueda y disponibilidad | **Hecho** | `marketplace.repository.ts`, `features/marketplace/MarketplaceScreen.tsx` y `VenueScreen.tsx`. Filtros por ciudad, tipo, comodidades, capacidad, precio y franja. La disponibilidad sale de `v_blocked_slots`. Desde `c3e69b8`, el dueño envía el establecimiento a revisión (`PENDING_REVIEW`) y solo un ADMIN lo publica (`features/admin/EstablishmentsReviewScreen.tsx`). La búsqueda pública solo muestra `PUBLISHED` (`marketplace.repository.ts:13`). |
| Marketplace: presupuestos | **Hecho** | `features/marketplace/QuotesScreen.tsx`. Pedir, responder con ítems, aceptar (crea la reserva), rechazar y cancelar. |
| Marketplace: reservas y pago simulado | **Hecho** | `ReservationsScreen.tsx`, `marketplace.service.ts:413-470`. La reserva queda en HOLD, se paga en forma simulada y el venue la acepta o rechaza. Con presupuesto aceptado, el pago la confirma. El venue no cancela una reserva CONFIRMED (`409 RESERVATION_CONFIRMED`). Desde `8243a55`, una cuenta solo VENUE tiene accesos y enlaces desde las notificaciones. |
| Empresas de servicios | **Hecho** | `services.service.ts`, `features/services/`. Empresas, servicios, integrantes, publicación, verificación por ADMIN, disponibilidad informativa y cotizaciones (pedir, responder, contratar). Desde `c3e69b8`, `GET /notifications` devuelve `service_quote_id` (`notifications.repository.ts`) y la app muestra **Ver cotización**. |
| Artistas | **Hecho** | `artists.service.ts`, `features/artists/ArtistsScreen.tsx`. Perfil con integrantes, publicación, vínculo con el cartel del concierto (`concert_artists`, selector en `ConcertEditor.tsx:37`) y presentaciones en el perfil público (`GET /artists/:id/concerts`). |
| Administración y auditoría | **Hecho** | `features/admin/` y `admin_audit_log`. Usuarios, perfiles, suspensiones, auditoría filtrable, catálogos y listado de organizaciones. |
| Estadísticas | **Hecho** | `statistics.service.ts`, `features/statistics/`. Propias (`statistics.own`) y globales (`statistics.global`), con gráficos SVG. |
| Recomendaciones | **Hecho** | `recommendation-scoring.service.ts`. Explicables y basadas solo en el historial de entradas (no hay favoritos). Se pueden desactivar desde las preferencias. |

## 5. Calidad

- **Tests.** Se ejecutaron el 2026-10-27 contra un MySQL 8.0.46 local y aislado, creado con `database/venti_shema2.sql`. El detalle de los fallos está en la sección 11.

  | Suite | Resultado |
  | --- | --- |
  | Backend (`npm test`, 12 archivos de `backend/tests/`) | **170/170** (162 originales y 8 nuevos) |
  | Frontend (`npm test`, `frontend/tests/http.test.ts`) | **13/13** |
  | E2E (`npm run test:e2e`, `backend/scripts/stage5-e2e.mjs`, Edge) | **8/8** casos |

  `tests/helpers.js` crea una base `venti_test_*` por archivo y la borra al terminar.
- **Lint y typecheck.** En la última corrida, después de `8243a55`, pasaron los cuatro chequeos:
  - backend: `npm run check` (tsc más sintaxis de 39 archivos JavaScript) y `npm run lint`;
  - frontend: `npm run typecheck` y `npm run lint`.

  `npm run lint` tolera cero advertencias (`frontend/package.json`).
- **Cobertura aproximada.** No hay herramienta de cobertura. Según la búsqueda de endpoints en los tests:
  - **Cubiertos:** autenticación (incluido `login exige email verificado`, `auth.test.js:72`), conciertos, compras, QR y staff, marketplace (incluidas aceptación y rechazo de reservas, revisión de establecimientos y regla de publicación de conciertos), perfiles, `/admin/users` y `service_quote_id` en notificaciones.
  - **Agregados el 2026-10-27:**
    - empresas de servicios (`tests/services.test.js`): alta y catálogo, visibilidad pública, verificación auditada, integrantes y reglas de OWNER, y el ciclo completo de cotizaciones (pedir, responder, contratar, vencer, rechazar, cancelar y disponibilidad);
    - suspensión de cuentas (`profiles.test.js`): permiso, motivo, `SELF_SUSPEND`, corte inmediato de acceso, login y refresh, reactivación y auditoría;
    - pago REJECTED de compras (`commerce.test.js`): la compra queda PENDING sin entradas, APPROVED la confirma, y cancelar reembolsa y audita.
  - **Cubiertos solo por el e2e:** filtro `min_price`/`max_price` y `artist_profile_ids` en conciertos.
- **Deuda técnica:**
  - **Backend mixto JavaScript y TypeScript:** autenticación, configuración y middleware siguen en `.js`.
  - **Tablas sin uso en el backend:** `device_push_tokens`, `reservation_statuses` (se usan códigos directamente) y `user_genre_preferences`.
  - **Sin `/health`:** `docs/INSTALLATION.md` recomienda probar `/genres`.
  - **Estado en memoria:** los estados de OAuth y el rate limit viven en memoria, así que solo admiten una instancia de Node (`README.md`).
  - **Contratos históricos:** `docs/VENTI_ETAPA_*.md` y `docs/VENTI_AJUSTE_5_1.md` conservan los roles viejos, marcados con una nota de documento histórico.
  - **`docs/API.md`:** se corrigieron sus referencias de roles, pero el detalle completo de los módulos nuevos está en `docs/PERMISOS.md`, no en `API.md`.

## 6. Pendientes priorizados

Varios puntos de la lista original ya se resolvieron. Se indican para cerrarlos.

| Prioridad | Pendiente | Estado y motivo |
| --- | --- | --- |
| — | Aplicar `database/migrations/20261027_revision_establecimientos.sql` en Railway | **Hecho** el 2026-10-27, con respaldo previo y verificación (sección 12). No volver a ejecutarla: no es idempotente. |
| 1 | Conexión TLS a MySQL con verificación | **Detenido, requiere tu decisión.** Railway no entrega una CA verificable: el servidor presenta una CA autogenerada por MySQL y sin nombres de host. La conexión no se cambió (sección 13). |
| 3 | Tests de API para el filtro de precio y los artistas del cartel | **Pendiente.** Hoy los cubre solo el e2e. |
| — | Concierto publicado cuya reserva se cancela | **Resuelto con la opción A** en la rama `tls-y-cancelaciones`, sin merge todavía: se bloquea la cancelación (sección 13). |
| — | Correr tests de backend, frontend y e2e contra MySQL 8 aislado | **Hecho** el 2026-10-27: 170/170, 13/13 y 8/8 (sección 11). |
| — | Tests de API para empresas de servicios, suspensión y pago REJECTED | **Hecho** el 2026-10-27 (5 tests nuevos, sección 11). |
| — | Notificaciones de empresas de servicios | **Hecho** en `c3e69b8` (`service_quote_id` y botón **Ver cotización**). |
| — | Frontend de empresas de servicios | **Hecho** en `f5b401d` (`features/services/`). |
| — | Selector de artistas en conciertos | **Hecho** en `e405f13` (`ConcertEditor.tsx`, `ArtistPicker`). |
| — | Presentaciones del artista | **Hecho** en `e405f13` (`ArtistsScreen.tsx`, `Performances`). |
| — | Filtro de precio | **Hecho** en `e405f13` (`ConcertList.tsx`, `management.schemas.ts`). |
| — | Miembros de empresas | **Hecho** en `5ad8e94` (`/services/providers/:id/members`). |
| — | Disponibilidad de servicios | **Hecho** en `5ad8e94` (`/services/offerings/:id/availability`). |
| — | El venue no cancela reservas confirmadas | **Hecho** en `5ad8e94` (`marketplace.service.ts:396`). |
| — | Estilo visual | **Hecho** en `c2dd817`. Solo modo oscuro; el modo claro no se pidió. |

## 7. Decisiones abiertas

- **Favoritos.** No existen en el esquema y se quitaron del código (`recommendation-scoring.service.ts:6`). Hay que decidir si vuelven. Implicaría una tabla nueva, endpoints, una pantalla y una señal más para las recomendaciones.
- **Sectores y condiciones del venue.**
  - `venues` no tiene sectores (ubicaciones o subdivisiones con capacidad propia) ni condiciones de uso. Sus columnas son capacidad, metros cuadrados, precio por hora, mínimo de reserva y duración del HOLD (`venti_shema2.sql`, `CREATE TABLE venues`).
  - Las entradas de los conciertos tampoco tienen sector: solo tipos de entrada.
  - Las condiciones existen solo para servicios (`service_offerings.conditions`).
- **Varias imágenes.**
  - Los espacios ya admiten varias fotos (`venue_photos`, con orden y portada) cargadas como URL. No hay subida de archivos (`marketplace.repository.ts:191-193`).
  - Conciertos y perfiles de artista tienen una sola `image_url`.
  - Hay que decidir si se agregan galerías y si se suben archivos o se usan solo URLs.
- **Mensajería del artista.** No existe ningún canal de mensajes: no hay tabla ni endpoint. Hoy la comunicación entre partes son las notas de presupuestos y cotizaciones (`requester_notes`, `provider_notes`) y las notificaciones del sistema.

## 8. Riesgos

### Seguridad

- **Secretos.**
  - No hay `.env` versionados: `.gitignore` excluye `**/.env` y `**/.env.*` y conserva solo `.env.example`.
  - Una búsqueda de patrones de contraseñas y claves en `backend/src` y `frontend/src` no encontró valores fijos en el código.
  - `backend/.env` existe en local con la conexión a Railway. Hay que cuidarlo fuera de Git.
  - `EXPO_PUBLIC_API_URL` es pública por diseño.
- **Autorización.**
  - Se aplica por permiso en cada ruta y se relee por pedido.
  - No queda `authorize(...)` por rol.
  - El único `roles.includes` del frontend (`UsersScreen.tsx:238`) solo muestra perfiles, no autoriza.
  - `POST /tickets/validate` se autoriza en el servicio, por concierto (sección 3).
  - Riesgo residual: los endpoints sin tests de API (sección 5).
- **Verificación de email.**
  - Estuvo desactivada desde `5381ce9` hasta `27f3f24`.
  - Las cuentas creadas en ese período pueden no tener el email verificado. Desde ahora no van a poder ingresar hasta verificarlo.
  - Sin SMTP configurado en el entorno real, nadie nuevo puede verificar.
- **Transporte (TLS hacia MySQL).** Verificado por lectura; no se cambió la conexión.
  - **Qué hace el código.** `backend/src/config/db.config.js` no configura `ssl`, así que mysql2 no exige TLS. Además, **prioriza `MYSQL_PUBLIC_URL` sobre `MYSQL_URL`**: si las dos están definidas en el servicio de Railway, la API sale por el proxy público aunque corra dentro de Railway.
  - **Red privada de Railway.** `MYSQL_URL` (`*.railway.internal`) viaja dentro de la red privada del proyecto, que Railway cifra con túneles WireGuard ([documentación de Railway](https://docs.railway.com/guides/private-networking)).
  - **Proxy público.** `MYSQL_PUBLIC_URL` sale por Internet a través del TCP proxy. Según respuestas del equipo de Railway en su foro (sobre Postgres), el proxy usa certificados autofirmados y no ofrece certificados firmados por una CA, así que no se puede verificar al servidor (`verify-full`). La alternativa que recomiendan es la red privada ([hilo 1](https://station.railway.com/questions/verify-full-ssl-mode-on-postgres-databse-4d035b2c), [hilo 2](https://station.railway.com/questions/postgre-sql-ssl-connection-self-signed-33f0d3b6)). No encontré documentación específica de MySQL; el resultado medido sobre el servidor está en la sección 12.
  - **Opciones, a decidir:**
    1. **API desplegada en Railway:** usar solo `MYSQL_URL` (red privada cifrada) y quitar `MYSQL_PUBLIC_URL` de ese servicio, o invertir la prioridad en `db.config.js`.
    2. **Conexiones desde fuera (desarrollo local con `MYSQL_PUBLIC_URL`):** agregar `ssl` en mysql2. Con certificado autofirmado, la única opción que funciona es `ssl: { rejectUnauthorized: false }`: cifra el tráfico, pero no autentica al servidor. La sección 12 confirma que el MySQL de Railway acepta TLS.

### Datos

- La base de Railway se recreó desde el esquema el 2026-10-26 y después recibió la migración de perfiles y pagos.
- Según el control de solo lectura del 2026-10-27, tiene **2 usuarios** (3 asignaciones de perfil), los catálogos, 0 establecimientos y 0 conciertos. Si la segunda cuenta no tiene el email verificado, no va a poder ingresar.
- La migración de revisión de establecimientos se aplicó el 2026-10-27 (sección 12).
- Faltan datos de demostración: provincias, ciudades, géneros, conciertos y espacios se cargan desde la interfaz (`docs/INSTALLATION.md`, "Cuentas y perfiles para la demostración").
- `20261026_perfiles_y_pagos.sql` no es idempotente: volver a ejecutarla falla en los `ALTER TABLE ... ADD COLUMN`.

### Operación

- **Evento de mantenimiento.** `ev_reservations_maintenance` corre cada minuto y necesita `event_scheduler=ON`, que está activo en Railway según el control del 2026-10-26.
  - Si se apaga (por ejemplo, al reiniciar o migrar el servidor), los HOLD vencidos y las reservas terminadas no cambian de estado en la tabla.
  - La API mitiga esto: calcula el estado efectivo al leer (`marketplace.repository.ts:20`).
- **Permiso `EXECUTE`.** El usuario de la API lo necesita para los procedimientos.
- **Una sola instancia.** El rate limit y los estados de OAuth viven en memoria.
- **Notificaciones.** Se consultan periódicamente; no hay push. `device_push_tokens` no se usa.

## 9. Historial reciente (`568832b` → `136e6fa`)

La base es `568832b` ("Backup"): el commit ya publicado que agregó los patches de respaldo. Sobre ella hay seis commits, publicados el 2026-10-27:

- **Interfaz:**
  - `c2dd817`: tema visual centralizado en violeta eléctrico (botones, campos, avisos, navegación, foco visible).
  - `8243a55`: accesos de VENUE a presupuestos y reservas recibidos, y enlaces desde las notificaciones.
- **Backend:** `27f3f24` reactivó la verificación de email, borró `database/schema.sql` y apuntó `db-check.js` al esquema vigente.
- **Pruebas:** `f4a0492` actualizó `stage5-e2e.mjs` al flujo actual (perfiles por la interfaz, artistas, filtro de precio, pago simulado, aceptación del venue, empresas de servicios). En ese momento no se ejecutó; se ejecutó después (sección 11).
- **Limpieza y documentación:**
  - `84bb351`: eliminó `diagnostico_marketplace/` y `perfiles_y_pagos/`.
  - `77cc833` y `27f3f24`: alinearon README, `INSTALLATION.md`, `permissions.md`, `PERMISOS.md`, `API.md` y `USER_MANUAL.md` con los perfiles y permisos actuales, y marcaron los contratos históricos.

Commits locales del 2026-10-27, **sin push**:

- `4f2f698`: limpieza de `order_payments` en los tests, autorización de la validación QR en el servicio y tests actualizados a reglas ya vigentes.
- `c3e69b8`: revisión de establecimientos por ADMIN (esquema y migración sin aplicar), reserva confirmada para conciertos en el marketplace y `service_quote_id` en notificaciones.
- `136e6fa`: el e2e incluye la aprobación del establecimiento.
- El commit siguiente actualiza este reporte, `PERMISOS.md` y `USER_MANUAL.md`.

## 10. Cómo levantar el proyecto

**Requisitos:** Node 22.13+, npm, MySQL 8.0 u 8.4 (no MariaDB) y SMTP (por ejemplo, Mailpit en local). El detalle completo está en `docs/INSTALLATION.md`.

**Variables del backend** (`backend/.env.example`; solo nombres):

- **Servidor:** `NODE_ENV`, `PORT`.
- **Base:** `MYSQL_PUBLIC_URL`, `MYSQL_URL`, `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, `DB_CONNECTION_LIMIT`.
- **Tokens:** `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_ISSUER`, `JWT_AUDIENCE`, `REFRESH_TOKEN_EXPIRES_DAYS`.
- **Email y contraseñas:** `EMAIL_VERIFICATION_EXPIRES_HOURS`, `PASSWORD_RESET_EXPIRES_MINUTES`, `REQUIRE_EMAIL_VERIFICATION`, `BCRYPT_ROUNDS`.
- **Red:** `CORS_ORIGINS`, `TRUST_PROXY_HOPS`, `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`.
- **SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `EMAIL_VERIFY_URL`, `PASSWORD_RESET_URL`.
- **OAuth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FACEBOOK_CALLBACK_URL`, `FACEBOOK_GRAPH_VERSION`, `APP_DEEP_LINK`, `WEB_OAUTH_REDIRECT_URL`.
- **Tests:** `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`; opcional, `E2E_BROWSER_CHANNEL`.

**Variable del frontend** (`frontend/.env.example`): `EXPO_PUBLIC_API_URL`.

**Comandos**, desde la raíz:

```text
npm ci --prefix backend
npm ci --prefix frontend
# copiar backend/.env.example a backend/.env y frontend/.env.example a frontend/.env, y completarlos

# Base local nueva (MySQL 8): SOURCE database/venti_shema2.sql;
# crear el usuario de la API con SELECT, INSERT, UPDATE, DELETE y EXECUTE sobre venti.*

cd backend
npm run db:check        # confirma la conexión y que la base sea "venti"
npm run dev             # o: npm run build && npm start   → http://localhost:3000

cd frontend
npm run web             # http://localhost:8081   (npm start para Expo en el teléfono)
```

**Orden para probar:**

1. Revisión estática:
   - backend: `npm run check` y `npm run lint`;
   - frontend: `npm run typecheck` y `npm run lint`.
2. Tests de backend contra MySQL 8 aislado: `docker compose -f compose.test.yml up -d --wait`, luego `TEST_DB_*` y `npm test`. **Nunca contra Railway.**
   - Sin Docker, como en la verificación de la sección 11, se puede levantar un `mysqld` 8 temporal con su propio directorio de datos. Desde la carpeta `bin` de MySQL 8:
     1. `mysqld --no-defaults --initialize-insecure --datadir=<carpeta>`;
     2. `mysqld --no-defaults --datadir=<carpeta> --port=33316 --bind-address=127.0.0.1 --event-scheduler=ON`;
     3. con `TEST_DB_HOST=127.0.0.1` y `TEST_DB_PORT=33316`.

     No toca los servicios MySQL instalados.
3. Tests de frontend: `npm test`.
4. E2E: `npm run build` en el frontend con `EXPO_PUBLIC_API_URL=http://localhost:3000`, y después `npm run test:e2e` en el backend, con los mismos `TEST_DB_*`.
5. Prueba manual en local:
   1. Registrar y verificar el email.
   2. Dar ADMIN a la primera cuenta por SQL.
   3. Asignar los demás perfiles desde `/admin/users`.
   4. Seguir la demostración de `docs/USER_MANUAL.md`.

## 11. Verificación del 2026-10-27

**Entorno.**

- **MySQL:** 8.0.46 temporal, separado de los servicios del equipo (`mysqld --no-defaults` con su propio directorio de datos, en `127.0.0.1:33316` y con `event_scheduler=ON`). Se usaron `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER` y `TEST_DB_PASSWORD` explícitos. No se conectó a Railway.
- **E2E:** se ejecutó con el build web apuntando a `http://localhost:3000` y el canal `msedge`. Para liberar el puerto 3000 se detuvo, con autorización, el `npm run dev` local, que usa la base de Railway.

**Reglas de negocio.**

| Regla | Antes | Resultado |
| --- | --- | --- |
| Un espacio nuevo queda pendiente; solo los aprobados aparecen en búsquedas | No existía revisión: el dueño publicaba directo | **Implementado** en `c3e69b8`. El dueño lo envía a revisión (`PENDING_REVIEW`) y solo `marketplace.admin` lo publica (`POST /marketplace/establishments/:id/approve`) o lo rechaza con motivo (`/reject`). Se audita. Test: `marketplace.test.js`, "revisión de establecimientos". |
| La API rechaza publicar un concierto sin reserva confirmada del espacio, con la fecha correspondiente | Se publicaba con `venue_id` sin reserva, y no se revalidaba una reserva cancelada | **Corregido** en `c3e69b8`: `409 RESERVATION_REQUIRED` o `409 RESERVATION_NOT_CONFIRMED`, y `422 OUTSIDE_RESERVATION` si no cubre la fecha. El lugar en texto libre sigue permitido, por decisión del 2026-10-27. Test: `marketplace.test.js`, "concierto en un espacio del marketplace". |
| COMPRADOR y ARTISTA se activan solos; ORGANIZADOR, VENUE y EMPRESA_SERVICIOS requieren un ADMIN | Ya era así | **Verificado**: `SELF_SERVICE_ROLES` (`src/types/auth.types.js:5`) y `403 ADMIN_APPROVAL_REQUIRED` (`admin.service.ts:81`). Test: `profiles.test.js:146`, pasa. |

**Primera corrida del backend: 162 tests, 125 pasaban y 37 fallaban.** Causas y correcciones:

| Fallo | Causa | Corrección |
| --- | --- | --- |
| 33 tests de `commerce`, `insights` y otros: `ER_ROW_IS_REFERENCED_2 … order_payments … DELETE FROM orders` | La limpieza entre tests no conocía la tabla nueva `order_payments` | Se agregó `order_payments` antes de `orders` en `tests/helpers.js` y `commerce.test.js`. No se tocaron asserts. |
| `commerce.test.js:210`: `FORBIDDEN` en vez de `STAFF_NOT_ASSIGNED` | El `requirePermission` de la ruta contestaba antes que el servicio | **Bug corregido** en `commerce.routes.ts`: la autorización por concierto queda en el servicio. |
| `commerce.test.js:227`: `403` en vez de `409 CANCELLED` | Con el concierto cancelado desaparecía `tickets.validate` y el rechazo no se registraba | Misma corrección. |
| `management.test.js:336`: 5 consultas en vez de 4 | El listado agrega una consulta constante para los artistas del cartel; sigue sin N+1 | Test actualizado a 5, con tu autorización. |
| `marketplace.test.js:192` y `:330`: `HOLD` en vez de `CONFIRMED` | Desde `9d7fcfb`, la reserva directa pagada espera la aceptación del espacio | Tests actualizados para incluir la aceptación del venue, con tu autorización. |

Con las reglas nuevas también cambiaron fixtures que publicaban sin aprobación o sin reserva: `provision()` en `marketplace.test.js` y el concierto con `venue_id` de `management.test.js`.

**Corrida del 2026-10-27, después de las reglas nuevas:** backend **165/165**, frontend **13/13** y e2e **8/8**:

| Caso del e2e | Duración |
| --- | --- |
| Flujo completo a 1440 px | 37 s |
| Flujo completo a 768 px | 20 s |
| Flujo completo a 390 px | 19 s |
| Catálogos | 4 s |
| Etapa 7 | 4 s |
| Etapa 8 | 3 s |
| Marketplace (con aprobación del ADMIN) | 10 s |
| Servicios | 8 s |

**Lint y typecheck:** pasan los cuatro.

**Notificaciones de cotizaciones de servicios.** `GET /notifications` devuelve `service_quote_id`, tomado de `notifications.data`. `NotificationsScreen.tsx` muestra **Ver cotización** y lleva a `/services/quotes/:id`. Lo prueba `insights.test.js`, "service quote notices".

**Necesita tu decisión o confirmación:**

- la opción de TLS de la sección 8, actualizada en la sección 13.

La migración y el push quedaron resueltos el mismo día (sección 12).

**Segunda corrida del 2026-10-27, con los tests agregados.** Se ejecutó sobre el mismo MySQL 8 local, con la base creada desde `database/venti_shema2.sql` (nunca contra Railway):

| Suite | Resultado |
| --- | --- |
| Backend | **170/170** |
| Frontend | **13/13** |
| E2E | **8/8** |

Los 5 tests nuevos pasaron en la primera ejecución:

| Archivo | Test |
| --- | --- |
| `services.test.js` | Empresa y catálogo |
| `services.test.js` | Integrantes |
| `services.test.js` | Cotizaciones |
| `profiles.test.js` | Suspensión |
| `commerce.test.js` | Pago REJECTED |

Para soportarlos, `tests/helpers.js` borra `service_quote_items` y `service_quotes` antes que las demás tablas: `service_quotes` no tiene borrado en cascada hacia usuarios ni empresas.

## 12. Railway: migración, TLS y reservas canceladas (2026-10-27)

### Migración de revisión de establecimientos

1. **Control previo, de solo lectura.**
   - `establishments.status` era `enum('DRAFT','PUBLISHED','ARCHIVED')` y no existían las columnas nuevas.
   - La base tenía 57 tablas, 2 usuarios, 0 establecimientos y 0 conciertos.
2. **Respaldo** con `backend/scripts/db-backup.mjs`, que trabaja en una transacción de solo lectura.
   - **Archivo:** `C:/Users/Mateo/venti_backups/venti-20261027-pre-revision-establecimientos.sql`, fuera del repositorio.
   - **Tamaño y huella:** 94.714 bytes; SHA-256 `81d31aa8660aa7673dd9863f52adef700226e6ddbc559b5c9ab1895119a5301d`.
   - **Contenido:** 56 tablas con su estructura, 186 filas, 1 vista, 5 procedimientos, 9 triggers y 1 evento.
   - **Comprobación:** el archivo va de `CREATE DATABASE`/`USE venti` a `SET FOREIGN_KEY_CHECKS = 1` y conserva `establishments` con el `ENUM` anterior. Incluye hashes de contraseñas y tokens, así que no debe subirse a Git ni compartirse.
3. **Aplicación** con `backend/scripts/db-migrate.mjs --file ../database/migrations/20261027_revision_establecimientos.sql --backup <respaldo> --confirm venti`.
   - El script exige que el respaldo exista y no esté vacío, y que `--confirm` coincida con el nombre de la base.
   - Resultado: `Migración aplicada en venti: 4 sentencias.`
4. **Verificación con `SELECT`** sobre `information_schema`, en una sesión de solo lectura:
   - `establishments.status`: `enum('DRAFT','PENDING_REVIEW','PUBLISHED','ARCHIVED') NOT NULL`;
   - `reviewed_at`: `datetime NULL`;
   - `reviewed_by_user_id`: `bigint unsigned NULL`;
   - `review_note`: `varchar(500) NULL`;
   - restricción `fk_establishments_reviewed_by` hacia `users`, e índice `idx_establishments_reviewed_by`;
   - sin cambios en el resto: 57 tablas y 2 usuarios.

### Modo SSL que acepta Railway

Se midió con conexiones de solo lectura, sin cambiar la conexión de la app. Se usó la URL configurada en `backend/.env`, que pasa por el proxy público.

| Prueba | Resultado |
| --- | --- |
| Variables del servidor | `require_secure_transport = 0` (acepta conexiones sin cifrar); `tls_version = TLSv1.2,TLSv1.3`; `ssl_cert = server-cert.pem`, `ssl_ca = ca.pem` (los certificados que genera MySQL) |
| Conexión de la app, tal como está hoy | `Ssl_cipher` vacío: **sin TLS** |
| mysql2 con `ssl: { rejectUnauthorized: false }` | Conecta con **TLSv1.3**, `TLS_AES_256_GCM_SHA384` |
| mysql2 con `ssl: { rejectUnauthorized: true }` | Falla con `HANDSHAKE_SSL_ERROR`: el certificado no está firmado por una CA pública |

Equivalencias con los modos SSL de MySQL:

- `DISABLED` y `PREFERRED`/`REQUIRED` funcionan; `REQUIRED` equivale a `rejectUnauthorized: false`.
- `VERIFY_CA` y `VERIFY_IDENTITY` necesitarían el `ca.pem` del servidor, que Railway no publica.

Las opciones siguen siendo las de la sección 8 y no se cambió nada.

### Cancelación de una reserva con concierto publicado

Hoy, cancelar una reserva no consulta los conciertos. `MarketplaceService.cancelReservation` cambia el estado, reembolsa el pago simulado y notifica a la otra parte, y nada más. Un concierto solo se vincula a una reserva `CONFIRMED` o `COMPLETED`.

**Casos afectados:**

| # | Caso | Qué pasa hoy |
| --- | --- | --- |
| 1 | El organizador (quien reservó) cancela su reserva `CONFIRMED` antes del evento, con el concierto `PUBLISHED` | La reserva queda `CANCELLED` y se reembolsa. El concierto **sigue publicado**, con el lugar del espacio y las entradas a la venta, aunque la franja quedó libre y otro cliente puede reservarla. |
| 2 | Un ADMIN (`marketplace.admin`) cancela la reserva `CONFIRMED` como moderación | Igual que el caso 1. El organizador solo recibe el aviso de la reserva cancelada, no del concierto. |
| 3 | Reserva confirmada por un presupuesto aceptado | Igual que los casos 1 y 2: la cancelación sigue el mismo camino. |
| 4 | Después de la cancelación, el organizador edita el concierto publicado o sus tipos de entrada | Falla con `409 RESERVATION_NOT_CONFIRMED`, porque `publishable` revalida la reserva (`management.service.ts:179` y `:274`). Puede cancelar el concierto o cambiar el lugar a texto libre. |
| 5 | Compradores con entradas de ese concierto | No reciben ningún aviso, porque el concierto no cambió. |
| 6 | Un borrador vinculado a una reserva que se cancela | No se puede publicar (`409 RESERVATION_NOT_CONFIRMED`). Ya está cubierto por un test. |

Sin efecto:

- el espacio no puede cancelar una reserva `CONFIRMED` (`409 RESERVATION_CONFIRMED`);
- rechazar y vencer solo aplican a reservas en `HOLD`, que no se pueden vincular a un concierto;
- en Railway hoy hay 0 conciertos, así que no existe ningún caso real todavía.

**Opciones** (el 2026-10-27 se eligió la A; ver la sección 13):

| Opción | Qué hace | A favor | En contra |
| --- | --- | --- | --- |
| A. Bloquear la cancelación | `cancelReservation` responde `409` si hay un concierto no cancelado vinculado a la reserva. El organizador primero cancela el concierto o lo mueve a otro lugar. Se puede dejar a `marketplace.admin` como excepción. | Nunca queda un concierto publicado sin espacio. Es simple y explícito. | El organizador hace dos pasos. Si se permite la excepción del ADMIN, ese caso necesita otra de las opciones. |
| B. Avisar al organizador | Permite la cancelación y crea una notificación al organizador ("tu concierto X quedó sin reserva"). El concierto queda publicado y bloqueado para edición hasta que cambie el lugar. | Es el cambio más chico y no rompe el flujo actual. | El concierto sigue a la venta en un lugar que ya no tiene reservado, y los compradores no se enteran. |
| C. Despublicar el concierto | Al cancelar, el concierto vinculado pasa a `CANCELLED` por el flujo existente, que avisa a los compradores. | Es coherente para el público. | Es la consecuencia más fuerte: una cancelación de reserva, quizás por error, cancela un concierto con entradas vendidas. El reembolso de esas entradas no es automático. |

## 13. Rama `tls-y-cancelaciones` (2026-10-27, sin merge ni push)

### TLS con verificación: detenido

Se pidió exigir TLS y verificar el certificado con la CA que entrega Railway, sin bajar a una conexión sin verificación. Railway no entrega una CA verificable, así que **no se cambió la conexión** (`backend/src/config/db.config.js` sigue igual).

Evidencia de solo lectura (sesión `READ ONLY`, sin escrituras):

- **Cadena que presenta el servidor** (TLSv1.3):
  - `MySQL_Server_8.4.11_Auto_Generated_Server_Certificate`;
  - emitido por `MySQL_Server_8.4.11_Auto_Generated_CA_Certificate`, CA autofirmada.
  - Ambos son los certificados que genera MySQL solo al iniciar. Vigencia: 12/10/2026 a 9/10/2036. Huella SHA-256 de la CA: `9D:FC:80:95:…:AD:E5:D2`.
- **Contra las CA del sistema:** `SELF_SIGNED_CERT_IN_CHAIN`.
- **Sin nombres de host:** el certificado del servidor no tiene SAN y su CN es genérico. Aunque se fijara esa CA, no se puede verificar la identidad del host (`VERIFY_IDENTITY`); solo la cadena (`VERIFY_CA`).
- **Railway:** no publica esa CA en su documentación. En su foro, el equipo indica que el TCP proxy no ofrece certificados firmados por una CA y recomienda la red privada.

**Opciones, para que decidas:**

1. **Red privada:** cuando la API corre en Railway, usar solo `MYSQL_URL` (`*.railway.internal`), que viaja por túneles WireGuard cifrados por Railway. Es lo que recomienda Railway. Requiere que `db.config.js` no priorice `MYSQL_PUBLIC_URL`, o quitar esa variable del servicio.
2. **Fijar la CA autogenerada** (`DB_SSL_CA`), tomada del propio servidor.
   - Verifica la cadena (equivalente a `VERIFY_CA`), pero no el nombre del host.
   - Esa CA no la entrega Railway por un canal confiable: se obtiene por la misma conexión que se quiere proteger.
   - Si el volumen de MySQL se regenera, la CA cambia y la API deja de conectar.
3. **Cifrar sin verificar** (`rejectUnauthorized: false`). Quedó descartado por tu indicación.

### Opción A: la reserva confirmada con concierto vinculado no se cancela

- **Regla.** `MarketplaceService.cancelReservation` responde `409 RESERVATION_HAS_CONCERT` si la reserva está `CONFIRMED` y tiene algún concierto vinculado que no esté `CANCELLED`.
  - Vale para cualquier actor: el cliente que reservó y `marketplace.admin`.
  - El mensaje nombra los conciertos e indica qué hacer: primero cancelar el concierto o desvincularlo cambiando su lugar.
- **Concurrencia.** Los conciertos se leen con `FOR SHARE` dentro de la misma transacción que bloquea la reserva (`marketplace.repository.ts`, `linkedConcerts`).
- **Test** (`marketplace.test.js`, "cancelar una reserva confirmada con concierto vinculado…"). Comprueba que:
  - con el concierto en borrador o publicado, cancelar falla para el organizador y para el ADMIN, y la reserva sigue `CONFIRMED`;
  - después de cancelar el concierto, la reserva se cancela;
  - una reserva confirmada sin concierto la cancela el ADMIN.
- **Test ajustado.** El test de la sección 11 que cancelaba una reserva con un borrador vinculado dejó de ser posible con esta regla. Ese caso lo cubre ahora el test nuevo. La revalidación al publicar sigue en el código como defensa.

**Resultado:** contra MySQL 8 local aislado, backend **171/171** y frontend **13/13**. Check, lint y typecheck pasan en el backend y en el frontend.
