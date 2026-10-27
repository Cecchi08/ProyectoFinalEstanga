# Etapa 7 — Notificaciones y estadísticas

> **Documento histórico.** Describe esta etapa tal como se entregó, con los roles y el esquema de ese momento (`USER`, `ORGANIZER`, `STAFF`, `database/schema.sql`). Ya no aplican: hoy la API autoriza por permisos con los perfiles ADMIN, COMPRADOR, ARTISTA, ORGANIZADOR, VENUE, EMPRESA_SERVICIOS y GUEST, el control de ingreso se asigna por concierto y el esquema vigente es `database/venti_shema2.sql`. Ver [Seguridad y autorización](permissions.md) y [Perfiles, permisos y endpoints](PERMISOS.md).

Implementación sobre el esquema existente, Express/MySQL y Expo/React Native. No modifica `database/schema.sql`, no agrega índices, tablas, dependencias de gráficos, servicios externos, WebSockets ni cron. Reutiliza `react-native-svg`. `@types/react` se alinea con la versión compatible indicada por Expo 55.

## API

Todos los endpoints requieren `authenticate()`, usan `Cache-Control: no-store`, consultas parametrizadas y el envelope habitual `{success:true,data}`. IDs BIGINT son strings. No aceptan `user_id` ni `organizer_id` del cliente.

| Método y ruta | Contrato |
| --- | --- |
| GET `/notifications?page=1&limit=20` | `data:{items,unread_count}` y `pagination:{page,limit,total,total_pages}`. Cuenta de no leídas sobre toda la bandeja propia, independientemente de página. Máximo 100 por página; orden fecha/ID descendente. |
| PATCH `/notifications/:id/read` | Body vacío; conserva la primera fecha de lectura. Ajena/inexistente: 404. |
| PATCH `/notifications/read-all` | Body vacío; marca todas las propias. Ambas acciones devuelven `data:{updated}`. |
| GET `/preferences` | `{recommendations_enabled:boolean,notifications_enabled:boolean}`; defaults true si falta fila. |
| PATCH `/preferences` | Uno o ambos booleanos; conserva el campo omitido y devuelve ambas preferencias. Rechaza strings, body vacío y campos desconocidos. |
| GET `/organizer/statistics` | Solo ORGANIZER, todas sus estadísticas propias. |
| GET `/organizer/concerts/:id/statistics` | Solo ORGANIZER propietario; ajeno/inexistente: 404. |
| GET `/admin/statistics` | Solo ADMIN; métricas globales. |

Estadísticas aceptan `from=AAAA-MM-DD`, `to=AAAA-MM-DD` y `concert_id`. Fechas inclusive en UTC sobre `purchases.created_at`. El ID en el path prevalece sobre el filtro. Un ORGANIZER nunca amplía su ámbito; ADMIN sin rol ORGANIZER utiliza el endpoint global.

Notificación: `{id,type,title,message,concert_id,purchase_id,read_at,created_at,concert_status}`. Se soportan los seis tipos del catálogo, incluidos `CONCERT_REMINDER` e `IMPORTANT_INFO`. Sin endpoint para leer otra cuenta ni crear notificaciones arbitrarias.

## Generación y preferencias

- Confirmación: `PURCHASE_CONFIRMED`, una por compra, dentro de la misma transacción que confirma y emite tickets. Un fallo de inserción revierte la confirmación completa.
- Cancelación: `CONCERT_CANCELLED` en la transición real a cancelado; repetir la petición no vuelve a emitir.
- Edición publicada: `SCHEDULE_CHANGE` si cambia inicio/fin; `IMPORTANT_INFO` si cambia nombre, descripción, lugar, artistas o géneros. PATCH sin cambios efectivos no genera avisos. Cambios posteriores distintos son eventos nuevos.
- Afectados por cambios/cancelación: compradores confirmados, reservas vigentes y usuarios con favorito. Una inserción agregada por evento elimina destinatarios repetidos. Compradores reciben un enlace a una de sus compras; favoritos acceden al concierto mientras siga publicado.
- Discover: al consultar recomendaciones se puede guardar la primera sugerencia. Solo una `RECOMMENDATION` por usuario/concierto, incluso con consultas concurrentes o después de leerla. Se revalidan las preferencias, publicación y fecha al insertar. Los bloqueos siguen concierto → usuario para coordinarse con compras y gestión.
- `notifications_enabled=false` suprime recomendaciones y avisos por favoritos. Confirmaciones y cambios/cancelaciones para compradores con compra vigente son avisos esenciales y se conservan. El interruptor del frontend explica esta distinción. No se borran avisos previos al apagarlo. `recommendations_enabled=false` también impide recomendaciones nuevas.
- No se programan recordatorios automáticos en esta etapa. Se pueden listar y leer registros `CONCERT_REMINDER` existentes.

El bloqueo del evento y su transición evitan duplicados de compra/cancelación/edición. Discover serializa sus inserciones mediante las filas existentes y comprueba ausencia antes de insertar, sin nueva tabla de eventos ni claves artificiales dentro de mensajes.

## Significado de métricas

Respuesta común: `tickets_sold`, `revenue` (decimal string), `confirmed_purchases`, `attendees`, `tickets_used`, `tickets_pending`, `capacity`, `occupancy_percent`, `concerts`, `active_concerts`, `sales_by_day:[{date,tickets_sold,revenue}]`, `activity:[{status,purchases}]`. ADMIN añade `users` y `organizers`.

- Vendidas: SUM de `purchase_items.quantity` en compras actualmente CONFIRMED. Recaudación: SUM de `quantity * unit_price`; nunca precio actual del tipo de entrada. Se excluyen reservas, pendientes, expiradas, canceladas y reembolsadas.
- Importes e ítems se agregan separados de los tickets individuales para evitar multiplicarlos por joins.
- Utilizadas/asistentes: tickets USED de esas compras. Representan ingresos registrados, no compradores únicos: el esquema no identifica a cada persona portadora. Pendientes: tickets ACTIVE de esas compras.
- Capacidad: SUM de `ticket_types.stock_total` de los conciertos del ámbito, sin repetir capacidad por compra ni utilizar aforo del venue. Ocupación: vendidas/capacidad × 100, dos decimales; cero si no hay cupo.
- Ventas por día: fecha UTC de creación de la compra actualmente confirmada. No se inventa una fecha de pago; el esquema no tiene `confirmed_at`.
- Un concierto cancelado mantiene historial de ventas confirmadas hasta que las compras sean reembolsadas por el flujo existente; la cancelación del concierto no reembolsa automáticamente. Tickets pendientes describen estado ACTIVE, no habilitación para ingresar a un concierto cancelado.
- Conciertos activos: PUBLISHED cuyo fin (o inicio cuando no hay fin) no pasó. Capacidad/conciertos son estado actual del ámbito y no se filtran por fecha de compra. Usuarios/organizadores son conteos actuales de plataforma; organizadores se cuentan por rol, sin duplicar multirrol.
- Actividad: compras distintas por estado; reservas vencidas figuran EXPIRED aunque todavía no se haya persistido la transición. Un conjunto constante de consultas COUNT/SUM/GROUP BY y una transacción de lectura coherente evita N+1 y resultados mezclados durante escrituras.

## Frontend y validación

Bandeja `/notifications` con paginación, estado, lectura individual/todas, enlace relacionado, retry, loading/empty/error e interruptor compartido con Mi cuenta. Badge se actualiza al navegar, confirmar compras, obtener recomendaciones, marcar lecturas, volver a primer plano y cada 60 segundos en primer plano. No requiere push.

Dashboards `/organizer/statistics` y `/admin/statistics`, con enlaces desde gestión/listados, filtros de fechas/concierto, indicadores y gráficos SVG de ventas diarias, vendidas/utilizadas y ocupación. El gráfico diario presenta los últimos 14 días con ventas del período junto a sus cifras legibles; la API devuelve toda la serie. Responsive sin desborde a 390 y 1440 px.

Validaciones reproducibles (MySQL aislado configurado mediante `TEST_DB_*`, ver README):

```text
backend: npm run build
backend: npm test
backend: npm run test:7
frontend: npm run typecheck
frontend: npm test
frontend: npm run build
frontend: npm run build:native
frontend: npx expo install --check
backend: npm run test:e2e
```

`tests/insights.test.js` prueba aislamiento, lectura, preferencias, eventos, rollback, deduplicación concurrente, permisos, importes históricos, asistentes, filtros y exclusión de compras no confirmadas en MySQL real. El E2E existente incorpora notificaciones y dashboards a los flujos de compra/escaneo/cancelación en ambos tamaños, más carga/empty/error y guards. Capturas locales en `frontend/test-results`.

Mobile: export Hermes Android/iOS y compatibilidad Expo; Web: bundle de producción con Edge headless y API/base reales. La interacción nativa en dispositivo físico/emulador no está certificada por estas pruebas de exportación y navegador.

Resultado validado: 141/141 tests backend, 10/10 unitarios frontend y 4/4 E2E; TypeScript, build backend, export Web, export Android/iOS y `expo install --check` correctos. Logs locales: `.local/stage7-backend-final.log`, `.local/stage7-e2e.log`, `.local/stage7-web.log` y `.local/stage7-native.log`.
