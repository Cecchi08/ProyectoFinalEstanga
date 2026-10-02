# VENTI — Etapa 3

Arquitectura: `routes → controllers → services → repositories → MySQL`. Los módulos nuevos se encuentran en `backend/src/{routes,controllers,services,repositories,validators}/management.*.ts`. Se reutilizan autenticación, autorización, validación Zod, `AppError` y transacciones de Etapa 2. `schema.sql` no cambia.

## Ejecución y requisitos

Desde `backend`: `npm ci`, `npm run build`, `npm test` y `npm start`. Desarrollo: `npm run dev`. TypeScript usa `strict: true`; el JavaScript existente se copia a `dist` sin migrarlo. Las pruebas HTTP usan MySQL real y bases desechables, con las variables `TEST_DB_*` del README. No usan la base de la aplicación.

Un organizador debe estar activo, tener el rol ORGANIZER (o ADMIN) y un registro previo en `organizer_profiles`. Esta etapa no incorpora administración de usuarios o elevación de roles. ADMIN puede crear para un organizador existente indicando `organizer_id`; ORGANIZER debe omitirlo y siempre usa su identidad autenticada. Si falta el perfil, responde `422 INVALID_ORGANIZER`.

## Contrato común

- Prefijos sin `/api`; Bearer JWT en escrituras y consultas privadas.
- Respuesta: `{success:true,data:...}`. Crear: 201; leer/editar/publicar/cancelar: 200; eliminar: 204 sin cuerpo.
- Listados: `{success:true,data:[...],pagination:{page,limit,total,total_pages}}`. Por defecto `page=1`, `limit=20`, máximo 100 por página. Orden estable por nombre e ID en catálogos; fecha e ID en conciertos.
- IDs de respuesta como strings; entrada acepta strings decimales positivos o enteros seguros. Precios de entrada numéricos con hasta dos decimales; DECIMAL se devuelve como string para conservar precisión.
- Fechas ISO 8601 con `Z` o desplazamiento horario; persistencia UTC. Para filtrar días completos, indicar los instantes de inicio y fin.
- Bodies estrictos: no se aceptan propiedades desconocidas, PATCH vacío, IDs repetidos ni fechas incoherentes. Hasta 100 IDs por asociación y 100 entradas en la creación inicial; límite HTTP existente de 16 KB.
- Errores: 400 JSON inválido; 401 autenticación; 403 permisos; 404 recurso inexistente/no visible; 409 duplicados, recurso en uso o estado incompatible; 422 datos/referencias/requisitos inválidos; 500 error interno sin SQL ni secretos.
- Respuestas de gestión con `Cache-Control: no-store`. CORS admite PATCH y DELETE.

## Conciertos

| Método y ruta | Acceso / comportamiento |
|---|---|
| GET `/concerts` | Público: solo PUBLISHED. ORGANIZER: publicados y propios. ADMIN: todos. |
| GET `/concerts/:id` | Misma visibilidad; un concierto privado ajeno responde 404. |
| POST `/concerts` | ORGANIZER propio; ADMIN puede elegir organizador. Siempre DRAFT. |
| PATCH `/concerts/:id` | ORGANIZER propietario o ADMIN. |
| DELETE `/concerts/:id` | Solo DRAFT sin historial. |
| POST `/concerts/:id/publish` | Propietario o ADMIN; body vacío/`{}`. |
| POST `/concerts/:id/cancel` | Propietario o ADMIN; body vacío/`{}`. |
| GET `/concert-types` | Catálogo público sembrado por schema.sql. |

Filtros combinables: `q`, `name` (subcadena del nombre), `artist_id`, `genre_id`, `venue_id`, `city_id`, `concert_type_id`, `type=CONCERT|FESTIVAL|LIVE_SHOW`, `date_from`, `date_to` (inclusive), `status=DRAFT|PUBLISHED|CANCELLED|FINISHED`, `mine=true|false`, `page`, `limit`. `mine=true` y estados distintos de PUBLISHED requieren ORGANIZER/ADMIN y nunca amplían su visibilidad. Bearer inválido en lectura devuelve 401.

Las asociaciones se cargan agrupadas: cinco consultas de datos por página no vacía, independientemente del número de conciertos. Los filtros N:M usan EXISTS y no multiplican filas.

Ejemplo de creación con IDs existentes y fechas futuras:

```json
{
  "name": "VENTI Live",
  "venue_id": "1",
  "concert_type_id": "1",
  "description": "Show en vivo",
  "image_url": "https://example.com/concert.jpg",
  "start_datetime": "2027-06-10T23:00:00Z",
  "end_datetime": "2027-06-11T02:00:00Z",
  "artist_ids": ["1", "2"],
  "genre_ids": ["1"],
  "ticket_types": [{
    "name": "General",
    "price": 15000,
    "stock_total": 100,
    "sale_start": "2027-01-01T00:00:00Z",
    "sale_end": "2027-06-10T22:00:00Z",
    "max_per_purchase": 4
  }]
}
```

Obligatorios: `name`, `venue_id`, `concert_type_id`, `start_datetime`. Se permiten borradores sin artistas, géneros ni entradas. Descripción, imagen y fin admiten null. Arrays de asociaciones reemplazan la relación completa en PATCH; omitirlos la conserva, `[]` la vacía. El orden de `artist_ids` determina `billing_order`. PATCH no acepta `ticket_types`, `organizer_id`, estados ni `published_at`; las entradas tienen rutas propias.

La ubicación del concierto se deriva del venue. Las respuestas incluyen asociaciones y nombres/IDs de venue, ciudad y provincia.

## Estados, transacciones e historial

- Publicar requiere DRAFT, venue válido, inicio futuro, fin posterior si existe, al menos un artista, un género y una entrada válida. Precio y stock cero son válidos según el esquema. Establece `published_at`; publicar otra vez da 409.
- DRAFT/PUBLISHED se editan antes del inicio. Cambiar la fecha revalida todas las ventanas de venta. Un publicado debe conservar los requisitos al editar relaciones o eliminar entradas; ante fallo se revierte todo.
- DRAFT/PUBLISHED pueden pasar a CANCELLED. Cancelar de nuevo es idempotente y conserva todas las relaciones. CANCELLED/FINISHED no admiten edición, publicación ni borrado. No hay finalización automática en esta etapa.
- DELETE solo elimina DRAFT sin compras, favoritos, asignaciones de staff ni notificaciones. Se respetan FK RESTRICT y CASCADE existentes.
- Escrituras y N:M son transaccionales. Se bloquea primero el concierto con `FOR UPDATE` y se verifica de nuevo la propiedad. Los hijos resuelven el concierto desde MySQL. La consulta preliminar de una entrada ocurre fuera de la transacción para no abrir una instantánea anterior al bloqueo del padre.
- `purchase_items` impide borrar entradas con compras. Se rechaza conservadoramente reducir stock si hay cualquier historial; aumentarlo está permitido. No se crean ni modifican compras, no se descuenta stock ni se calcula disponibilidad.

## Catálogos y ubicaciones

Para `/artists`, `/genres`, `/provinces`, `/cities`, `/venues`: GET colección y GET `/:id` públicos; POST colección, PATCH `/:id` y DELETE `/:id` exclusivos de ADMIN.

| Recurso | Body obligatorio | Opcionales |
|---|---|---|
| artists | `name` | `description`, `image_url`, `genre_ids` |
| genres | `name` | — |
| provinces | `name` | — |
| cities | `province_id`, `name` | — |
| venues | `city_id`, `name`, `address` | `capacity` positivo o null |

PATCH acepta subconjuntos no vacíos. Listados: `q`, `page`, `limit`; ciudades además `province_id`, venues además `city_id`. Artistas incluyen `genres`, cargados en una consulta agrupada. `artist_genres` se reemplaza transaccionalmente.

Unicidad según esquema/collation: nombres de artistas/géneros/provincias; ciudad dentro de provincia; combinación ciudad/nombre/dirección de venue. Borrar recursos referenciados responde 409. También se impide borrar un género asociado a artistas para evitar perder asociaciones por CASCADE.

## Tipos de entrada

| Método y ruta | Acceso |
|---|---|
| GET `/concerts/:concertId/ticket-types` | Según visibilidad del concierto. |
| POST `/concerts/:concertId/ticket-types` | ORGANIZER propietario o ADMIN. |
| PATCH `/ticket-types/:id` | ORGANIZER propietario o ADMIN. |
| DELETE `/ticket-types/:id` | ORGANIZER propietario o ADMIN. |

Crear requiere `name`, `price >= 0`, `stock_total >= 0` entero. Opcionales: `sale_start`, `sale_end`, `max_per_purchase > 0` entero, todos admiten null. La venta termina después de su inicio; los límites no pueden superar el inicio del concierto y `sale_start` debe precederlo. PATCH valida el resultado combinado con los valores existentes. Nombre único por concierto; no se acepta cambiar `concert_id`.

## Pruebas

`management.test.js` verifica HTTP + MySQL real: creación, matriz de roles/propiedad, privacidad, filtros y paginación, BIGINT/DECIMAL, CRUD de catálogos, FK y rollback, publicación incompleta/válida, estados, ventanas, historial y concurrencia. Comprueba también que las consultas de listado no crezcan con el tamaño de página. Las suites de autenticación, OAuth y seguridad siguen ejecutándose.
