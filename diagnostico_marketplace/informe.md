# Venti · Etapa 1 · Auditoría post-migración del marketplace

**Fecha:** 2026-10-25 · **Base auditada:** Railway, MySQL 8.4.11, base `venti` · **Resultado:** la base **no está lista** para empezar el backend del marketplace.

## 1. Alcance y método  

- **Fuentes revisadas:**
  - [database/schema.sql](../database/schema.sql): es la migración final. Está modificado y sin commit; reemplazó al esquema base, que queda en `HEAD`.
  - El esquema base en `HEAD`.
  - El backend: configuración de conexión, repositorios y servicios.
  - Los tests: [backend/tests/helpers.js](../backend/tests/helpers.js) y `scripts/stage5-e2e.mjs`.
  - La documentación: [docs/INSTALLATION.md](../docs/INSTALLATION.md) y `README.md`.
- **Conexión:** `backend/.env` define la URL pública de Railway. La conexión funcionó y el diagnóstico se ejecutó **contra los datos reales**. Este informe no incluye host, usuario ni contraseña.
- **Seguridad de la ejecución:**
  - Sesión `TRANSACTION READ ONLY`, verificada con `@@session.transaction_read_only = 1`.
  - Transacción `START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT`, cerrada con `ROLLBACK`.
  - Un filtro previo rechazaba toda sentencia que no empezara con `SELECT`/`WITH`.
  - `multipleStatements` desactivado.
  - El ejecutor solo cambió variables de sesión: `time_zone=+00:00` (igual que la API) y `max_execution_time=60000`.
  - No se ejecutaron migraciones, seeds, tests ni `schema.sql`. No se modificó código ni configuración.
- **Resultado de la ejecución:** 72 consultas, 0 errores, 0 rechazadas y 0 advertencias. El detalle está en [diagnostico_resultados.txt](diagnostico_resultados.txt). Los identificadores (`D03`, `J09`, etc.) corresponden a la columna `chequeo` de [diagnostico.sql](diagnostico.sql).
- **Limitación principal:** la base casi no tiene datos de negocio: 1 usuario, 1 provincia, 4 ciudades, 0 venues, 0 conciertos y 0 filas en todas las tablas operativas del marketplace (`P01`, `P02`). Por eso las verificaciones de datos pasan **sin casos que evaluar**. Eso no demuestra que la lógica funcione con datos reales.

## 2. Hallazgos por gravedad

### CRÍTICO

**C1. `establishments` tiene `UNIQUE(city_id)`: solo admite un establecimiento por ciudad.** *Es una restricción real de la base.*

- **Evidencia:**
  - `D03` y `D04`: `uq_establishments_city_name_address` existe y su definición actual es `U:city_id`.
  - `D02`: falta `idx_establishments_city`.
  - `G02`: `uq_city_name_address_columnas_restantes = 1`.
- **Causa** (es un defecto de la migración, no una ejecución parcial):
  1. [schema.sql:130](../database/schema.sql#L130) crea `UNIQUE (city_id, name, address)`.
  2. [schema.sql:1437](../database/schema.sql#L1437) solo crea `idx_establishments_city` si no existe un índice cuya primera columna sea `city_id`. El `UNIQUE` compuesto cumple esa condición, así que el índice no se crea.
  3. [schema.sql:1461](../database/schema.sql#L1461) solo elimina el `UNIQUE` si existe otro índice que empiece por `city_id`. No existe, así que el `UNIQUE` se conserva.
  4. [schema.sql:1481-1487](../database/schema.sql#L1481-L1487) eliminan `name` y `address`. MySQL quita esas columnas del índice, y el `UNIQUE` queda solo sobre `city_id`.
  5. La verificación final de la migración ([schema.sql:1975-2021](../database/schema.sql#L1975-L2021)) no revisa este índice, por eso la migración terminó sin abortar.
- **Impacto:**
  - Con 4 ciudades habilitadas, el marketplace admite como máximo 4 establecimientos.
  - El segundo establecimiento de Mar del Plata falla con `ER_DUP_ENTRY`.
  - Hoy no hay filas afectadas (`H02`: 0 ciudades con varios establecimientos) solo porque no hay venues.
  - En una base con varios venues por ciudad, el `DROP COLUMN address` habría fallado por duplicados y la migración habría quedado **a medias** (`name` eliminado, `address` presente).
- **Observación para la corrección:** el `UNIQUE` es hoy el único índice que da soporte a `fk_establishments_city`. Para quitarlo hay que crear antes un índice no único sobre `city_id`. Si no, MySQL devuelve el error 1553. No se corrigió nada, como pedía la consigna.

**C2. `database/schema.sql` ya no sirve para instalaciones nuevas y rompe todas las suites de tests.** *Conclusión por lectura de código: no se ejecutó porque estaba prohibido.*

- **El archivo no es autosuficiente:**
  - Empieza con `SELECT 1 FROM users/roles/.../concerts` ([schema.sql:3-9](../database/schema.sql#L3-L9)).
  - No contiene `CREATE DATABASE` ni `USE venti`: 0 coincidencias, frente a 2 en `HEAD`.
  - No crea `users`, `venues`, `concerts` ni las demás tablas base.
  - Sobre un servidor vacío falla con 1046 (no hay base seleccionada) o 1146 (tabla inexistente).
- **Los tests no pueden levantar su base:**
  - [helpers.js:42-43](../backend/tests/helpers.js#L42-L43) lee este archivo y reemplaza `CREATE DATABASE IF NOT EXISTS venti` y `USE venti;` por el nombre de la base temporal.
  - Como esas cadenas ya no existen, el reemplazo no tiene efecto y el script corre sin base seleccionada: la primera consulta falla con 1046.
  - Afecta a todas las suites de `npm test` y a `npm run test:e2e`, que usa el mismo `TestDatabase`.
- **La documentación describe otro archivo:**
  - [INSTALLATION.md:51-53](../docs/INSTALLATION.md#L51) dice que el archivo crea la base y que "no es una migración idempotente".
  - `README.md:27,38` y [db-check.js:11](../backend/scripts/db-check.js#L11) también lo tratan como esquema completo.
  - Hoy ese archivo es una migración idempotente que necesita el esquema anterior ya instalado.
- **Instalación nueva por la vía correcta (esquema de `HEAD` y después la migración):** reproduciría C1 de forma determinista.

### ALTO

**A1. No hay ningún mecanismo que expire los HOLD.**

- **Qué falta:** la base no tiene `EVENT` (`N04`) ni triggers (`N05`), y el backend no contiene código del marketplace. Ninguna búsqueda encontró `reservations`, `hold_expires_at` ni `establishment` en `backend/src`.
- **Qué hay:** `event_scheduler` está en `ON` (`A01`). La base exige `chk_reservations_hold_max_15_minutes` y `chk_reservations_hold_flag`, y tiene el índice `idx_reservations_hold_sweep`. Pero nadie pasa una reserva de HOLD a EXPIRED ni libera sus tramos.
- **Estado actual:** hay 0 reservas (`N01`-`N03`), así que no hay HOLD vencidos todavía.
- **Efecto colateral de diseño:** `chk_reservations_hold_flag` (`status_is_hold = (hold_expires_at IS NOT NULL)`) obliga a poner `hold_expires_at` en `NULL` al salir de HOLD. El vencimiento original se pierde, salvo que se guarde en `reservation_status_history`.

**A2. La API se conecta a Railway con una cuenta de privilegios administrativos globales.**

- **Evidencia** (`A02`, `A04`): 70 privilegios globales, entre ellos `SUPER`, `SYSTEM_USER`, `CREATE USER`, `FILE` y `SHUTDOWN`, con `DROP`/`ALTER`/`CREATE` globales y opción de otorgarlos.
- **Contraste:** [INSTALLATION.md](../docs/INSTALLATION.md) recomienda un usuario `venti_app` con `SELECT, INSERT, UPDATE, DELETE`.
- **Riesgo:** no es un defecto del esquema, pero es el contexto en el que van a correr el backend y futuras migraciones. Un error de la aplicación tiene alcance sobre todo el servidor.

### MEDIO

**M1. Los modos de tramo (`establishment_slot_modes`) se acumulan sin limpieza y pueden bloquear la otra modalidad.** *El diseño viene de la base; la regla de limpieza es inferida.*

- **Cómo funciona:**
  - La PK es `(establishment_id, slot_start)`: un solo modo por tramo y establecimiento.
  - `space_occupancy_slots` la referencia con `fk_space_occupancy_slots_mode` (`RESTRICT`).
  - Al cancelar o expirar una reserva hay que borrar sus tramos. La FK `fk_space_occupancy_slots_reservation` impide cambiar `status_blocks_space` de 1 a 0 mientras existan tramos.
  - Ninguna FK, trigger ni evento elimina el modo que queda huérfano.
- **Problema:** un modo "completo" que ya no tiene ocupación impide reservar un espacio parcial en ese tramo, y al revés.
- **Estado actual:** 0 modos, 0 obsoletos (`K01`, `K02`).

**M2. El vínculo venues ↔ establishments cambia el comportamiento del ABM de venues que ya existe.**

- **Altas:** el backfill de [schema.sql:855-865](../database/schema.sql#L855-L865) se ejecuta una sola vez. Un venue creado después por `ManagementRepository.insert('venues')` ([management.repository.ts:8](../backend/src/repositories/management.repository.ts#L8)) no genera establecimiento.
- **Bajas:** borrar un venue con establecimiento devuelve ahora 409 `RESOURCE_IN_USE` ([management.service.ts:57](../backend/src/services/management.service.ts#L57)).
- **Cambio de ciudad:** `fk_establishments_venue_city ON UPDATE CASCADE` propaga el cambio de `venues.city_id` al establecimiento:
  - Si la nueva ciudad no está en el marketplace, falla con 422 `INVALID_REFERENCE`.
  - Si esa ciudad ya tiene un establecimiento, falla con 409 (efecto de C1).

**M3. Varias reglas de negocio dependen solo del backend, porque la base no las garantiza.** Ver la tabla de la sección 4. Las más sensibles:

- Que toda reserva bloqueante tenga sus tramos de ocupación.
- Que un establecimiento sin organización esté en `DRAFT`.
- Que cada organización tenga un OWNER activo.

### BAJO

- **B1. Defaults de fecha distintos:** `reservations.created_at` usa `UTC_TIMESTAMP()`; el resto de las tablas usa `CURRENT_TIMESTAMP` (`C04`). Hoy coinciden, porque la zona global es `SYSTEM` = UTC y la API fija `+00:00`. Si cambia la zona del servidor, el CHECK de 15 minutos de HOLD dejaría de comparar valores homogéneos.
- **B2. Documentación desactualizada:** INSTALLATION y README siguen describiendo `schema.sql` como el esquema completo (ver C2).
- **B3. Tablas base reconstruidas (informativo):** `cities`, `venues` y `concerts` muestran `create_time` del 2026-10-24 23:45-23:46 (`B03`). Fueron reconstruidas por los `ALTER` de la migración. No se perdieron datos, porque eran tablas vacías.

## 3. Verificaciones superadas

**Estructura:** evaluadas con datos reales del catálogo de MySQL.

| Verificación | Evidencia | Resultado |
| --- | --- | --- |
| Migración parcial | `B02`, `C02`, `C03`, `D02`, `E02`, `F02`, `G01`, `G02` | No hay señales de ejecución parcial. Están las 43/43 tablas, `name`/`address` fueron eliminadas, hay 0 columnas `NULL` indebidas y 0 objetos finales faltantes. Las tablas se crearon el 2026-10-24 entre 23:45:42 y 23:47:50 UTC. La única desviación (C1) sale del propio script. |
| Columnas y nulabilidad finales | `C01`, `C02` | 37/37 correctas. |
| Índices esperados | `D02` | 44/45 presentes. Falta `idx_establishments_city` (C1). |
| FKs finales | `E01`, `E02`, `E03` | 27/27 con columnas, tabla referenciada y reglas `ON DELETE`/`ON UPDATE` correctas. Se eliminaron `fk_establishments_venue` y `fk_reservations_space`. |
| CHECKs | `F01`, `F02`, `F03` | 13/13 presentes y `ENFORCED`. Se eliminó `chk_payments_card`. |
| Flags de estado (`is_hold`, `blocks_space`) | `I01` | HOLD (1,1), CONFIRMED (0,1), COMPLETED (0,1), CANCELLED (0,0), EXPIRED (0,0). No hay códigos no previstos. Los protegen `chk_reservation_statuses_hold_blocks`, `uq_reservation_statuses_flags` y la FK compuesta `fk_reservations_status`. |
| Geografía | `L01`-`L07` | Buenos Aires (id 1) contiene el partido General Pueyrredón (id 1), que agrupa Mar del Plata (1), Batán (2), Sierra de los Padres (3) y Chapadmalal (4). Las 4 están en `marketplace_cities`. Ninguna ciudad del marketplace está fuera del partido, ningún partido pertenece a otra provincia y no hay ciudades duplicadas ni con nombres parecidos. |
| Catálogos | `O01`-`O04` | Todos con la cantidad esperada. Permisos: OWNER 15, MANAGER 13, MEMBER 2. ARS cargado. 4 métodos de pago con `requires_card` correcto. |

**Datos:** todas dan 0 casos, pero **sin datos que evaluar**.

| Verificación | Evidencia |
| --- | --- |
| Reservas bloqueantes sin ocupaciones o con cobertura incompleta | `J01`, `J02` |
| Ocupaciones huérfanas, fuera de rango, sin dueño o con dos dueños | `J03`, `J04`, `J05`, `J06` |
| Duplicados estructurales | `J13` |
| Rangos inválidos | `J08` |
| Conflictos: mismo espacio, reserva contra bloqueo, completo contra parcial, modalidades mezcladas | `J09`-`J12` |
| Consistencia de columnas derivadas | `J14`, `I03` |
| Modos obsoletos | `K01`, `K02` |
| Backfill de venues: faltantes, duplicados, campos vacíos, estado y organización | `M01`-`M10` |
| HOLD vencidos o inconsistentes | `N01`-`N03` |

## 4. Restricciones de la base y reglas inferidas

| Regla | ¿La garantiza la base? | Mecanismo o comentario |
| --- | --- | --- |
| Un establecimiento por venue | Sí | `uq_establishments_venue` |
| Varios establecimientos por ciudad | **No: hoy lo impide** | `UNIQUE(city_id)` (C1) |
| Establecimientos solo en ciudades del marketplace | Sí | `fk_establishments_city` → `marketplace_cities` |
| La ciudad del establecimiento coincide con la de su venue | Sí | `fk_establishments_venue_city` (venue_id, city_id) |
| Marketplace = General Pueyrredón | No | Solo lo garantiza el seed. Cualquier ciudad puede agregarse a `marketplace_cities`. |
| Flags del estado copiados en la reserva | Sí | FK compuesta `fk_reservations_status` |
| Un HOLD tiene vencimiento ≤ 15 min, y solo un HOLD tiene vencimiento | Sí | `chk_reservations_hold_flag`, `chk_reservations_hold_max_15_minutes` |
| El HOLD vencido pasa a EXPIRED | **No** | Sin mecanismo (A1) |
| No hay dos ocupaciones del mismo espacio en el mismo tramo | Sí | PK `(space_id, slot_start)` |
| Solo ocupan tramos las reservas bloqueantes | Sí | `chk_space_occupancy_slots_single_owner` + FK con `reservation_blocks_space` |
| Toda reserva bloqueante tiene todos sus tramos | **No** | Depende del backend. Se puede detectar después con `J01`/`J02`. |
| No se mezclan espacio completo y parcial en un tramo | Sí, mientras existan los tramos | PK de `establishment_slot_modes` + `fk_space_occupancy_slots_mode` |
| Limpieza de modos sin ocupación | **No** | M1 |
| Reserva, cotización y solicitud coherentes (espacio, fechas, moneda) | Sí | FKs compuestas `fk_reservations_quote`, `fk_quotes_request` |
| Pago y devolución en la moneda de la reserva | Sí | `fk_payments_reservation`, `fk_refunds_payment` |
| Un establecimiento sin organización está en DRAFT | **No** | Solo lo cumple el backfill |
| Cada organización tiene un OWNER activo | **No** | Depende del backend |
| A lo sumo un espacio "completo" por establecimiento | Sí | `uq_spaces_establishment_whole_venue` |

## 5. Verificaciones pendientes

1. **Datos reales:** volver a ejecutar `diagnostico.sql` cuando existan venues, establecimientos y reservas. Hoy las comprobaciones de datos pasan sin casos que evaluar.
2. **Instalación nueva:** probar `schema.sql` en un MySQL descartable una vez decidida su estructura (D2). No se ejecutó por restricción; C2 se basa en lectura de código.
3. **Tests:** no se ejecutaron porque crean y eliminan bases. La falla de `helpers.js` se dedujo de la lectura del código.
4. **Historial de la migración:** no hay log de ejecución. No se puede confirmar si llegó a emitir `Migracion completa` ni cuántas veces se ejecutó. Es idempotente, y el estado final coincide con el esperado salvo C1.
5. **Concurrencia de reservas:** no se puede verificar hasta que exista el backend (bloqueos y orden de escritura de tramos y modos).

## 6. Decisiones pendientes

1. **D1. Unicidad de establecimientos.** ¿Se permiten varios por ciudad? Se asume que sí. Si es así, hay que reemplazar `UNIQUE(city_id)` por un índice no único y decidir si existe otra unicidad además de `venue_id`.
2. **D2. Organización de los archivos SQL.** Recuperar el esquema base y mover la migración a un archivo propio, o consolidar un esquema completo para instalaciones nuevas. Después, ajustar `helpers.js`, INSTALLATION, README y `db:check`.
3. **D3. Expiración de HOLD.** Elegir entre un `EVENT` de MySQL, un job del backend o expiración diferida al leer. Definir también si `hold_expires_at` debe conservarse en EXPIRED, lo que exige cambiar `chk_reservations_hold_flag`.
4. **D4. Limpieza de `establishment_slot_modes`.** Por ejemplo: borrar en la misma transacción que libera los tramos, o liberar el modo cuando no quede ninguna ocupación.
5. **D5. Ciclo de vida venue ↔ establecimiento.** Definir cómo se crean establecimientos para venues nuevos y qué pasa al editar o borrar venues desde el ABM actual.
6. **D6. Propiedad de los establecimientos migrados.** Hoy quedan con `organization_id NULL` y en `DRAFT`. Definir quién los reclama y si la base debe imponer "sin organización ⇒ DRAFT".
7. **D7. Usuario MySQL de la API.** Crear una cuenta de mínimo privilegio para la aplicación y otra separada para migraciones.
8. **D8. Zona horaria.** Unificar los defaults de fecha a UTC explícito o documentar la dependencia de la zona del servidor.

## 7. Conclusión

La base **no está lista**. La auditoría **no se declara exitosa**.

- **Bloqueos para avanzar:**
  - **C1:** `UNIQUE(city_id)`.
  - **C2:** `schema.sql` no instala desde cero y los tests no pueden ejecutarse.
- **Bloqueo antes de implementar reservas:** **A1** (no hay expiración de HOLD).
- **Lo que sí está bien:** la estructura de reservas, ocupación, pagos y geografía quedó en el estado final previsto. Sus restricciones de integridad se aplican en la base.
- **Lo que no se pudo validar:** las verificaciones de datos no tuvieron casos, porque la base está vacía. Siguen pendientes.
