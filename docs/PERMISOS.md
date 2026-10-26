# Perfiles, permisos y endpoints

La API autoriza **por permiso**. Cada usuario tiene uno o más perfiles (filas en `user_roles`). Cada perfil otorga permisos (`role_permissions`). En cada pedido el backend relee de la base, en una sola consulta, los roles y la unión de sus permisos. Quitar un perfil o un permiso surte efecto en el pedido siguiente.

Además del permiso, varios endpoints validan **propiedad o membresía**:

- dueño del concierto;
- asignación en `concert_staff`;
- miembro de la organización (`organization_members`: OWNER/ADMIN/STAFF);
- miembro del perfil de artista (`artist_members`: OWNER/MEMBER).

El catálogo de permisos del código está en `backend/src/utils/access.util.js`. Los datos iniciales están en `database/venti_shema2.sql`, en un bloque repetible de `INSERT IGNORE`.

## Perfiles

| Perfil | Para qué | Cómo se activa |
|---|---|---|
| COMPRADOR | Comprar entradas, recomendaciones, notificaciones. Es el perfil por defecto al registrarse. | Automático al registrarse; también por autoservicio |
| ARTISTA | Perfil de artista o banda; busca espacios, pide presupuestos y reserva salas. | Autoservicio o un admin |
| ORGANIZADOR | Publica conciertos, vende entradas, asigna staff, ve sus estadísticas y reserva espacios. | Un admin lo asigna |
| VENUE | Gestiona establecimientos y espacios de su organización, responde presupuestos y reservas. | Un admin lo asigna |
| EMPRESA_SERVICIOS | Empresa de servicios para eventos (sonido, iluminación, seguridad…): catálogo, integrantes y respuesta de cotizaciones. No pide cotizaciones. | Un admin lo asigna |
| ADMIN | Todo. Es el único con `users.manage`, `catalogs.manage` y los permisos globales. | Un admin lo asigna |
| GUEST | Invitado sin registro completo. **No se asigna ni se quita a mano.** | Flujo de invitado |

**Autoservicio:** COMPRADOR y ARTISTA los activa la propia persona con `POST /me/profiles`. ORGANIZADOR, VENUE y EMPRESA_SERVICIOS implican una organización o un negocio que hay que revisar, así que los asigna un ADMIN con `POST /admin/users/:id/roles` y, si los pide la persona, la respuesta es `403 ADMIN_APPROVAL_REQUIRED`. Las dos formas quedan registradas en `admin_audit_log`: `ROLE_SELF_ACTIVATED`, `ROLE_GRANTED` y `ROLE_REVOKED`.

## Permisos

Los marcados con **(nuevo)** se crearon en esta etapa.

| Permiso | Perfiles | Qué habilita |
|---|---|---|
| `concerts.browse` | todos | Ver conciertos publicados. Esas rutas son públicas, así que hoy no se chequea. |
| `tickets.purchase` | todos | `POST /purchases` |
| `marketplace.venues.browse` | todos | Buscar espacios. Las rutas son públicas, así que hoy no se chequea. |
| `concerts.manage` | ORGANIZADOR, ADMIN | Crear y editar conciertos propios y sus entradas, y ver sus borradores |
| `concerts.manage_all` (nuevo) | ADMIN | Gestionar y ver cualquier concierto, y elegir el organizador |
| `concerts.staff.manage` (nuevo) | ORGANIZADOR, ADMIN | Asignar y quitar staff de conciertos propios |
| `tickets.validate` | ADMIN | Validar entradas por QR de **cualquier** concierto. El staff común valida por asignación. |
| `orders.read_all` | ADMIN | Ver y operar compras y entradas de otros |
| `statistics.own` (nuevo) | ORGANIZADOR, ADMIN | Estadísticas de conciertos propios |
| `statistics.global` (nuevo) | ADMIN | Estadísticas de toda la plataforma |
| `catalogs.manage` (nuevo) | ADMIN | Crear, editar y borrar géneros, provincias, distritos y ciudades |
| `users.manage` | ADMIN | Listar usuarios, asignar y quitar perfiles, ver la auditoría |
| `marketplace.quotes.request` | ARTISTA, ORGANIZADOR, ADMIN | Pedir, aceptar y cancelar presupuestos |
| `marketplace.reservations.create` | ARTISTA, ORGANIZADOR, ADMIN | Reservar espacios y hacer el pago simulado |
| `marketplace.establishments.manage` | VENUE, ADMIN | Organizaciones, miembros, establecimientos, espacios y bloqueos, siempre con membresía |
| `marketplace.quotes.respond` | VENUE, ADMIN | Responder y rechazar presupuestos de su organización |
| `marketplace.reservations.manage` | VENUE, ADMIN | Ver y cancelar reservas de sus espacios |
| `marketplace.admin` | ADMIN | Cualquier organización, espacio, presupuesto o reserva |
| `artist.profile.manage` | ARTISTA, ADMIN | Crear y gestionar perfiles de artista propios |
| `artists.admin` (nuevo) | ADMIN | Gestionar cualquier perfil de artista |
| `services.manage` (nuevo) | EMPRESA_SERVICIOS, ADMIN | Empresa propia, su catálogo y sus integrantes, siempre con membresía |
| `services.quotes.respond` (nuevo) | EMPRESA_SERVICIOS, ADMIN | Responder y rechazar cotizaciones de servicios de su empresa |
| `services.quotes.request` (nuevo) | ORGANIZADOR, VENUE, ADMIN | Pedir, aceptar y cancelar cotizaciones de servicios |
| `services.admin` (nuevo) | ADMIN | Cualquier empresa de servicios; verificar y quitar la verificación |

## Endpoints

Valores de la columna **Acceso**:

- **público**: sin token;
- **autenticado**: cualquier sesión válida;
- **un código de permiso**: ese permiso, o cualquiera de los que se listan.

La columna **Además** indica la regla de propiedad o membresía que se valida en el servicio.

### Autenticación (`/auth`, sin cambios)
| Endpoint | Acceso |
|---|---|
| `POST /auth/register`, `/login`, `/refresh`, `/logout`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`, `/oauth/exchange` · `GET /auth/oauth/:provider`, `/oauth/:provider/callback` | público |
| `GET /auth/me` (devuelve `roles` y `permissions`, la unión de los permisos de sus perfiles) · `POST /auth/oauth/:provider/link` | autenticado |

### Conciertos y entradas
| Endpoint | Acceso | Además |
|---|---|---|
| `GET /concerts`, `/concerts/:id`, `/concerts/:concertId/ticket-types` | público, con token opcional | Los borradores solo los ven su dueño (`concerts.manage`) o `concerts.manage_all` |
| `POST /concerts` | `concerts.manage` o `concerts.manage_all` | El organizador sale de la sesión; solo `manage_all` puede elegir otro |
| `PATCH/DELETE /concerts/:id`, `POST /concerts/:id/publish`, `/cancel`, `POST /concerts/:concertId/ticket-types`, `PATCH/DELETE /ticket-types/:id` | `concerts.manage` o `concerts.manage_all` | Dueño del concierto |
| `GET/POST /concerts/:id/staff`, `DELETE /concerts/:id/staff/:userId` | `concerts.staff.manage` o `concerts.manage_all` | Dueño del concierto |
| `GET /concerts/:id/attendees` | autenticado | Dueño, staff asignado o `concerts.manage_all` |
| `GET /staff/assignments` | autenticado | Conciertos asignados; todos con `tickets.validate` |
| `POST /purchases` | `tickets.purchase` | — |
| `GET /purchases/me`, `/purchases/:id`, `POST /purchases/:id/confirm`, `/cancel`, `GET /tickets`, `/tickets/:id` | autenticado | Propias, o todas con `orders.read_all` |
| `POST /tickets/validate` | autenticado | Staff asignado al concierto, o `tickets.validate` |

### Catálogos
| Endpoint | Acceso |
|---|---|
| `GET /genres`, `/provinces`, `/districts`, `/cities` (y `/:id`) | público |
| `POST`, `PATCH /:id` y `DELETE /:id` de esos catálogos | `catalogs.manage` |
| `GET /concert-types`, `POST /venues`, `PATCH/DELETE /venues/:id` | responden 410 (no existen en el esquema) |

### Recomendaciones, preferencias, notificaciones y estadísticas
| Endpoint | Acceso | Además |
|---|---|---|
| `GET /recommendations`, `GET/PATCH /preferences`, `GET /notifications`, `PATCH /notifications/read-all`, `/notifications/:id/read` | autenticado | Siempre del propio usuario |
| `GET /organizer/statistics`, `/organizer/concerts/:id/statistics` | `statistics.own` | Conciertos propios |
| `GET /admin/statistics` | `statistics.global` | — |

### Marketplace
| Endpoint | Acceso | Además |
|---|---|---|
| `GET /marketplace/cities`, `/marketplace/catalogs`, `/marketplace/venues` (alias `/venues`), `/marketplace/venues/:id` (alias `/venues/:id`), `/marketplace/venues/:id/availability` | público, con token opcional | Los espacios no publicados solo los ven los miembros de la organización |
| `POST /marketplace/organizations`, `GET /marketplace/organizations/mine`, `GET /marketplace/establishments/mine` | `marketplace.establishments.manage` o `marketplace.admin` | Quien crea la organización queda como OWNER |
| `GET/POST /marketplace/organizations/:id/members`, `PATCH/DELETE …/members/:userId` | `marketplace.establishments.manage` o `marketplace.admin` | Para ver alcanza con ser miembro; gestionan OWNER/ADMIN; solo un OWNER toca a otro OWNER; siempre queda uno; solo se suman cuentas con VENUE |
| `POST /marketplace/establishments`, `PATCH /…/:id`, `POST /…/:id/publish`, `/archive`, `GET/POST /…/:id/venues`, `PATCH /marketplace/venues/:id`, `POST /…/venues/:id/publish`, `/archive`, `GET/POST /…/:id/blocks`, `DELETE /marketplace/blocks/:id` | `marketplace.establishments.manage` o `marketplace.admin` | Miembro; editar exige OWNER/ADMIN de la organización |
| `POST /marketplace/quotes`, `POST /marketplace/quotes/:id/accept`, `/cancel` | `marketplace.quotes.request` o `marketplace.admin` | Aceptar y cancelar: solo quien lo pidió |
| `GET /marketplace/quotes`, `/marketplace/quotes/:id` | `quotes.request`, `quotes.respond` o `marketplace.admin` | El propio, o el de su organización; la vista `as=provider` exige `quotes.respond` |
| `POST /marketplace/quotes/:id/respond`, `/reject` | `marketplace.quotes.respond` o `marketplace.admin` | Miembro de la organización del espacio |
| `POST /marketplace/reservations`, `POST /marketplace/reservations/:id/payments` | `marketplace.reservations.create` o `marketplace.admin` | Paga solo quien reservó; el pago es siempre simulado |
| `GET /marketplace/reservations`, `/marketplace/reservations/:id`, `POST …/:id/cancel` | `reservations.create`, `reservations.manage` o `marketplace.admin` | La propia, o la de su organización; la vista `as=provider` exige `reservations.manage`. Una reserva CONFIRMED solo la cancela quien reservó (el espacio recibe `409 RESERVATION_CONFIRMED`); `marketplace.admin` conserva la baja |
| `POST /marketplace/reservations/:id/accept`, `/reject` (`reason`) | `marketplace.reservations.manage` o `marketplace.admin` | Miembro de la organización del espacio; solo reservas directas en HOLD; aceptar exige el pago simulado aprobado |

### Empresas de servicios
La empresa es una organización (`organizations` + `organization_members`) con perfil en `service_providers`. Venti no cobra los servicios: aceptar una cotización la deja contratada y el pago se arregla entre las partes.

| Endpoint | Acceso | Además |
|---|---|---|
| `GET /services/categories`, `/services/providers`, `/services/offerings` | público | Solo empresas publicadas de organizaciones activas y servicios publicados |
| `GET /services/providers/:id`, `/services/offerings/:id` | público, con token opcional | Los miembros y `services.admin` ven también borradores y archivados; la empresa trae el `member_role` de quien consulta |
| `GET /services/offerings/:id/availability` (`date`, o `from` y `to`; máximo 31 días) | público, con token opcional | Franjas contratadas (cotizaciones ACCEPTED). Es informativa: no bloquea pedidos. Los miembros ven además qué cotización ocupa cada franja |
| `GET /services/providers/mine`, `POST /services/providers` | `services.manage` o `services.admin` | Quien crea la empresa queda como OWNER; nace en DRAFT |
| `PATCH /services/providers/:id`, `POST …/:id/publish`, `/archive`, `POST …/:id/offerings`, `PATCH /services/offerings/:id`, `POST …/offerings/:id/publish`, `/archive` | `services.manage` o `services.admin` | OWNER/ADMIN de la empresa |
| `GET/POST /services/providers/:id/members`, `PATCH/DELETE …/members/:userId` | `services.manage` o `services.admin` | Las mismas reglas que en espacios: ver, cualquier miembro; gestionan OWNER/ADMIN; solo un OWNER toca a otro OWNER; siempre queda uno; solo se suman cuentas con EMPRESA_SERVICIOS |
| `POST /services/providers/:id/verify`, `/unverify` | `services.admin` | Queda en `admin_audit_log` |
| `POST /services/quotes`, `POST /services/quotes/:id/accept`, `/cancel` | `services.quotes.request` o `services.admin` | Aceptar y cancelar: solo quien la pidió; no se pide a la empresa propia; el concierto o la reserva vinculados tienen que ser propios |
| `GET /services/quotes`, `/services/quotes/:id` | `services.quotes.request`, `services.quotes.respond` o `services.admin` | La vista `as=requester` exige `quotes.request` y `as=provider` exige `quotes.respond` |
| `POST /services/quotes/:id/respond`, `/reject` | `services.quotes.respond` o `services.admin` | Miembro de la empresa |

### Perfiles de artista
| Endpoint | Acceso | Además |
|---|---|---|
| `GET /artists`, `/artists/:id` | público, con token opcional | Solo publicados; sus miembros y `artists.admin` ven también borradores y emails |
| `GET /artists/mine`, `POST /artists` | `artist.profile.manage` o `artists.admin` | Quien crea el perfil queda como OWNER |
| `PATCH /artists/:id` | `artist.profile.manage` o `artists.admin` | Cualquier miembro; un perfil archivado no se edita |
| `POST /artists/:id/publish`, `/archive` | `artist.profile.manage` o `artists.admin` | OWNER |
| `GET /artists/:id/members` | `artist.profile.manage` o `artists.admin` | Miembro |
| `POST /artists/:id/members`, `PATCH …/members/:userId` | `artist.profile.manage` o `artists.admin` | OWNER; solo se suman cuentas con ARTISTA; siempre queda un OWNER |
| `DELETE /artists/:id/members/:userId` | `artist.profile.manage` o `artists.admin` | Salirse, cualquier miembro; quitar a otro, el OWNER; siempre queda un OWNER |

### Perfiles propios
| Endpoint | Acceso | Además |
|---|---|---|
| `GET /me/profiles` | autenticado | Perfiles, permisos y cuáles son de autoservicio |
| `POST /me/profiles` (`role`) | autenticado | Solo COMPRADOR o ARTISTA; idempotente; cuentas registradas y activas; queda auditado como `ROLE_SELF_ACTIVATED` |

### Administración de usuarios
| Endpoint | Acceso | Además |
|---|---|---|
| `GET /admin/users` (`q`, `role`), `GET /admin/users/:id` | `users.manage` | — |
| `POST /admin/users/:id/roles` (`role`, `reason`) | `users.manage` | Idempotente; no asigna GUEST; solo a cuentas activas registradas; se registra en `admin_audit_log` en la misma transacción |
| `DELETE /admin/users/:id/roles/:role` (`reason`) | `users.manage` | No deja a nadie sin perfil (`LAST_ROLE`) ni a la plataforma sin ADMIN activo (`LAST_ADMIN`); se audita |
| `GET /admin/audit` (`target_user_id`, `actor_user_id`) | `users.manage` | — |
