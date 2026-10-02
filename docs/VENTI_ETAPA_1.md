# VENTI — ETAPA 1

## Arquitectura de proyecto

```text
venti/
├── frontend/
│   ├── app/                              # Expo Router: SOLO rutas (archivos finos que importan de src/)
│   │   ├── _layout.tsx                   # Providers (AuthContext) + navegación raíz
│   │   ├── +not-found.tsx
│   │   ├── (auth)/                       # login, register, verify-email, forgot/reset-password, oauth-callback
│   │   └── (app)/                        # requiere sesión
│   │       ├── _layout.tsx               # guard de sesión + shell responsive (BottomTabs / Sidebar)
│   │       ├── (tabs)/                   # USER: discover, search, tickets, favorites, profile
│   │       ├── concerts/[id].tsx         # detalle + selección de entradas
│   │       ├── purchases/                # checkout, historial
│   │       ├── notifications.tsx
│   │       ├── organizer/                # /organizer/*  guard: ORGANIZER | ADMIN
│   │       ├── staff/                    # /staff/*      guard: STAFF | ADMIN (escáner QR, asistentes)
│   │       └── admin/                    # /admin/*      guard: ADMIN
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                       # primitivas compartidas (Button, Card, Input, Table, EmptyState…)
│   │   │   └── layout/                   # ResponsiveShell, BottomTabs (mobile), Sidebar (desktop)
│   │   ├── features/                     # código por dominio; cada carpeta solo con lo que necesite:
│   │   │   ├── auth/                     #   components/, hooks/, api.ts, types.ts
│   │   │   ├── concerts/
│   │   │   ├── tickets/
│   │   │   ├── purchases/
│   │   │   ├── favorites/
│   │   │   ├── discover/
│   │   │   ├── notifications/
│   │   │   ├── organizer/
│   │   │   ├── staff/
│   │   │   └── admin/
│   │   ├── contexts/                     # AuthContext (user, roles[], tokens)
│   │   ├── hooks/                        # solo hooks compartidos (useBreakpoint, useDebounce…)
│   │   ├── services/                     # transversal: http client (con refresh de token) y storage
│   │   ├── utils/
│   │   ├── types/                        # solo tipos compartidos (Role, ApiError, Pagination…)
│   │   └── constants/
│   ├── assets/
│   ├── .env.example
│   ├── tsconfig.json                     # alias @/ -> src/
│   └── app.json                          # incluye "scheme" para OAuth/deep links
│
├── backend/
│   ├── src/
│   │   ├── app.ts                        # instancia Express: middlewares globales + rutas
│   │   ├── server.ts                     # listen()
│   │   ├── config/                       # env.ts, db.ts (pool MySQL), oauth.ts
│   │   ├── routes/                       # <dominio>.routes.ts
│   │   ├── controllers/                  # <dominio>.controller.ts  (HTTP: req/res)
│   │   ├── services/                     # <dominio>.service.ts     (reglas de negocio y transacciones)
│   │   ├── repositories/                 # <dominio>.repository.ts  (SQL)
│   │   ├── middlewares/                  # authenticate, authorize, authorizeConcertOwner,
│   │   │                                 # authorizeStaffAssignment, validateRequest, errorHandler
│   │   ├── validators/                   # <dominio>.schemas.ts     (esquemas de validación)
│   │   ├── utils/                        # jwt, hash, qr, AppError
│   │   └── types/                        # express.d.ts (req.user), DTOs
│   ├── tests/
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
│
├── database/
│   ├── schema.sql                        # DDL + catálogos de referencia que el código necesita
│   └── seeds/                            # datos de demo: ubicaciones, géneros, artistas, venues, usuarios, conciertos
│
├── docs/
│   ├── DER.md
│   ├── API.md
│   └── permissions.md
│
├── .gitignore
└── README.md
```

### Reglas de la estructura

- **`app/` solo contiene rutas.** La lógica y los componentes viven en `src/`.
- **Las áreas por rol usan segmentos reales** (`organizer/`, `staff/`, `admin/`), no grupos `(organizer)`: en Expo Router los grupos no forman parte de la URL, y dos pantallas con el mismo nombre en grupos distintos resolverían a la misma ruta. Además, un usuario puede tener varios roles.
- **`features/<dominio>/`** concentra componentes, hooks, llamadas a la API y tipos de ese dominio. `components/ui`, `hooks/`, `types/` y `services/` son solo para lo compartido.
- **Multi-rol:** `AuthContext` expone `roles: string[]`. El menú muestra las secciones según los roles que tenga el usuario. Los guards de `_layout.tsx` son solo UX; la seguridad real está en el backend.
- **Storage de tokens:** `services/storage` abstrae el almacenamiento (SecureStore en nativo; alternativa en web, donde SecureStore no existe).
- **Backend por capas:** `routes → controllers → services → repositories`. Los controllers no tienen SQL; los repositories no tienen reglas de negocio.
- **Nombres:** `<dominio>.<capa>.ts` en el backend (`concerts.service.ts`); componentes React en PascalCase; carpetas en minúscula.

## Módulos ↔ tablas

| Módulo (rutas backend / feature frontend) | Tablas |
|---|---|
| auth | `users`, `user_roles`, `roles`, `oauth_providers`, `oauth_accounts`, `refresh_tokens`, `email_verification_tokens`, `password_reset_tokens` |
| profile / users | `users`, `user_preferences`, `organizer_profiles` |
| catalogs | `provinces`, `cities`, `venues`, `artists`, `genres`, `artist_genres`, `concert_types` |
| concerts | `concerts`, `concert_statuses`, `concert_artists`, `concert_genres` |
| ticket-types | `ticket_types` |
| purchases | `purchases`, `purchase_items`, `purchase_statuses` |
| tickets (QR y validación) | `tickets`, `ticket_statuses` |
| staff | `staff_assignments` |
| favorites | `favorites` |
| discover | sin tablas propias: lee `tickets`, `favorites`, `concert_genres`, `artist_genres`, `venues`, `cities` |
| notifications | `notifications`, `notification_types` |
| admin | opera sobre todos los anteriores |

## Relaciones principales

```text
USERS N:M ROLES                                  (USER_ROLES)
USERS 1:1 ORGANIZER_PROFILES
USERS 1:1 USER_PREFERENCES
USERS 1:N OAUTH_ACCOUNTS                         (OAUTH_PROVIDERS 1:N OAUTH_ACCOUNTS)
USERS 1:N REFRESH_TOKENS
USERS 1:N EMAIL_VERIFICATION_TOKENS
USERS 1:N PASSWORD_RESET_TOKENS
USERS 1:N PURCHASES
USERS 1:N NOTIFICATIONS                          (NOTIFICATION_TYPES 1:N NOTIFICATIONS)
USERS N:M CONCERTS                               (FAVORITES)
USERS N:M CONCERTS                               (STAFF_ASSIGNMENTS, con assigned_by_user_id)

PROVINCES 1:N CITIES
CITIES 1:N VENUES
VENUES 1:N CONCERTS

ORGANIZER_PROFILES 1:N CONCERTS
CONCERT_TYPES 1:N CONCERTS
CONCERT_STATUSES 1:N CONCERTS

CONCERTS N:M ARTISTS                             (CONCERT_ARTISTS)
ARTISTS N:M GENRES                               (ARTIST_GENRES)
CONCERTS N:M GENRES                              (CONCERT_GENRES)

CONCERTS 1:N TICKET_TYPES
PURCHASE_STATUSES 1:N PURCHASES
PURCHASES 1:N PURCHASE_ITEMS
TICKET_TYPES 1:N PURCHASE_ITEMS
PURCHASE_ITEMS 1:N TICKETS
TICKET_STATUSES 1:N TICKETS
USERS 1:N TICKETS                                (solo como validador: tickets.used_by_user_id)

NOTIFICATIONS N:1 CONCERTS / PURCHASES           (referencias opcionales)
```

## Reglas de permisos

| Acción | USER | ORGANIZER | STAFF | ADMIN |
|---|---|---|---|---|
| Ver conciertos publicados | Sí | Sí | Sí | Sí |
| Comprar/reservar entrada | Sí | Sí | Sí | Sí |
| Ver sus propios tickets, historial, favoritos, notificaciones y perfil | Sí | Sí | Sí | Sí |
| Crear concierto | No | Sí | No | Sí |
| Editar concierto | No | Solo propio | No | Sí |
| Publicar concierto | No | Solo propio | No | Sí |
| Cancelar concierto | No | Solo propio | No | Sí |
| Asociar artistas/géneros y elegir lugar en un concierto | No | Solo propio | No | Sí |
| Gestionar tipos de entrada | No | Solo propios | No | Sí |
| Ver ventas y estadísticas | No | Solo propios | No | Sí |
| Ver asistentes | No | Solo propios | Solo asignados | Sí |
| Asignar staff | No | Solo a propios | No | Sí |
| Validar QR | No | No | Solo asignados | Sí |
| Gestionar usuarios | No | No | No | Sí |
| Administrar catálogos globales (artistas, géneros, venues, ciudades, provincias) | No | No | No | Sí |

## Reglas críticas de backend

1. Nunca confiar en el rol enviado por el frontend. Los roles se obtienen de `user_roles` (en `authenticate()` o en un Access Token de vida corta), nunca del body, headers o storage del cliente.
2. `authenticate()` valida el Access Token y carga `req.user = { id, roles: string[] }`.
3. `authorize(...roles)` deja pasar si el usuario tiene **al menos uno** de los roles indicados (un usuario puede tener varios).
4. Organizer: además verificar `concerts.organizer_id === req.user.id` (`organizer_profiles.user_id` es el mismo `users.id`). Los recursos hijos (tipos de entrada, ventas, asistentes, staff) se verifican llegando al concierto por JOIN.
5. Staff: además verificar que exista `staff_assignments(concert_id, user_id)`.
6. Admin puede operar globalmente.
7. El QR se valida solo en backend, con un `UPDATE` condicional atómico: `SET status = USED, used_at = NOW(), used_by_user_id = ? WHERE qr_token = ? AND status = ACTIVE` y el ticket pertenece al concierto indicado. Si `affectedRows = 0` se rechaza (ya usado, cancelado o de otro concierto). El `qr_token` es aleatorio (`crypto.randomBytes(32)`), nunca un ID secuencial.
8. No existe una columna de stock disponible. Dentro de una transacción de compra: (a) bloquear las filas de `ticket_types` involucradas con `SELECT ... FOR UPDATE`, ordenadas por `id`; (b) calcular lo vendido como la suma de `quantity` de compras `CONFIRMED`, o `PENDING`/`RESERVED` con `expires_at > NOW()`; (c) validar concierto `PUBLISHED`, ventana de venta y `max_per_purchase`; (d) insertar compra e ítems con `unit_price` igual al precio vigente. Los tickets se generan, uno por unidad, al confirmar. El estado `EXPIRED` es solo limpieza: la corrección del stock no depende de un cron.
9. Refresh tokens se guardan hasheados (SHA-256), se rotan y pueden revocarse.
10. Los proveedores OAuth se vinculan mediante `oauth_accounts`. Vincular automáticamente por email solo si el proveedor garantiza el email verificado.
11. La conexión a MySQL trabaja en UTC (`timezone: 'Z'` en mysql2) para que `CURRENT_TIMESTAMP` y los datetimes generados por Node coincidan.
12. Los conciertos con ventas no se borran: se cancelan (`CANCELLED`). La base lo refuerza con FK `RESTRICT`.

## Decisiones de 3FN

- `tickets.user_id` NO se almacena: se obtiene por `ticket -> purchase_item -> purchase -> user`.
- `tickets.concert_id` NO se almacena: se obtiene por `ticket -> purchase_item -> ticket_type -> concert`.
- `purchases.total` NO se almacena: se calcula con `SUM(quantity * unit_price)`.
- El stock disponible NO se almacena: se calcula (regla 8).
- `venues` guarda solo `city_id`; la provincia se obtiene por `city -> province`. Los conciertos no guardan ciudad: se obtiene por `venue -> city`.
- Los nombres de roles, géneros, estados, tipos de concierto, proveedores OAuth y tipos de notificación se normalizan mediante tablas relacionadas.
- `purchase_items.unit_price` sí se almacena porque representa el precio histórico al momento de la compra.
- Los estados se separan por dominio (`concert_statuses`, `purchase_statuses`, `ticket_statuses`) para evitar una tabla genérica ambigua.
- `concert_genres` es un dato propio del concierto (los géneros con los que se publica, p. ej. un festival), no una copia de `artist_genres`. Se usa para filtrar; `artist_genres` se usa para afinidad de artistas en Discover.
- `tickets.status_id` y `used_at/used_by_user_id` son hechos distintos (estado vs. evento de validación). Un CHECK obliga a que `used_at` y `used_by_user_id` se completen juntos.
- Las recomendaciones (Venti Discover) NO se persisten: se calculan al vuelo a partir del historial (`tickets`), `favorites`, `concert_genres` y `artist_genres`. Si más adelante el rendimiento lo exige, se agrega una tabla de caché mediante migración, sin rediseñar nada.
