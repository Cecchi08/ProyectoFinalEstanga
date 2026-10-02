# VENTI — Etapa 4: compras, entradas y QR

Se reutilizan autenticación, roles vigentes, errores y transacciones MySQL. Código nuevo en TypeScript estricto con rutas → controller → service → repository. Sin cambios de schema, frontend, pagos externos ni otros módulos.

## API

Todas las rutas requieren `Authorization: Bearer <access_token>` y responden con `Cache-Control: no-store`. Éxito: `{success:true,data:...}`. Error: `{success:false,error:{code,message}}`.

| Método | Ruta | Acceso / resultado |
|---|---|---|
| POST | `/purchases` | Todos los roles autenticados; reserva propia, HTTP 201 |
| GET | `/purchases/me` | Historial propio, incluso ADMIN |
| GET | `/purchases/:id` | Propietario o ADMIN; incluye ítems y total histórico |
| POST | `/purchases/:id/confirm` | Propietario o ADMIN; confirmación interna, HTTP 200 |
| POST | `/purchases/:id/cancel` | Propietario o ADMIN; cancelación/reembolso simulado, HTTP 200 |
| GET | `/tickets` | Tickets propios, incluso ADMIN |
| GET | `/tickets/:id` | Propietario o ADMIN |
| POST | `/tickets/validate` | STAFF asignado al concierto o ADMIN |

Los listados aceptan `page` (por defecto 1) y `limit` (por defecto 20, máximo 100); devuelven `pagination:{page,limit,total,total_pages}`. Recursos ajenos responden 404. ADMIN accede a recursos ajenos por ID; los listados personales siguen siendo propios.

Crear reserva:

```json
{"concertId":"1","items":[{"ticketTypeId":"1","quantity":2}]}
```

`concertId` es opcional: se deriva del primer tipo si se omite. Todos los tipos deben pertenecer al mismo concierto. IDs aceptan strings o enteros seguros y se devuelven como strings. Se rechazan tipos duplicados, cantidades no enteras/positivas y propiedades desconocidas, incluidos precio, total, usuario y estado. Límite operativo de 100 tickets por compra, además del `max_per_purchase` de cada tipo. Precios y totales se devuelven como strings decimales exactos; `unit_price` se toma de MySQL y conserva el valor histórico.

Confirmar/cancelar usa body vacío o `{}`. Confirmar genera exactamente un ticket por unidad en la misma transacción. Una segunda confirmación responde `409 INVALID_STATE` y no genera tickets adicionales. No existe cargo monetario externo.

Validar QR:

```json
{"concertId":"1","qrToken":"<64 caracteres hexadecimales minúsculos>"}
```

Éxito: `200 {success:true,data:{result:"VALID",ticket_id:"...",concert_id:"1",status:"USED"}}`.

| Código | HTTP | Significado |
|---|---|---|
| `INVALID` | 404 | Token bien formado inexistente; no revela datos |
| `INVALID` | 409 | Entrada/compra/concierto en estado no validable |
| `ALREADY_USED` | 409 | Ticket utilizado o actualización condicional rechazada |
| `CANCELLED` | 409 | Ticket reembolsado/cancelado, compra cancelada/reembolsada o concierto cancelado |
| `WRONG_CONCERT` | 409 | QR de otro concierto |
| `STAFF_NOT_ASSIGNED` | 403 | Falta asignación al concierto solicitado |
| `FORBIDDEN` | 403 | No tiene rol STAFF/ADMIN |
| `VALIDATION_ERROR` | 422 | Body, ID o formato de QR inválido |

Los tickets propios incluyen estado, token, tipo, concierto/fecha/estado del concierto y venue/dirección. No incluyen email ni datos del comprador o validador. El token es `crypto.randomBytes(32).toString('hex')`, con unicidad reforzada por MySQL. El futuro QR representa exclusivamente ese token; esta etapa no genera imágenes. Solo propietario/ADMIN reciben el token en lecturas; el escaneo no lo devuelve. No registrar cuerpos de `/tickets/validate` ni respuestas que contengan tokens en proxies/APM.

## Estados y reglas

- Creación: `RESERVED`, con vencimiento a los 15 minutos como máximo, acotado también al fin de venta y al inicio del concierto. Se admiten reservas existentes `PENDING`.
- Stock comprometido: `CONFIRMED`, más `PENDING/RESERVED` con `expires_at > NOW()`. Las vencidas o sin vencimiento válido no cuentan. No depende de cron.
- Las lecturas muestran `EXPIRED` de forma lógica. Intentar confirmar/cancelar una reserva vencida persiste `EXPIRED` y responde `409 RESERVATION_EXPIRED`, sin tickets.
- Confirmación: reserva vigente, concierto publicado y venta habilitada → `CONFIRMED` + tickets `ACTIVE`. Revalida condiciones vigentes; conserva el precio reservado.
- Cancelar `PENDING/RESERVED` vigente → `CANCELLED`; sus tickets, si existen, se invalidan.
- Cancelar `CONFIRMED` → `REFUNDED` y todos sus tickets → `REFUNDED`. Es una devolución interna simulada. Se permite antes del concierto o si el concierto fue cancelado; nunca si algún ticket fue utilizado.
- `CANCELLED`, `EXPIRED` y `REFUNDED` son terminales. No se borra historial. La disponibilidad se libera al dejar de contar la compra como comprometida.
- Validación: compra `CONFIRMED`, concierto `PUBLISHED`, ticket `ACTIVE`, `used_at IS NULL`, concierto solicitado correcto y asignación vigente. No se restringe el escaneo a una hora de apertura no definida por el modelo.

## Concurrencia y rollback

Escrituras coordinadas en orden: concierto → tipos de entrada por ID numérico ascendente → compra → tickets. Se conserva el orden de bloqueo padre/hijo de Etapa 3. El bloqueo adicional del concierto serializa sus operaciones, incluyendo cancelación del concierto y cambios de tipos; es una decisión simple de consistencia para esta etapa.

La creación resuelve el padre fuera de la transacción; dentro bloquea con `SELECT ... FOR UPDATE` cada tipo antes de calcular stock. Las primeras lecturas consistentes de tablas ocurren después de esos bloqueos para evitar snapshots antiguos bajo `REPEATABLE READ`. La confirmación bloquea la compra y cambia su estado condicionalmente, con vencimiento comprobado en MySQL. Cualquier error al generar tickets revierte toda la confirmación.

El escaneo verifica asignación dentro de la transacción y ejecuta un `UPDATE` condicional sobre `ACTIVE` y `used_at IS NULL`, exigiendo `affectedRows = 1`. Fecha y usuario validador se guardan juntos. Cancelación y escaneo se coordinan mediante los mismos bloqueos de concierto/compra. Un fallo revierte todos los cambios; no quedan entradas activas de una compra reembolsada.

## Verificación

Desde `backend`: `npm run build` y `npm test`, con MySQL configurado según README. `tests/commerce.test.js` utiliza la base temporal aislada y el schema original. Incluye HTTP, permisos, precios históricos, expiración lógica, transiciones, tokens únicos, carreras reales entre reservas/confirmaciones/escaneos/cancelaciones y fallos inyectados para verificar rollback de datos reales.
