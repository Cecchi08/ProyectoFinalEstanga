# VENTI — Ajuste 5.1

Sin cambios de schema. El módulo TypeScript estricto `participation.*` sigue routes → controllers → services → repositories y reutiliza permisos, transacciones, validación, paginación y representación de conciertos. La validación QR no cambia.

Todas las rutas requieren Bearer y responden `Cache-Control: no-store`. Listados: `page=1`, `limit=20`, máximo 100, orden estable y sobre `{success,data,pagination}`.

| Método / ruta | Contrato |
|---|---|
| GET `/favorites` | Conciertos favoritos de `req.user.id`. Filtro opcional `concert_id` para el botón de detalle. |
| POST `/favorites/:concertId` | Body vacío o `{}`. HTTP 200, `{concert_id,favorite:true}`. Idempotente incluso concurrentemente. |
| DELETE `/favorites/:concertId` | Solo favorito propio. HTTP 204, idempotente para conciertos existentes. |
| GET `/staff/assignments` | STAFF: conciertos asignados en cualquier estado; ADMIN: todos. Otros roles: 403. |
| GET `/concerts/:id/attendees` | STAFF asignado, ADMIN o ORGANIZER propietario. Otros accesos: 403; concierto inexistente: 404. |

Se rechaza `user_id` en body/query. Favoritos bloquea el concierto y aprovecha la PK compuesta existente; no duplica filas. Agregar/listar conserva la visibilidad previa: publicados, propios de Organizer o todos para Admin. Eliminar permite quitar un favorito aunque el concierto haya dejado de ser visible. No se migran automáticamente favoritos locales previos.

Asistentes devuelve una fila por ticket emitido: `ticket_id`, `ticket_type_name`, `first_name`, `last_name`, `status`, `purchase_status`, `used_at`. El nombre es del **comprador**: no existen titulares individuales por ticket en el schema. Incluye entradas utilizadas/canceladas/reembolsadas con sus estados; excluye reservas sin tickets. No expone email, QR ni datos de autenticación. La consulta vuelve a aplicar el permiso para impedir divulgar filas tras una revocación entre el guard y la lectura. Multirol conserva la unión de propiedad/asignación.

Frontend: favoritos usa API/MySQL como única fuente de verdad; se eliminó su almacenamiento local y AsyncStorage. Staff lista/selecciona conciertos, consulta asistentes paginados y envía el concierto seleccionado al validador existente. Actualiza asistentes después de un ingreso. La alternativa de token manual Web permanece; desaparece el ingreso manual de IDs.

## Verificación

Con `TEST_DB_*` para MySQL aislado: backend `npm run build` y `npm run test:5.1`; frontend `npm run typecheck`, `npm test`, `npm run build`, `npm run build:native`. Para E2E, build Web previo, Edge instalado y puertos 3000/8081 libres; ejecutar en backend:

```powershell
$env:VENTI_SKIP_OAUTH_TESTS='1'
npm run test:e2e
```

Seis pruebas nuevas cubren autenticación, validación, aislamiento, duplicados concurrentes, visibilidad, paginación, asignaciones, revocaciones, multirol y asistentes sin secretos. E2E cubre favoritos en otra sesión independiente, eliminación sincronizada, selección Staff, asistentes y QR/segundo escaneo contra API/MySQL reales. Se excluyen OAuth y cámara física en este ajuste; no se intervienen warnings transitivos.

Resultado verificado el 2 de octubre de 2026: TypeScript y builds backend/Web/Android/iOS OK; 96/96 pruebas backend de la selección 5.1, 10/10 del cliente y 3/3 E2E (109/109). Schema sin cambios.
