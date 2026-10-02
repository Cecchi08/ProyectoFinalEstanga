# VENTI — Etapa 6: Discover

Recomendaciones determinísticas calculadas al vuelo, sin tablas nuevas, caché persistente, IA externa, embeddings, notificaciones ni estadísticas. Se conserva el schema y la arquitectura REST existente.

## API

Todas las rutas exigen Bearer y usan exclusivamente `req.user.id`, con `Cache-Control: no-store`. Los query/body desconocidos (incluido `user_id`) se rechazan. Respuestas bajo el sobre habitual `{success:true,data:...}`.

| Ruta | Entrada / resultado |
|---|---|
| GET `/preferences` | `{recommendations_enabled:boolean}` |
| PATCH `/preferences` | Body estricto `{recommendations_enabled:boolean}`; actualiza solo la cuenta autenticada y conserva `notifications_enabled`. |
| GET `/recommendations` | `limit` opcional: 20 por defecto, entero 1–50. `{enabled,recommendations:[{concert,reason}]}`. Sin score público. |

OFF retorna `{enabled:false,recommendations:[]}` antes de leer historial, afinidades o candidatos. Un usuario sin fila de preferencias adopta el default TRUE del schema; PATCH crea la fila si falta. No se persisten recomendaciones ni se modifica historial.

## Perfil y scoring

`recommendations.repository.ts` agrupa consultas; `recommendation-scoring.service.ts` construye el perfil y ordena; `recommendations.service.ts` coordina. Controllers validan y presentan respuestas.

- Historial: conciertos PUBLISHED/FINISHED con tickets ACTIVE/USED de compras CONFIRMED del usuario. Una reserva sin confirmar, compra reembolsada/cancelada o ticket cancelado/reembolsado no aporta afinidad. Se cuenta cada concierto una sola vez, sin inflar pesos por cantidad de entradas.
- «Artista visto» y motivos de asistencia requieren un ticket USED. Una entrada ACTIVE aporta afinidad, pero el texto indica compra confirmada y no afirma asistencia.
- Favoritos: propios y de conciertos PUBLISHED/FINISHED, incluso pasados como señal de interés; no se usan borradores o cancelados.
- Géneros: `concert_genres` y `artist_genres` de los eventos anteriores. Los artistas se relacionan mediante `concert_artists`.
- Ciudad: la que aparece en más conciertos distintos del historial/favoritos, contando una vez un evento que pertenece a ambas fuentes. Empates por ID numérico. No se inventa una ubicación de perfil ni se usa geolocalización: el schema no guarda ciudad del usuario.

Cada categoría puntúa una vez por candidato:

| Señal | Puntos |
|---|---:|
| Género del concierto afín | 5 |
| Artista con ingreso previo registrado | 4 |
| Géneros afines de sus artistas | 3 |
| Concierto favorito o similar por género/artista | 2 |
| Ciudad preferida inferida | 1 |

Solo son candidatos conciertos futuros PUBLISHED, sin entradas válidas propias de compras CONFIRMED. La selección usa EXISTS y conciertos únicos, sin multiplicar filas por tickets/asociaciones. Se ordenan por score DESC, inicio ASC e ID numérico ASC para desempate estable. Si hay candidatos con afinidad, se excluyen los de score cero; si ninguno coincide, se ofrecen próximos publicados con un motivo genérico. Sin historial se usan primero las señales de favoritos, luego ciudad conocida y finalmente los próximos publicados. Un catálogo vacío produce un array vacío.

Cada motivo corresponde a una señal que aportó puntos; puede combinar frases de varias señales. No se afirma asistencia a partir de compras sin uso. El score se conserva solo dentro del servicio. La respuesta reutiliza la representación completa de concierto existente.

Se evalúan los candidatos futuros del catálogo y sus relaciones en consultas agrupadas; solo se enriquecen los resultados seleccionados. El número de consultas no crece por concierto: con resultados son diez consultas del repositorio, incluida preferencias, además de autenticación. El trabajo/memoria crece con candidatos y asociaciones; no se introduce una caché ni un corte por fecha que descarte arbitrariamente conciertos de mayor afinidad.

## Frontend

Nueva ruta `/recommendations`, sección «Venti Discover» del shell responsive. Reutiliza `ConcertCard`, incluyendo motivo, artistas, fecha, lugar y acceso al detalle. La búsqueda anterior permanece en `/discover`.

`PreferencesContext` está aislado por usuario dentro del shell autenticado. Perfil muestra el switch «Recomendaciones personalizadas». Discover consulta preferencias antes de pedir recomendaciones; durante guardado, carga fallida o estado OFF no inicia peticiones al motor y oculta resultados anteriores. OFF presenta un mensaje y acceso al perfil; no depende de storage local. Incluye carga/error/vacío/reintento. El endpoint también valida el estado OFF si cambió desde otra sesión.

## Pruebas

Backend: `npm run build`, `npm run test:6` con `TEST_DB_*` de MySQL aislado. Frontend: `npm run typecheck`, `npm test`, `npm run build`, `npm run build:native`.

E2E: build Web previo, Edge instalado y puertos 3000/8081 libres; ejecutar en backend `$env:VENTI_SKIP_OAUTH_TESTS='1'` y `npm run test:e2e`. Los flujos existentes también verifican Discover a 1440 y 390 px: toggle persistente, cero peticiones API al motor en OFF incluso tras recargar, recomendaciones/motivos derivados de favoritos y exclusión después de comprar. El arnés usa API/MySQL reales y bases desechables.

Las once pruebas nuevas cubren preferencias/aislamiento, OFF sin lectura de perfil, cold start, géneros, artistas vistos, artist_genres, favoritos, ciudad, exclusiones, cantidades, orden, límites, motivos y consultas agrupadas. Se conservan las pruebas de etapas previas. No se prueba cámara física ni se revalida OAuth; no se intervienen warnings transitivos.

Validación completada: 107/107 pruebas backend, 10/10 frontend y 3/3 E2E (120/120). TypeScript estricto y builds backend, Web, Android e iOS correctos. Discover revisado visualmente a 1440 y 390 px; Android/iOS validados mediante exportación, sin dispositivo físico. Capturas locales: `frontend/test-results/discover-1440.png` y `discover-390.png`.
