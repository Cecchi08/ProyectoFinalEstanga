# Roles y permisos — Etapas 2 y 3

Ajuste 5.1: `/favorites` siempre opera sobre la cuenta autenticada, incluido ADMIN. `/staff/assignments` permite STAFF (solo asignados) y ADMIN (global). `/concerts/:id/attendees` permite STAFF asignado, ORGANIZER propietario o ADMIN; multirol conserva la unión de permisos. No se amplía el CRUD de STAFF ni la visibilidad de `/concerts`. [Contrato 5.1](VENTI_AJUSTE_5_1.md).

`USER`, `ORGANIZER`, `STAFF` y `ADMIN` son roles independientes; un usuario puede tener varios. Registro y alta OAuth asignan solamente `USER` y crean `user_preferences`, en la misma transacción que el usuario. `organizer_profiles` no se crea para usuarios comunes. No hay endpoints públicos para asignar roles ni crear organizadores en esta etapa.

`authenticate(tokens, auth)` exige Bearer JWT HS256 con firma, issuer, audience y expiración válidos. Consulta usuario activo, política de email y todos los roles actuales en MySQL antes de asignar `req.user={id,roles}`. Alterar body o headers personalizados no modifica permisos.

`authorize(...roles)` exige al menos uno de los roles recibidos; sin roles requeridos deniega. La comprobación de ADMIN se hace explícitamente en las rutas que deban admitirlo.

Guards reutilizados por la gestión de conciertos:

- `authorizeConcertOwner(service, parameter='concertId')`: ADMIN o ORGANIZER propietario por `concerts.organizer_id`.
- `authorizeStaffAssignment(service, parameter='concertId')`: ADMIN o STAFF asignado en `staff_assignments`.

Ambos requieren `authenticate` previo, comprueban existencia del concierto (404), parámetro válido (422) y pertenencia (403). Los recursos hijos resuelven su concierto desde base de datos; no se acepta un concertId del cliente como prueba de propiedad de otro recurso. Las escrituras vuelven a comprobar propiedad dentro de la transacción con el padre bloqueado, usando la regla compartida `assertConcertOwner`.

La sesión SQL usa UTC y queries parametrizadas. Los identificadores SQL interpolados provienen de constantes internas de tokens y gestión; nunca de parámetros del cliente. En autenticación los bloqueos siguen el orden usuario → tokens; en gestión, concierto → hijos. Una falla revierte toda la transacción.

## Gestión de Etapa 3

| Rol | Lectura de conciertos | Escritura |
|---|---|---|
| Público / USER / STAFF | Solo PUBLISHED | Ninguna |
| ORGANIZER | PUBLISHED y propios en cualquier estado | Solo conciertos y entradas propios, según reglas de estado |
| ADMIN | Todos | Conciertos, entradas y catálogos globales |

Los catálogos tienen lectura pública y escritura exclusiva de ADMIN. ORGANIZER asocia artistas/géneros existentes a sus conciertos pero no administra esos catálogos. STAFF no obtiene CRUD por una asignación. Roles combinados conservan los permisos de cada rol. La creación ORGANIZER rechaza `organizer_id`; ADMIN puede elegir un organizador activo con perfil. La propiedad no se transfiere por PATCH.

La lectura de entradas hereda la visibilidad del concierto. Consultas privadas requieren un JWT válido; las públicas aceptan Bearer opcional, pero rechazan tokens inválidos. Un concierto privado ajeno devuelve 404 en lectura y 403 al intentar modificarlo. Más detalles en [Etapa 3](VENTI_ETAPA_3.md).

El access corto no se revoca en logout/reset; los refresh sí. Desactivar una cuenta o retirar un rol tiene efecto inmediato en rutas autenticadas porque consultan MySQL. CORS usa lista exacta configurable; rate limiting por IP cubre `/auth` y un límite más estricto compartido de 10 solicitudes/ventana para registro, login y emails. No habilitar confianza arbitraria en `X-Forwarded-For`.
