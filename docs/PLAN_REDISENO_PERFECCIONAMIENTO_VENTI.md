# Plan Maestro de Rediseño y Perfeccionamiento Integral — Venti

**Rol del documento:** Hoja de ruta arquitectónica, funcional y de diseño UX/UI (Etapa previa a implementación).  
**Documentos fuente analizados y conciliados:**
1. **`docs/DIAGNOSTICO_FUNCIONAL_VENTI.md`** (y su anexo comparativo `docs/AUDITORIA_FUNCIONAL_VENTI_OFICIAL.md`): Auditoría verificada sobre el código fuente real del repositorio (`frontend/`, `backend/`, `database/venti_mvp_mysql84.sql`) y hallazgos de la prueba física del APK en Android.
2. **`docs/Plan.md`**: Investigación externa sobre rediseño, estudio de campo, identidad visual *Urbano Contemporáneo*, arquitectura UX, adaptabilidad responsive, rendimiento y microinteracciones.

---

## 1. RESUMEN EJECUTIVO

### 1.1. Estado actual del proyecto
Venti es una plataforma académica multiplataforma (React Native `0.86.3` + Expo SDK `~57.0.0` + Expo Router `~57.0.26` + React `19.2.3`, con backend en Node.js `22.x`, Express `5.1.0`, TypeScript y base de datos MySQL `8.4.11` alojada en Aiven) que articula el ecosistema de música en vivo del Partido de General Pueyrredón. A diferencia de una ticketera comercial tradicional, Venti conecta **6 roles** (`COMPRADOR`, `ARTISTA`, `ORGANIZADOR`, `VENUE`, `EMPRESA_SERVICIOS` y `ADMIN`) y resuelve tanto la venta de entradas con código QR y control de acceso en puerta como la producción integral previa del evento: catálogo y contratación de artistas, alquiler y presupuestación de espacios físicos, y cotización de servicios técnicos (sonido, iluminación, seguridad).

La auditoría de código (`DIAGNOSTICO_FUNCIONAL_VENTI.md`) demostró que **el backend y la capa de datos en MySQL 8.4 están maduros y son transaccionalmente consistentes**: cuentan con 12 repositorios especializados, procedimientos almacenados (`sp_create_purchase`, `sp_confirm_purchase`, `sp_cancel_purchase`, `sp_validate_ticket_qr`), bloqueo de filas para evitar sobreventa o solapamiento de reservas (`FOR UPDATE` y `LOCK IN SHARE MODE`), retención temporal de 15 minutos (`HOLD`), auditoría trazable (`audit_logs`) y suites automatizadas de pruebas E2E, UI y accesibilidad (`stage5-e2e.mjs`, `ui-e2e.mjs`, `a11y-audit.mjs`).

### 1.2. Principales problemas detectados
Pese a la solidez del backend, la inspección del frontend y la prueba física del APK evidenciaron cuatro problemas centrales que impiden una experiencia fluida:
1. **Defectos de layout responsive y superposición de tarjetas en dispositivos móviles (APK Android):** El uso de `height: "100%"` en el componente `Card` dentro de grillas flexibles `BentoGrid` (`flexDirection: "row", flexWrap: "wrap"`) provoca en el motor Yoga de Android que las tarjetas colapsen su caja o desborden sobre la tarjeta o fila de botones inmediatamente inferior. A esto se suma la colisión de insignias (`badge` / `subBadge`) en posición absoluta dentro de `MusicalCover` y selectores inline (`Select.tsx`) que deforman las filas al abrirse.
2. **Fricción severa de usabilidad e interfaz poco intuitiva:** Se exige al usuario ingresar fechas escribiendo manualmente cadenas en formato técnico ISO 8601 con zona horaria (`2027-06-10T23:00:00Z`) o `AAAA-MM-DD`, horarios de apertura codificados manualmente por línea (`1 10:00-23:00`), cantidades de entradas mediante un campo de texto numérico libre en lugar de un control paso a paso (`-` / `+`), y el selector `Select.tsx` expone identificadores internos (IDs numéricos o UUIDs) en la etiqueta del botón en lugar de los nombres legibles.
3. **Inconsistencias en navegación multi-rol y flujos desconectados en UI:** El frontend aplana el arreglo de roles del usuario a un único rol mediante `primaryRole(auth.roles)` en `Shell.tsx` sin ofrecer un mecanismo validado de cambio de contexto o acceso multi-rol; oculta `"Mis entradas"` (`/tickets`) y `"Mis compras"` (`/purchases`) a cualquier usuario que adquiera un rol adicional (`ARTISTA`, `ORGANIZADOR`, `VENUE`, `EMPRESA_SERVICIOS`, `ADMIN`); deja inconclusa la pantalla `ProfilesScreen.tsx` (`/profiles`), que consulta `GET /me/profiles` pero no renderiza los controles para activar roles *self-service* (`POST /me/profiles`) ni solicitar roles sujetos a moderación (`POST /me/profile-requests`); y duplica la ruta `/discover` con `/recommendations`.
4. **Identidad visual previa basada en azul/índigo (`Electric Stage Indigo`):** La paleta actual (`#4338CA` / `#4F46E5` en `palette.ts` y gradientes índigo hardcodeados en `MusicalCover`) carece de la impronta escénica y nocturna buscada y debe ser sustituida.

### 1.3. Objetivo de la nueva etapa
Ejecutar un rediseño y perfeccionamiento integral que:
- Adopte de forma definitiva la identidad visual **Urbano Contemporáneo** (base de carbón y tonos oscuros, amarillo energético como acento primario, rojo para énfasis/alertas y blancos/grises cálidos para superficies y jerarquía tipográfica), garantizando contraste WCAG 2.2 AA en modo oscuro y modo claro.
- Elimine por completo las superposiciones visuales y fugas de layout diferenciando explícitamente **Android**, **iOS** y **Web** (móvil, tablet y escritorio).
- Resuelva la navegación multi-rol evaluando alternativas arquitectónicas y validándolas mediante prototipo, garantizando que las funcionalidades compartidas (`tickets`, `purchases`, `notifications`, `discover`) permanezcan accesibles en todo momento y completando los flujos desconectados en el frontend bajo las reglas de negocio ya implementadas en el backend.
- Reemplace las entradas técnicas crudas (fechas escritas a mano, IDs en botones, sintaxis de horarios) por selectores visuales de calendario y horario con formato localizado para el usuario y conversión interna transparente hacia el backend, aplicando optimizaciones de rendimiento únicamente tras medir e identificar cuellos de botella comprobados.

---

## 2. DIAGNÓSTICO CONSOLIDADO Y RESOLUCIÓN DE CONTRADICCIONES

### 2.1. Resolución de contradicciones entre `Plan.md` y `DIAGNOSTICO_FUNCIONAL_VENTI.md`

Al haberse redactado `Plan.md` sin inspección previa del repositorio, existen discrepancias puntuales frente a la realidad del código auditada en `DIAGNOSTICO_FUNCIONAL_VENTI.md`. Se resuelven aplicando el contexto funcional real y las reglas de producto de Venti:

| Tema en conflicto | Postura en `Plan.md` (Investigación externa) | Realidad verificada en `DIAGNOSTICO_FUNCIONAL_VENTI.md` | Resolución arquitectónica adoptada |
| :--- | :--- | :--- | :--- |
| **1. Roles del sistema** | Contempla únicamente 4 perfiles: Asistente, Artista, Organizador y Administrador (Sección 2.1 y 4.2). | El sistema real posee **6 roles** en base de datos y backend: `COMPRADOR`, `ARTISTA`, `ORGANIZADOR`, `VENUE` (Espacio Físico), `EMPRESA_SERVICIOS` (Proveedores técnicos) y `ADMIN`, además de personal operativo de puerta (`concert_staff`). | El diseño de navegación, permisos y pruebas abarcará obligatoriamente los **6 roles reales** más la asignación operativa de staff de acceso. |
| **2. Alcance de compra y pagos** | Plantea como duda abierta (Sección 12.2 / 12.3) si el piloto incluye compra con pago o solo reserva/acceso. | El flujo de órdenes, reserva de cupo (`sp_create_purchase`), pago simulado (`is_simulated = 1`), emisión de QR y reembolso simulado (`sp_cancel_purchase`) **ya está implementado y funcional**. | Se conserva el flujo completo de compra y reembolso **simulado**, optimizando su UX (selector `-`/`+` y checkout en dos pasos) sin integrar pasarelas reales. |
| **3. Regla de publicación de conciertos vs. creación de borradores** | Propone un wizard de 3 pasos donde el paso 2 exige espacio/disponibilidad para crear el concierto (Sección 4.4) y sugiere que los estados son ambiguos (Sección 8.3). | Por regla de negocio verificada (`management.repository.ts`), un concierto **puede crearse y editarse en estado `DRAFT` sin reserva**, pero **para pasar a `PUBLISHED` en un espacio del marketplace debe vincular una reserva `CONFIRMED` que cubra la franja horaria**. | Se respeta estrictamente la regla real: permitir guardar y editar borradores (`DRAFT`) libremente, y validar la reserva confirmada como requisito bloqueante al publicar (`POST /concerts/:id/publish`). |
| **4. Alcance de moderación del Administrador** | En las tareas de prueba (Sección 2.1 y 2.4) sugiere que el Administrador aprueba o rechaza "propuestas" enviadas a artistas. | En Venti, las propuestas (`artist_proposals`), presupuestos de espacios (`venue_quotes`) y cotizaciones técnicas (`service_quotes`) son **negociaciones privadas entre las partes**. El `ADMIN` modera cuentas, solicitudes de rol (`profile_requests`), publicación de establecimientos (`PENDING_REVIEW`) y verificación de empresas (`is_verified`). | El `ADMIN` **no interviene** en propuestas ni presupuestos privados entre artistas, organizadores, espacios y empresas de servicios. |
| **5. Incorporación de `FlashList`, `expo-image`, `Reanimated` y paginación por cursor** | Recomienda en la matriz inicial (Sección 9) introducir `FlashList`, `expo-image`, `react-native-reanimated` y paginación cursor/keyset en MySQL. | El análisis de `frontend/package.json` confirma que el proyecto utiliza paquetes core (`react-native`, `react-native-svg`) sin `FlashList`, `expo-image` ni `reanimated`, y todos los endpoints paginados del backend usan `page` + `limit` con un contrato JSON `{ data, pagination }` consumido por `<Pager />`. | **No se agregarán dependencias nuevas ni se cambiará la paginación a cursor sin medición previa que demuestre un cuello de botella real.** Primero se optimizarán el layout y los componentes nativos existentes. |
| **6. Estado de estados explícitos y disponibilidad en reservas/propuestas** | Asume que podrían faltar estados explícitos o validación previa de solapamientos en backend (Sección 8.4 y 8.5). | El backend **ya valida solapamientos antes de crear la reserva** (`LOCK IN SHARE MODE` en `marketplace.repository.ts`), expone el endpoint `/marketplace/venues/:id/availability` y maneja máquinas de estados completas con motivo de rechazo e historial. | No se reescribirá la lógica transaccional del backend; las mejoras se enfocarán en la claridad visual de las franjas ocupadas y la obligatoriedad del motivo de rechazo en los botones rápidos de la UI. |

### 2.2. Clasificación funcional consolidada del sistema

Utilizando estrictamente los cinco estados requeridos:

| Módulo / Aspecto | Estado actual | Sustento verificable |
| :--- | :--- | :--- |
| **1. Registro e inicio de sesión** | **Implementado y funcional.** | Login, registro, modo invitado (`POST /auth/guest`), Google OAuth, verificación de email, recupero de clave y rotación de refresh tokens activos (`AuthScreen.tsx`, `mysql.repository.js`). |
| **2. Roles y permisos** | **Implementado, pero con problemas.** | El backend soporta múltiples roles aditivos y 23 permisos en `user_roles`, pero el frontend reduce la sesión a `primaryRole(auth.roles)` y `UsersScreen.tsx` pisa los roles previos al enviar `replace: true`. |
| **3. Exploración de eventos** | **Implementado, pero con problemas.** | Búsqueda, filtros y *Venti Discover* funcionan contra la API, pero en móvil sufren superposición de tarjetas (`ConcertCard`), filtros con fechas ISO manuales y selectores que muestran IDs internos. |
| **4. Compra y gestión de entradas** | **Implementado y funcional.** | Reserva de stock, compra simulada inmediata o diferida, emisión de entradas y cancelación con reembolso simulado (`ConcertDetail.tsx`, `PurchasesScreen.tsx`, `commerce.repository.ts`). Mejorar UX del checkout. |
| **5. Códigos QR y control de acceso** | **Implementado y funcional.** | Generación SVG (`TicketsScreen.tsx`) y escaneo con cámara nativa (`expo-camera`) o token manual en puerta (`StaffScreen.tsx`, `sp_validate_ticket_qr`). Afectado indirectamente cuando el comprador cambia de rol y pierde el acceso a `/tickets` en el menú. |
| **6. Perfiles y autogestión de roles** | **Implementado parcialmente.** | `ProfileScreen.tsx` actualiza nombre, apellido y teléfono (`PATCH /me`), pero `ProfilesScreen.tsx` (`/profiles`) **no tiene implementados los botones para activar roles self-service (`POST /me/profiles`) ni solicitar roles (`POST /me/profile-requests`)**, y carece de enlace desde `ProfileScreen.tsx`. |
| **7. Funciones para artistas** | **Implementado y funcional.** | ABM de perfiles artísticos, publicación/archivo, integrantes (`OWNER`/`MEMBER`), perfil público (`/artist/[id]`), recepción de propuestas y postulación a espacios (`ArtistsScreen.tsx`). |
| **8. Funciones para organizadores** | **Implementado y funcional.** | Creación de borradores, vinculación de reserva confirmada para publicar, cartel de artistas (`ArtistPicker`), tipos de entrada (`TicketEditor`), staff (`StaffPanel`), contratación de artistas y estadísticas (`ConcertEditor.tsx`). Con fricción de UX por fechas ISO manuales. |
| **9. Gestión de espacios (Marketplace)** | **Implementado y funcional.** | Organizaciones, miembros, establecimientos con moderación administrativa, salas (`venues`), comodidades, fotos, horarios, bloqueos y panel de artistas/organizadores relacionados (`ManageScreen.tsx`). Con fricción de UX en carga de horarios por texto crudo. |
| **10. Reservas de espacios** | **Implementado y funcional.** | Consulta de disponibilidad (`SETUP`/`EVENT`/`TEARDOWN`), retención temporal (`HOLD` 15 min), pago simulado, aceptación/rechazo por el espacio e historial (`ReservationsScreen.tsx`). |
| **11. Propuestas y presupuestos** | **Implementado y funcional.** | Flujos completos de propuestas artísticas (`ORGANIZER_TO_ARTIST`, `VENUE_TO_ARTIST`, `ARTIST_TO_VENUE`), presupuestos de espacios (`/marketplace/quotes`) y cotizaciones técnicas (`/services/quotes`). |
| **12. Notificaciones** | **Implementado y funcional.** | Bandeja interna paginada, contador de no leídas, marcado individual/masivo, switch de *Venti Discover* y navegación directa a la entidad (`NotificationsScreen.tsx`, `notificationTarget.ts`). |
| **13. Administración** | **Implementado y funcional.** | Gestión de usuarios, aprobación de solicitudes de perfil y de establecimientos, verificación de empresas de servicios, suspensión de cuentas, catálogos, estadísticas globales y auditoría (`AdminScreen.tsx`, `UsersScreen.tsx`). |
| **14. Navegación** | **Implementado, pero con problemas.** | `Shell.tsx` oculta rutas de comprador a usuarios con otros roles, carece de selector de contexto multi-rol, deja `/profiles` huérfana y duplica `/discover` con `/recommendations`. |
| **15. Diseño responsive e identidad visual** | **Implementado, pero con problemas.** | Superposición de tarjetas en móviles Android por `height: "100%"` en `BentoGrid`, colisión de badges en `MusicalCover`, desborde inline de `Select.tsx` y paleta azul/índigo que debe reemplazarse por *Urbano Contemporáneo*. |
| **16. Estados de carga, error y vacío** | **Implementado y funcional.** | Cubiertos mediante `ResourceState`, `ActionFeedback` y `Notice` (`frontend/src/components/ui/index.tsx`), con oportunidad de incorporar skeletons en cargas iniciales y estados explícitos de expiración. |
| **17. Pasarela de pago real, RRPPs, Mesas VIP, Venti Swap, Push nativo y subida multipart de archivos** | **No implementado.** | Fuera del alcance académico definido para Venti. |
| **18. Flujos privados detrás de login en `venti.com.ar`** | **No verificable.** | Excluidos por restricción ética y metodológica de no intervenir ni crear sesiones en la plataforma comercial externa. |

### 2.3. Separación estricta de la evidencia

#### A. Problemas confirmados por inspección del código (`DIAGNOSTICO_FUNCIONAL_VENTI.md`)
1. **`ProfilesScreen.tsx` inconclusa y desconectada:** Consulta `GET /me/profiles`, pero ignora las propiedades `self_service`, `requestable` y `requests` de la respuesta; no invoca `POST /me/profiles` ni `POST /me/profile-requests`, y `ProfileScreen.tsx` no enlaza a `/profiles`.
2. **Exclusión de rutas por `primaryRole` en `Shell.tsx`:** La función `linksForRole` asigna enlaces según un único rol prioritario (`ADMIN > ORGANIZADOR > VENUE > EMPRESA_SERVICIOS > ARTISTA > COMPRADOR`). Quien tiene un rol distinto de `COMPRADOR` pierde el acceso por menú a `/tickets` y `/purchases`, y los roles `VENUE` y `EMPRESA_SERVICIOS` pierden el enlace a `/discover`.
3. **Sobrescritura de roles en administración (`UsersScreen.tsx` línea 227):** La acción de asignar rol envía `{ replace: true }` a `POST /admin/users/:id/roles`, eliminando los roles previos del usuario en lugar de permitir gestión aditiva de perfiles.
4. **Ruta duplicada `/discover` y `/recommendations`:** `frontend/app/(app)/(tabs)/discover.tsx` y `frontend/app/(app)/(tabs)/recommendations.tsx` exportan ambos `DiscoverScreen.tsx`, mostrando dos pestañas idénticas para el rol `COMPRADOR`.
5. **Exposición de identificadores internos en `Select.tsx` (línea 36):** El botón renderiza `values.join(", ")`, mostrando en la interfaz los IDs numéricos o UUIDs seleccionados en vez de la etiqueta `name` del catálogo.
6. **Campos de fecha que exigen cadenas ISO 8601 manuales:** En `ConcertList.tsx` (líneas 273, 278) y `ConcertEditor.tsx` (líneas 30–38, 270, 277, 567, 568) se exige escribir cadenas como `2027-06-10T23:00:00Z`.
7. **Carga de horarios de apertura por sintaxis cruda (`ManageScreen.tsx` líneas 687–691):** Se exige tipear líneas con formato `^[1-7]\s+\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$` (`1 10:00-23:00`).
8. **Uso de `height: "100%"` en `Card` dentro de `BentoGrid` (`flexWrap: "wrap"`):** Presente en 12 componentes/pantallas (`ConcertList.tsx`, `StatTile` en `ui/index.tsx`, `PurchasesScreen.tsx`, `ArtistsScreen.tsx`, `MarketplaceScreen.tsx`, `ManageScreen.tsx`, `QuotesScreen.tsx`, `ReservationsScreen.tsx`, `ServicesScreen.tsx`, `ProvidersScreen.tsx`, `ServiceQuotesScreen.tsx` y `StaffScreen.tsx`).
9. **Badges absolutos sin truncamiento en `MusicalCover` (`ui/index.tsx` líneas 559–603):** Carecen de `flexShrink: 1` y `numberOfLines={1}`, superponiéndose cuando `subBadge` contiene varios géneros musicales (`ConcertDetail.tsx` línea 161).
10. **Rechazo rápido de propuestas con motivo hardcodeado:** En `ArtistsScreen.tsx` (línea 259) y `ManageScreen.tsx` (línea 496), el botón `"Rechazar"` de las tarjetas de listado envía un motivo predeterminado sin permitir redactar la causa ni pedir confirmación, a diferencia de `ProposalScreen.tsx` (línea 156).

#### B. Problemas observados durante pruebas físicas del APK (`DIAGNOSTICO_FUNCIONAL_VENTI.md`)
1. **Superposición real de tarjetas con otros elementos en teléfonos Android:** Confirmado visualmente en el APK y correlacionado directamente con las Causas #1 (`height: "100%"` en `BentoGrid`), #2 (badges en `MusicalCover`) y #3 (`Select` inline expandido).
2. **Baja intuición general de la interfaz:** Dificultad para comprender dónde están las funciones de cada perfil, cómo filtrar por fechas, cómo elegir cantidades o cómo navegar entre subpaneles densos apilados en una sola vista.
3. **Rechazo a la paleta azul/índigo dominante:** Necesidad de abandonar el azul como color principal para adoptar la dirección *Urbano Contemporáneo*.

#### C. Hipótesis que necesitan validación y medición previa
1. **Hipótesis de rendimiento de scroll y re-renderizado (`Plan.md` Sección 6.3):** `Plan.md` plantea como posibilidad que los listados sufran caída de FPS (*jank*) por usar `.map()` dentro de `ScrollView` (vía `<Page>` y `<BentoGrid>`) o por re-renderizados de componentes. Dado que el backend pagina de a 12 o 20 registros por página (`limit`), **toda optimización de rendimiento (`React.memo`, memoización, caché, `debounce`, paginación o virtualización) queda condicionada al protocolo estricto de medir primero el estado actual, identificar el cuello de botella real y volver a medir después**.
2. **Hipótesis de degradación de consultas `LIMIT/OFFSET` en MySQL (`Plan.md` Sección 6.5):** Con el volumen académico actual de Venti, no hay evidencia de lentitud por `OFFSET`. Debe medirse la latencia de los endpoints antes de plantear cambios en las consultas SQL.
3. **Hipótesis sobre modelo óptimo de navegación multi-rol y metas de tiempos de respuesta (`Plan.md` Sección 2.4, 4.2 y 6.2):** La elección definitiva entre patrones de navegación multi-rol (pestañas contextuales con selector de rol vs. barra inferior compartida con panel operativo) y el cumplimiento de las metas de validación (`< 100 ms`, `< 250 ms`, `< 300 ms`) deben verificarse mediante prototipo y pruebas empíricas.

#### D. Mejoras propuestas por investigación externa (`Plan.md`)
1. Sistema de tokens semánticos para la estética **Urbano Contemporáneo** con ajuste de luminosidad del amarillo entre modo oscuro (`#F5C542`) y modo claro (`#B8860B` / variante accesible) para cumplir WCAG 2.2 AA (`4.5:1` en texto normal y `3:1` en componentes no textuales).
2. Escala tipográfica basada en **Inter** (con soporte tabular para precios, fechas y estadísticas) y jerarquía de superficies por luminancia + borde sutil en lugar de sombras pesadas sobre fondo oscuro.
3. Reorganización de la navegación móvil priorizando la **zona del pulgar** (barra inferior visible de 3 a 5 destinos principales evaluando el patrón de selector de rol activo frente al de accesos compartidos permanentes, sin sacrificar nunca entradas, compras ni notificaciones).
4. Sustitución de selectores inline invasivos por hojas modales inferiores (*bottom sheets* en móvil / modales centrados en desktop) y selectores visuales de calendario y horario que oculten cualquier formato técnico.
5. Incorporación de un hook multiplataforma de preferencia de movimiento reducido (`AccessibilityInfo.isReduceMotionEnabled()` en nativo + `prefers-reduced-motion` en web).

---

## 3. ESTUDIO DE CAMPO Y VALIDACIÓN CON USUARIOS

Para fundamentar académicamente el rediseño sin inventar métricas ni asumir comportamientos no medidos, se establece un **enfoque metodológico progresivo** que distingue rigurosamente entre **Investigación Exploratoria**, **Pruebas de Usabilidad (Formativas)** y **Validación Cuantitativa**.

### 3.1. Objetivos de la investigación
1. **Exploratorio (Modelos mentales y contexto de uso):** Comprender cómo buscan shows los asistentes locales, cómo negocian fechas los artistas y espacios físicos en General Pueyrredón, y qué información prioriza un organizador o proveedor técnico al coordinar un evento.
2. **Evaluativo / Formativo de Usabilidad (Detección temprana de fricciones):** Observar empíricamente la ejecución de tareas concretas sobre los flujos de Venti para identificar bloqueos de navegación (especialmente en cuentas multi-rol), errores de interacción, dudas de vocabulario y problemas de comprensión de estados.

### 3.2. Enfoque progresivo de muestreo: Primera etapa de 5 participantes y criterio de ampliación
En lugar de iniciar con un reclutamiento masivo de 15 a 20 personas antes de iterar la interfaz, se establece un **muestreo progresivo por etapas**:

1. **Primera etapa (Estudio formativo inicial — 5 participantes totales):**
   - La primera ronda se ejecutará con una muestra inicial de **5 participantes en total**, seleccionados estratégicamente para cubrir distintos perfiles de usuario dentro de esa misma muestra (aprovechando que en el ecosistema musical local y académico varios actores cumplen más de un rol en la vida real):

| Participante | Perfiles de usuario cubiertos en la sesión | Perfil real a convocar en el entorno local/académico | Escenarios asignados (Sección 3.5) |
| :---: | :--- | :--- | :--- |
| **P1** | `COMPRADOR` (Asistente puro) | Estudiante universitario o asistente frecuente a recitales y centros culturales en Mar del Plata. | `T-COMP` |
| **P2** | `COMPRADOR` + `ARTISTA` (Cuenta multi-rol) | Músico independiente local o integrante de banda emergente que también asiste a shows de otras bandas. | `T-COMP`, `T-MULTI`, `T-ART` |
| **P3** | `ORGANIZADOR` + `COMPRADOR` (Cuenta multi-rol) | Productor independiente de ciclos musicales o gestor cultural con experiencia en armado de fechas. | `T-MULTI`, `T-ORG` |
| **P4** | `VENUE` (Espacio físico) + `EMPRESA_SERVICIOS` | Encargado de sala de ensayo / centro cultural o técnico de sonido e iluminación local. | `T-VEN`, `T-SRV` |
| **P5** | `ADMIN` + `concert_staff` (Moderación y Puerta QR) | Estudiante avanzado o perfil técnico del área de sistemas no involucrado en el desarrollo de Venti. | `T-ADM-STF`, `T-COMP` |

2. **Alcance epistemológico de la muestra inicial:**
   - **Cinco participantes NO constituyen una muestra estadísticamente representativa ni permiten inferencias poblacionales.** Su propósito metodológico es estrictamente **cualitativo y formativo**: detectar con rapidez los principales obstáculos de comprensión, navegación y carga de datos en la interfaz real (APK y Web) para corregirlos de inmediato.
3. **Criterio de ampliación progresiva (Segunda etapa condicional):**
   - La muestra se ampliará en rondas posteriores (incorporando entre 3 y 5 participantes adicionales focalizados en los perfiles específicos donde persistan dudas) **únicamente si** los resultados de los primeros 5 participantes evidencian:
     - Tasas de fallo o bloqueo no resueltas tras el primer ajuste de diseño (ej. confusión al alternar de rol en `T-MULTI` o al vincular una reserva en `T-ORG`).
     - Contradicciones fuertes entre participantes sobre la arquitectura de navegación multi-rol.
     - Baja cobertura empírica en alguno de los flujos específicos (ej. cotizaciones técnicas `T-SRV` o gestión de horarios de salas `T-VEN`).

### 3.3. Método de reclutamiento
- **Canal:** Convocatoria directa a través de la comunidad universitaria, salas de ensayo y centros culturales de Mar del Plata.
- **Condición ética:** Participación voluntaria con consentimiento informado para tomar notas y cronometrar tareas, aclarando que **se evalúa el sistema Venti y nunca la capacidad de la persona**, y que todas las transacciones monetarias son simuladas.

### 3.4. Diferenciación metodológica: Investigación Exploratoria, Pruebas de Usabilidad y Validación Cuantitativa

Para evitar confundir hallazgos cualitativos con conclusiones estadísticas, el plan diferencia explícitamente los tres niveles metodológicos:

| Dimensión | 1. Investigación Exploratoria | 2. Pruebas de Usabilidad (Formativas) | 3. Validación Cuantitativa (Benchmarking estadístico) |
| :--- | :--- | :--- | :--- |
| **Propósito principal** | Comprender el contexto, expectativas, vocabulario natural y modelo mental de los actores musicales locales antes de rediseñar. | Detectar problemas concretos de diseño, navegación e interacción mientras el usuario ejecuta tareas reales en el prototipo o aplicación. | Medir parámetros estadísticamente significativos con intervalos de confianza estrechos para comparar versiones a gran escala. |
| **Técnica empleada** | Entrevista semiestructurada breve (10–15 min al inicio de la sesión) con preguntas abiertas sobre hábitos reales. | Ejecución de escenarios guiados por tareas (30–40 min en APK Android y Web) bajo protocolo **Think-Aloud** y observación directa. | Pruebas estandarizadas no moderadas o instrumentación analítica sobre grandes volúmenes de sesiones reales. |
| **Tamaño de muestra** | **5 participantes iniciales** con perfiles diversos (ampliable si aparecen nuevos casos de uso). | **5 participantes totales en la Etapa 1 formativa**, ampliable iterativamente solo si los hallazgos muestran que es necesario. | Típicamente **>= 20 a 30+ usuarios por segmento homogéneo** (fuera del alcance de la primera etapa formativa de este proyecto académico). |
| **Datos que registra** | Prioridades de información en carteleras, criterios para contratar salas/artistas y dudas terminológicas. | **Tareas completadas/fallidas, tiempo empleado, errores cometidos, dudas verbales, dificultades de flujo y observaciones del moderador.** | Tasas porcentuales con margen de error, significancia estadística ($p$-valor) y métricas agregadas de conversión. |
| **Cómo se reporta en Venti** | Síntesis de hallazgos cualitativos y decisiones de jerarquía de contenido. | Frecuencias absolutas observadas (ej. *"4 de los 5 participantes encontraron sus entradas QR al primer intento"*) y lista priorizada de problemas. | **No se reportarán porcentajes extrapolados ni afirmaciones de representatividad estadística a partir de 5 participantes.** |

### 3.5. Tareas concretas para evaluar por perfil

1. **Escenario Comprador (`T-COMP`):**
   - *Tarea 1.1:* "Buscá un concierto de rock o indie en Mar del Plata para el próximo mes, entrá a ver sus detalles y decime dónde queda y cuánto cuesta la entrada general."
   - *Tarea 1.2:* "Seleccioná 2 entradas para ese concierto, completá la compra simulada y mostrame el código QR que presentarías en la puerta."
2. **Escenario Cuenta Multi-Rol: Comprador → Artista (`T-MULTI`):**
   - *Tarea 2.1:* "Con tu misma cuenta de comprador, activá tu perfil de Artista desde la aplicación, creá el perfil de tu banda y publicalo."
   - *Tarea 2.2:* "Ahora que sos Artista, volvé a buscar el código QR de la entrada que compraste recién." *(Evalúa directamente la resolución del problema de navegación multi-rol).*
3. **Escenario Artista (`T-ART`):**
   - *Tarea 3.1:* "Buscá un espacio físico disponible en Mar del Plata y enviale una solicitud formal para tocar en una fecha determinada indicando tu cachet estimado."
   - *Tarea 3.2:* "Revisá una propuesta recibida de un organizador y rechazala explicando el motivo."
4. **Escenario Espacio Físico (`T-VEN`):**
   - *Tarea 4.1:* "Configurá los horarios de apertura de tu sala para viernes y sábados y creá un bloqueo por mantenimiento para el próximo lunes."
   - *Tarea 4.2:* "Revisá una reserva temporal (`HOLD`) que ya tiene pago simulado aprobado y aceptala para confirmarla."
5. **Escenario Organizador (`T-ORG`):**
   - *Tarea 5.1:* "Consultá la disponibilidad de un espacio del marketplace para una fecha, realizá la reserva temporal y simulá su pago."
   - *Tarea 5.2:* "Creá un concierto en borrador, vinculale la reserva confirmada, agregá un tipo de entrada con su ventana de venta y publicá el concierto."
6. **Escenario Empresa de Servicios (`T-SRV`):**
   - *Tarea 6.1:* "Respondé un pedido de cotización de sonido e iluminación detallando dos ítems, un cargo adicional y la fecha de validez del presupuesto."
7. **Escenario Administrador y Staff de Puerta (`T-ADM-STF`):**
   - *Tarea 7.1 (Admin):* "Revisá un establecimiento pendiente de moderación (`PENDING_REVIEW`) y aprobalo; luego rechazá una solicitud de perfil indicando el motivo."
   - *Tarea 7.2 (Staff):* "Entrá al control de acceso del concierto asignado y validá una entrada mediante su código QR."

### 3.6. Indicadores y métricas a registrar (sin inventar datos)
En cada sesión de la muestra progresiva (comenzando con los 5 participantes iniciales) se registrarán sistemáticamente en una planilla estructurada seis dimensiones observables:
1. **Resultado de la tarea (`Tareas` — Binario / Parcial):**
   - `Éxito sin asistencia` (completado de forma autónoma).
   - `Éxito con asistencia` (requirió una pista del moderador tras más de 60 segundos de bloqueo).
   - `Fallo / Abandono` (no logró completar la tarea o dio por finalizada una acción incorrecta).
2. **Tiempo en tarea (`Tiempo` — segundos):** Medido con cronómetro desde que termina de leer la consigna hasta el estado final de confirmación.
3. **Errores de interacción (`Errores`):** Conteo y descripción de toques en elementos no interactivos, intentos fallidos de envío de formulario, selecciones equivocadas de fecha/horario o retrocesos de ruta erróneos.
4. **Dudas expresadas (`Dudas`):** Preguntas o vacilaciones verbalizadas durante el protocolo *Think-Aloud* (ej. no saber qué significa un estado o dónde encontrar las entradas compradas tras activar otro perfil).
5. **Dificultades operativas y de flujo (`Dificultades`):** Fricciones motoras o visuales observadas (intentos repetidos de tocar un control pequeño, desplazamiento excesivo en formularios largos o confusión al cambiar de contexto).
6. **Observaciones cualitativas y facilidad percibida (`Observaciones` + SEQ 1–5):** Notas contextuales del moderador por pantalla junto con la pregunta post-tarea (*"¿Qué tan fácil o difícil te resultó completar esta tarea?"*).

> **Regla metodológica estricta:** No se generarán mapas de calor ficticios ni porcentajes estadísticos extrapolados. En la primera etapa formativa de **5 participantes**, los resultados se documentarán exclusivamente como frecuencias absolutas observadas (ej. *"4 de 5 participantes completaron la tarea sin ayuda"*), tiempos individuales en segundos y registro textual de errores, dudas, dificultades y observaciones. Solo se ampliará la muestra si estos hallazgos iniciales revelan problemas pendientes de validación adicional.

### 3.7. Conversión de hallazgos en decisiones de diseño
Cada hallazgo observado en la planilla se clasificará según su severidad:
- **Severidad 3 (Bloqueante):** Impide terminar la tarea o induce pérdida de datos → Pasa a **Prioridad P0**.
- **Severidad 2 (Fricción mayor):** Provoca errores repetidos o demora excesiva (> 2x el camino óptimo) → Pasa a **Prioridad P1**.
- **Severidad 1 (Fricción menor / Cosmética):** Duda momentánea que el usuario resuelve solo → Pasa a **Prioridad P2 / P3**.

---

## 4. IDENTIDAD VISUAL "URBANO CONTEMPORÁNEO" Y SISTEMA DE DISEÑO

### 4.1. Filosofía visual y dirección estética
La identidad **Urbano Contemporáneo** reemplaza definitivamente al esquema azul/índigo (`Electric Stage Indigo` en `frontend/src/components/ui/palette.ts`). Su lenguaje visual se inspira en la **cartelería cultural nocturna, los pases de *backstage*, las consolas de iluminación escénica y la arquitectura industrial de los clubes de música en vivo**.

Para evitar caer en una interfaz plana de *"fondo negro puro con botones amarillos estridentes"*, el sistema se construye sobre cinco pilares:
1. **Profundidad por capas de carbón y piedra cálida:** Nunca se usa negro puro (`#000000`) como fondo base. En modo oscuro se emplean tonos carbón mineral y grafito (`#111113` → `#18181B` → `#202024` → `#27272C`), y en modo claro tonos papel editorial cálido y piedra (`#F6F5F0` → `#FFFFFF` → `#ECEAE2`), creando separación espacial mediante luminancia de superficie y bordes precisos de `1px`.
2. **Uso quirúrgico del Amarillo Energético (Acento Primario):** El amarillo actúa como un haz de luz escénica: se reserva **exclusivamente** para el botón de acción principal (CTA primario de la vista), el indicador de pestaña/ruta activa, el anillo de foco de teclado/accesibilidad y badges de destaque puntual. Nunca se usa para grandes bloques de fondo ni para múltiples botones secundarios simultáneos.
3. **El Rojo como señal de énfasis, alerta y urgencia:** El rojo escénico se utiliza para estados críticos, acciones destructivas (cancelar compra, rechazar propuesta, suspender cuenta, eliminar borrador), errores de validación y alertas de cupo/tiempo próximo a expirar (`HOLD`).
4. **Superficies neutras para legibilidad prolongada:** Los botones secundarios, filtros, chips inactivos y contenedores de lectura utilizan grises neutros cálidos y blancos rotos (`#F5F5F2` en oscuro, `#181816` en claro), permitiendo que las fotografías de los artistas, flyers de recitales y fotos de salas sean las verdaderas protagonistas cromáticas.
5. **Validación automática de contraste:** Todo token de la paleta debe superar la auditoría automatizada existente en `backend/scripts/a11y-audit.mjs` (que verifica programáticamente los ratios WCAG 2.2 AA `4.5:1` para texto normal y `3:1` para texto grande en modo oscuro y modo claro).

### 4.2. Paleta semántica completa (Modo Oscuro y Modo Claro)

Dado que el código actual de Venti (`frontend/src/components/ui/palette.ts` y `theme.ts`) expone las claves `bg`, `surface`, `surfaceAlt`, `featuredBg`, `featuredBorder`, `border`, `borderStrong`, `text`, `muted`, `accent`, `accentHover`, `accentText`, `accentSoft`, `accentBorder`, `primary`, `primaryHover`, `onPrimary`, `success`, `successSoft`, `successBorder`, `successText`, `warning`, `warningSoft`, `warningBorder`, `warningText`, `danger`, `dangerHover`, `onDanger`, `dangerSoft`, `dangerBorder`, `dangerText` y `focus`, la nueva paleta **Urbano Contemporáneo** mapea cada token semántico explicando su función y su ratio de contraste:

#### A. Modo Oscuro (`dark` — Experiencia predeterminada de música en vivo)

| Token en `palette.ts` | Rol semántico en el sistema | Código HEX propuesto | Función y reglas de uso en la interfaz | Contraste verificado |
| :--- | :--- | :--- | :--- | :--- |
| `bg` | `bg/canvas` | `#111113` | Lienzo general de la aplicación (`<Page>` y `<Shell>`). Carbón profundo, no negro puro. | Base de referencia |
| `surface` | `surface/card` | `#19191D` | Tarjetas estándar (`<Card>`), contenedores de listado y barra de navegación. | Separación por luminancia + borde `#2E2E34` |
| `surfaceAlt` | `surface/elevated-input` | `#222227` | Campos de entrada (`<Field>`), tarjetas sutiles (`variant="subtle"`), chips inactivos y encabezados de tabla. | Diferenciación clara dentro de `surface` |
| `featuredBg` | `surface/spotlight` | `#1E1C16` | Tarjetas destacadas (`variant="featured"`): grafito con un matiz cálido ámbar al 4 % que sugiere iluminación escénica sin cansar la vista. | Texto `#F5F5F2` sobre `#1E1C16` > `15:1` |
| `featuredBorder` | `border/spotlight` | `#5C4B1B` | Borde de tarjetas destacadas (`variant="featured"`): bronce/ámbar oscuro que enmarca sin competir con el CTA. | > `3:1` frente a `bg` |
| `border` | `border/subtle` | `#2E2E34` | Divisor estructural de `1px` en tarjetas, filas y secciones. | Sutil, estructural |
| `borderStrong` | `border/interactive` | `#46464F` | Borde de controles interactivos, botones secundarios y campos de texto sin foco. | > `3:1` sobre `#111113` (WCAG 1.4.11) |
| `text` | `text/primary` | `#F5F5F2` | Títulos, nombres de conciertos, precios y cuerpo de lectura principal (blanco hueso cálido). | `16.4:1` sobre `#111113` / `14.8:1` sobre `#19191D` |
| `muted` | `text/secondary` | `#A8A8A2` | Metadatos, fechas secundarias, subtítulos y etiquetas de ayuda (gris piedra claro). | `7.5:1` sobre `#19191D` y `6.6:1` sobre `#222227` (supera holgadamente `4.5:1`) |
| `primary` | `action/primary-bg` | `#F5C542` | **Amarillo energético:** Fondo exclusivo de botones primarios (`<Button />`), barra de progreso principal e indicador de pestaña activa. | `10.8:1` contra `onPrimary` (`#171305`) |
| `primaryHover` | `action/primary-pressed` | `#FFD45E` | Estado hover/pressed del botón primario (mayor luminosidad escénica). | `12.1:1` contra `#171305` |
| `onPrimary` | `action/primary-text` | `#171305` | Texto e ícono sobre botón primario amarillo. Carbón casi negro para legibilidad máxima (nunca texto blanco sobre amarillo). | `10.8:1` sobre `#F5C542` |
| `accent` | `accent/interactive` | `#F5C542` | Color de acento para íconos activos, barras de gráficos SVG y contadores sobre fondo oscuro. | `10.2:1` sobre `#19191D` |
| `accentHover` | `accent/interactive-hover` | `#FFE082` | Estado hover de enlaces o controles acentuados en oscuro. | `12.5:1` sobre `#19191D` |
| `accentText` | `accent/text-on-dark` | `#F7CE5B` | Texto acentuado sobre superficies oscuras (`surface`, `surfaceAlt`, `accentSoft`): amarillo oro luminoso para etiquetas `eyebrow`, precios destacados y badges. | `9.8:1` sobre `#2A2412` (`accentSoft`) |
| `accentSoft` | `accent/surface-tint` | `#2A2412` | Fondo de badges (`styles.badge`), pestaña seleccionada en barra lateral y avisos informativos. | Contraste con `accentText` `#F7CE5B`: `9.8:1` |
| `accentBorder` | `accent/border-tint` | `#6E581A` | Borde de badges y bloques informativos acentuados. | > `3:1` |
| `danger` | `emphasis/red-bg` | `#D9383A` | **Rojo de énfasis y alerta:** Fondo de botones destructivos primarios y alertas críticas. | `4.85:1` con texto blanco `#FFFFFF` |
| `dangerHover` | `emphasis/red-pressed` | `#B82B2D` | Estado presionado/hover del botón rojo destructivo. | `6.4:1` con `#FFFFFF` |
| `onDanger` | `emphasis/red-text-on-solid` | `#FFFFFF` | Texto sobre botón destructivo sólido. | `4.85:1` sobre `#D9383A` |
| `dangerSoft` | `emphasis/red-surface` | `#2D1618` | Fondo de alertas de error (`Notice` error), rechazos y botones destructivos secundarios. | Contraste con `dangerText` `#FCA5A5`: `7.9:1` |
| `dangerBorder` | `emphasis/red-border` | `#7F292D` | Borde de campos con error (`aria-invalid="true"`) y tarjetas de alerta roja. | > `3:1` |
| `dangerText` | `emphasis/red-text` | `#FCA5A5` | Mensajes de validación bajo los inputs, etiquetas de estado cancelado/rechazado y texto de botón `danger + secondary`. | `7.9:1` sobre `#2D1618` y `8.4:1` sobre `#19191D` |
| `warning` | `state/warning` | `#E09F24` | Indicador gráfico de reserva en espera (`HOLD`) o revisión pendiente. | > `6.5:1` sobre `#19191D` |
| `warningSoft` | `state/warning-surface` | `#2B2110` | Fondo de avisos de advertencia (`Notice tone="warning"`). | Contraste con `warningText`: `8.6:1` |
| `warningBorder` | `state/warning-border` | `#785719` | Borde de advertencias. | > `3:1` |
| `warningText` | `state/warning-text` | `#FCD34D` | Texto de advertencia sobre `warningSoft`. | `8.6:1` |
| `success` | `state/success` | `#3FB950` | Indicador de entrada válida (`VALID`), reserva confirmada o pago aprobado. | > `6.2:1` sobre `#19191D` |
| `successSoft` | `state/success-surface` | `#122919` | Fondo de confirmaciones exitosas. | Contraste con `successText`: `8.9:1` |
| `successBorder` | `state/success-border` | `#236331` | Borde de confirmaciones. | > `3:1` |
| `successText` | `state/success-text` | `#86EFAC` | Texto de confirmación sobre `successSoft`. | `8.9:1` |
| `focus` | `accessibility/focus-ring` | `#F5C542` | Anillo de foco visible (`2px solid`) en navegación por teclado y lectores de pantalla. | `10.2:1` sobre fondos oscuros |

#### B. Modo Claro (`light` — Adaptación diurna editorial de alto contraste)

En modo claro, usar amarillo brillante (`#F5C542`) para texto o bordes sobre fondo claro fallaría rotundamente el criterio WCAG 1.4.3 (dando apenas `1.5:1`). Sin embargo, **en botones primarios rellenos (`primary`), podemos conservar el amarillo energético urbano (`#F5C542`) con texto carbón oscuro (`#171305`, ratio `10.8:1`) y un borde sutil oscuro**, mientras que para textos acentuados (`accent` / `accentText`) sobre superficies blancas o crema utilizamos un **ocre/ámbar tostado oscuro (`#8A6100` / `#735000`)** que supera `5.5:1` sobre blanco y crema:

| Token en `palette.ts` | Rol semántico | Código HEX propuesto | Función y justificación de contraste | Contraste verificado |
| :--- | :--- | :--- | :--- | :--- |
| `bg` | `bg/canvas` | `#F6F5F0` | Papel urbano cálido (evita el encandilamiento del blanco puro en toda la pantalla). | Base de referencia |
| `surface` | `surface/card` | `#FFFFFF` | Tarjetas principales, barra superior/inferior y paneles limpios. | Máxima limpieza sobre `#F6F5F0` |
| `surfaceAlt` | `surface/elevated-input` | `#ECEAE3` | Inputs, tarjetas sutiles (`variant="subtle"`), chips inactivos y cabeceras secundarias. | Contraste nítido con `#FFFFFF` |
| `featuredBg` | `surface/spotlight` | `#FBF8EE` | Superficie destacada con sutil tinte cálido. | Texto `#161618` > `16:1` |
| `featuredBorder` | `border/spotlight` | `#D4B459` | Borde ámbar urbano para tarjetas destacadas (`variant="featured"`). | Distinguible sobre `#F6F5F0` |
| `border` | `border/subtle` | `#DDDAD0` | Separador de `1px` entre tarjetas y filas. | Estructural |
| `borderStrong` | `border/interactive` | `#76746D` | Borde de inputs y controles interactivos. | `4.5:1` sobre `#FFFFFF` |
| `text` | `text/primary` | `#161618` | Carbón profundo para títulos y lectura principal. | `17.9:1` sobre `#FFFFFF` / `16.4:1` sobre `#F6F5F0` |
| `muted` | `text/secondary` | `#575651` | Texto secundario, fechas y metadatos. | `7.3:1` sobre `#FFFFFF` y `6.1:1` sobre `#ECEAE3` (cumple AA en todas las superficies) |
| `primary` | `action/primary-bg` | `#F5C542` | Botón primario amarillo energético con texto carbón `#171305`. Mantiene la identidad de marca en ambos temas. | `10.8:1` entre fondo `#F5C542` y texto `#171305` |
| `primaryHover` | `action/primary-pressed` | `#E5B32E` | Estado hover/pressed del botón primario en modo claro. | `9.2:1` contra `#171305` |
| `onPrimary` | `action/primary-text` | `#171305` | Texto carbón sobre el botón amarillo primario. | `10.8:1` |
| `accent` | `accent/interactive` | `#855D00` | Ocre/ámbar oscuro para textos de acento, íconos e indicadores sobre fondos claros. | `5.8:1` sobre `#FFFFFF` / `4.9:1` sobre `#ECEAE3` |
| `accentHover` | `accent/interactive-hover` | `#694900` | Hover de enlaces y acentos en modo claro. | `7.7:1` sobre `#FFFFFF` |
| `accentText` | `accent/text-on-light` | `#6E4C00` | Texto de etiquetas `eyebrow`, badges y destaques sobre `accentSoft` (`#F9EFC7`) o `surface`. | `6.4:1` sobre `#F9EFC7` y `7.1:1` sobre `#FFFFFF` |
| `accentSoft` | `accent/surface-tint` | `#F9EFC7` | Fondo de badges, chips seleccionados y avisos en modo claro. | Contraste con `accentText` `#6E4C00`: `6.4:1` |
| `accentBorder` | `accent/border-tint` | `#D9B64E` | Borde de componentes `accentSoft`. | Estructural |
| `danger` | `emphasis/red-bg` | `#C8282B` | Rojo de énfasis/alerta para botones destructivos sólidos. | `5.8:1` con `#FFFFFF` |
| `dangerHover` | `emphasis/red-pressed` | `#A61F22` | Estado presionado de botón rojo. | `7.6:1` con `#FFFFFF` |
| `onDanger` | `emphasis/red-text-on-solid` | `#FFFFFF` | Texto blanco sobre botón rojo sólido. | `5.8:1` |
| `dangerSoft` | `emphasis/red-surface` | `#FEECEB` | Fondo de alertas de error y botones destructivos secundarios. | Contraste con `dangerText` `#9E1C20`: `7.4:1` |
| `dangerBorder` | `emphasis/red-border` | `#E58587` | Borde de error en inputs y alertas. | > `3:1` |
| `dangerText` | `emphasis/red-text` | `#9E1C20` | Texto de error bajo inputs y etiquetas de rechazo/cancelación. | `7.4:1` sobre `#FEECEB` y `8.2:1` sobre `#FFFFFF` |
| `warning` | `state/warning` | `#8A5800` | Estado de advertencia o espera (`HOLD`). | `6.0:1` sobre `#FFFFFF` |
| `warningSoft` | `state/warning-surface` | `#FEF3C7` | Fondo de avisos de advertencia. | Contraste con `warningText` `#784900`: `6.5:1` |
| `warningBorder` | `state/warning-border` | `#E5B84B` | Borde de advertencia. | Estructural |
| `warningText` | `state/warning-text` | `#784900` | Texto sobre `warningSoft`. | `6.5:1` |
| `success` | `state/success` | `#166534` | Estado confirmado / entrada válida (`VALID`). | `7.1:1` sobre `#FFFFFF` |
| `successSoft` | `state/success-surface` | `#DCFCE7` | Fondo de confirmaciones exitosas. | Contraste con `successText` `#14532D`: `7.8:1` |
| `successBorder` | `state/success-border` | `#74C68B` | Borde de confirmación. | Estructural |
| `successText` | `state/success-text` | `#14532D` | Texto sobre `successSoft`. | `7.8:1` |
| `focus` | `accessibility/focus-ring` | `#161618` | Anillo de foco en modo claro: carbón intenso de `2px` para contraste máximo (`16.4:1`) sobre fondos claros. | `16.4:1` |

> **Nota de validación previa a implementación:** Estos valores HEX están diseñados matemáticamente para superar los umbrales de `backend/scripts/a11y-audit.mjs`. Antes de dar por cerrada la Etapa 1, se verificará su renderizado real en la suite Playwright (`npm --prefix backend run test:a11y`) y en pantalla física Android (OLED e IPS) para confirmar que el amarillo `#F5C542` y el rojo `#D9383A` mantienen equilibrio visual sin saturación excesiva.

### 4.3. Tipografía y escala tipográfica
- **Familia tipográfica:** En Web (`webStyles.web.ts`), el proyecto ya define la pila `"Geist", "Inter", "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` con `font-feature-settings: "cv02", "cv03", "cv04", "cv11"`. Se consolidará **Inter** / **Geist** en Web y la tipografía nativa del sistema (`Roboto` en Android, `SF Pro` en iOS) con pesos semibold/bold (`600`–`800`) para titulares y `fontVariant: ["tabular-nums"]` para todos los precios, contadores de entradas, horarios y métricas estadísticas.
- **Escala tipográfica unificada (`frontend/src/components/ui/index.tsx`):**

| Token tipográfico | Tamaño (`px`) | Altura de línea (`px`) | Peso | Tracking (`letterSpacing`) | Uso específico en Venti |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `hero / title` | Móvil: `26` · Desktop: `34` | Móvil: `32` · Desktop: `40` | `800` | `-0.6` | Título principal de `<Page>` y nombre del concierto en `ConcertDetail`. |
| `section / heading` | `20` | `26` | `700` | `-0.3` | Encabezados de sección (`<SectionHeader>`) y títulos de tarjetas destacadas. |
| `card / subheading` | `17` | `23` | `700` | `-0.2` | Nombre del concierto, artista, sala o servicio dentro de cada tarjeta de listado. |
| `body` | `15` | `22` | `400` | `0` | Texto descriptivo, biografías, mensajes de propuestas y condiciones. |
| `body / strong` | `15` | `22` | `600` | `0` | Subtotales, nombres de contraparte, fechas principales y estados clave. |
| `small / metadata` | `13` | `19` | `500` | `0` | Metadatos secundarios (dirección, ciudad, referencias de operación `public_code`, timestamps). |
| `label / eyebrow` | `12` | `16` | `700` | `+0.8` (Mayúsculas) | Etiquetas superiores (`VENTI · PASES DIGITALES`), chips de estado y badges. **Nunca menor a 12 px.** |

### 4.4. Espaciados, radios, sombras y elevaciones
- **Sistema de espaciado (múltiplos de 4 px):**
  - `4 px`: separación entre etiqueta `eyebrow` y título.
  - `8 px`: separación entre metadatos dentro de una tarjeta y espacio entre chips (`gap: 8`).
  - `12 px`: espacio interno entre campos de un formulario compacto y `gap` de grillas en móvil.
  - `16 px`: padding lateral de pantalla en móvil (`paddingHorizontal: 16`) y padding interno de tarjetas estándar en móvil.
  - `20–24 px`: padding interno de tarjetas en tablet/desktop y separación entre secciones principales (`<Page>`).
  - `32–40 px`: márgenes laterales en desktop con contenedor máximo centrado de `1240 px`.
- **Radios de borde (`radius` en `ui/index.tsx`):**
  - `sm`: `10 px` (badges internos, bloques de código QR, cajas de metadatos).
  - `md`: `14 px` (campos `<Field>`, botones `<Button>`, selectores).
  - `lg`: `18 px` (tarjetas `<Card>`, portadas `<MusicalCover>`).
  - `xl`: `24 px` (hojas inferiores *bottom sheets* y tarjetas hero).
  - `pill`: `999 px` (indicadores circulares, filtros rápidos tipo chip).
- **Sombras y elevaciones:**
  - En **Modo Oscuro**, la elevación no depende de sombras negras (invisibles sobre `#111113`), sino de la progresión cromática de superficies (`#111113` → `#19191D` → `#222227`) combinada con bordes de `1px` (`#2E2E34` en reposo, `#5C4B1B` en tarjetas destacadas).
  - En **Modo Claro**, se mantiene una sombra difusa cálida (`0 8px 24px rgba(22, 22, 24, 0.06)`) acompañada del borde `#DDDAD0`.

### 4.5. Iconografía y tratamiento de fotografías / portadas musicales (`MusicalCover`)
- **Portadas vectoriales y fotográficas (`MusicalCover` en `frontend/src/components/ui/index.tsx` líneas 479–605):**
  - Actualmente, cuando una entidad no tiene foto o mientras carga, `MusicalCover` renderiza un arte vectorial SVG con gradientes índigo hardcodeados (`#1E1B4B`, `#4F46E5`, `#818CF8`) y un badge con fondo `#4F46E5E6`.
  - **Rediseño Urbano Contemporáneo de `MusicalCover`:**
    1. Reemplazar los gradientes índigo por una composición vectorial en **carbón grafito (`#141417` → `#232329`), trazos geométricos de ecualizador/ondas acústicas en gris acero (`#383842`), un haz diagonal cálido en amarillo ámbar (`#F5C542` al `18 %` de opacidad) y un acento puntual en rojo escénico (`#D9383A`)** según el tipo de entidad (`concert`, `artist`, `venue`, `service`).
    2. Cuando exista fotografía (`uri`), aplicar en la franja superior e inferior un gradiente de protección de lectura en carbón (`rgba(17, 17, 19, 0.78)`) para que los badges superiores sean siempre legibles independientemente de si la foto subida es blanca o negra.
    3. Corregir el contenedor de `badge` y `subBadge` (líneas 559–603): reemplazar el badge derechoindigo (`#4F46E5E6`) por superficie carbón translúcida (`rgba(25, 25, 29, 0.90)`) con borde `#5C4B1B` y texto `#F7CE5B`, incorporando `flexShrink: 1`, `maxWidth: "58%"` y `numberOfLines={1}` para impedir que textos largos de géneros o ciudades se superpongan con el badge izquierdo.

### 4.6. Componentes reutilizables y estados visuales
1. **Botones (`<Button />`):**
   - *Primario:* Fondo `#F5C542`, texto `#171305` en negrita (`700`), altura mínima `48 px` (cumple `48x48 dp` en Android y `44x44 pt` en iOS).
   - *Secundario (`secondary`):* Fondo `surfaceAlt` (`#222227` en oscuro / `#ECEAE3` en claro), borde `borderStrong`, texto `text`.
   - *Destructivo (`danger` primario):* Fondo rojo `#D9383A` (`#C8282B` en claro), texto `#FFFFFF`.
   - *Destructivo secundario (`danger + secondary`):* Fondo `dangerSoft`, borde `dangerBorder`, texto `dangerText`.
   - *Deshabilitado (`disabled`):* Opacidad controlada con texto legible y cursor `not-allowed` en web, sin ejecutar `onPress`.
2. **Selector de cantidad (`<QuantityStepper />` — nuevo componente base con primitivas nativas):**
   - Botones `-` y `+` de `44x44 px` con etiqueta central tabular (`0`, `1`, `2`...) y límite máximo vinculado a `max_per_purchase` y `stock_available`. Reemplaza el `TextInput` libre en `ConcertDetail.tsx`.
3. **Selector de catálogo en hoja modal (`<Select />` rediseñado):**
   - El botón disparador muestra siempre los **nombres legibles** de las opciones seleccionadas (ej. `Ciudad: Mar del Plata` o `Géneros: Rock, Indie (2)`), nunca los IDs crudos.
   - Al pulsarse, abre un `Modal` / *Bottom Sheet* nativo y accesible con buscador, lista desplazable independiente y botón `"Listo"`, evitando deformar la fila del formulario donde se ubica.
4. **Selector visual de calendario y horario (`<DateTimeField />`):**
   - **Prohibición de ingreso técnico manual:** Queda descartado pedir al usuario que escriba manualmente fechas en formato `AAAA-MM-DD` o cadenas técnicas ISO 8601 (`2027-06-10T23:00:00Z`). El formato técnico debe permanecer **completamente oculto para el usuario**.
   - **Calendario visual y selector de horario:** Al pulsar el campo, se despliega un **calendario visual interactivo** (grilla mensual navegable por mes y año dentro de un `Modal` / *Bottom Sheet* accesible construido con primitivas nativas de React Native, más atajos rápidos contextuales como *"Hoy"*, *"Mañana"*, *"Este fin de semana"*) y, cuando el campo requiera hora (inicio/fin de concierto, ventanas de venta de entradas, reservas o bloqueos de sala), un **selector visual de horario** (selección guiada de hora `00..23` y minutos `00, 15, 30, 45` o ajuste fino).
   - **Presentación localizada comprensible:** El botón del campo muestra siempre una representación amigable en español para Argentina (ej. `14/11/2026` en campos de solo fecha o `Sáb 14/11/2026 · 21:00 hs` en campos de fecha y hora).
   - **Conversión interna y manejo de zonas horarias (`UTC-3` ↔ `UTC`):** Internamente, el componente interpreta la selección del usuario en el huso horario del evento (`America/Argentina/Buenos_Aires`, `UTC-3`, reutilizando y extendiendo `frontend/src/features/marketplace/time.ts`) y la convierte de forma transparente al contrato exacto que espera cada endpoint del backend (`YYYY-MM-DD` para filtros de fecha / validez o `YYYY-MM-DDTHH:mm:ss.sssZ` en `UTC` para timestamps de conciertos, entradas y reservas). Al editar un registro existente, realiza la conversión inversa de `UTC` a `UTC-3` antes de mostrarlo en el calendario.
   - **Validaciones y mensajes de error comprensibles:** Valida rangos lógicos antes del envío y presenta mensajes en lenguaje llano (ej. *"Seleccioná una fecha en el calendario"*, *"La fecha y hora de finalización debe ser posterior al inicio del show"*, *"El cierre de venta no puede superar el horario de inicio del evento"*).

---

## 5. ARQUITECTURA UX Y NAVEGACIÓN

### 5.1. Evaluación de alternativas para el modelo multi-rol real de Venti (Sujeta a validación)

A diferencia de aplicaciones de un solo propósito, en Venti el modelo real de base de datos (`user_roles` y `role_permissions`) es **aditivo y multi-rol**: una misma cuenta puede poseer simultáneamente varios perfiles (por ejemplo, un usuario que es `COMPRADOR` y activa su perfil de `ARTISTA`, o un `ORGANIZADOR` / responsable de `VENUE` que también compra entradas para asistir a otro recital y recibe notificaciones transversales).

En consecuencia, la propuesta de navegación basada en `bottom tabs` y selector de rol activo **no se descarta, pero tampoco se asume como una decisión cerrada sin validación previa**. La solución definitiva deberá surgir del análisis riguroso de las alternativas arquitectónicas frente a cinco criterios obligatorios y, cuando corresponda, de la validación de un prototipo interactivo durante la primera etapa formativa de 5 usuarios (Escenario `T-MULTI`):

1. **Compatibilidad con el modelo real de roles y permisos:** Respetar el arreglo completo `auth.roles` y la matriz de permisos `auth.can(...)` sin reducir la sesión a un único `primaryRole` estático.
2. **Acceso permanente a funcionalidades compartidas:** Ningún cambio de rol o vista puede ocultar el acceso a la **cartelera pública (`/discover`, `/search`)**, **entradas y códigos QR (`/tickets`)**, **compras y reembolsos (`/purchases`)** ni **notificaciones (`/notifications`)**.
3. **Facilidad para cambiar de contexto:** Minimizar el costo cognitivo y de toques cuando un usuario pasa de gestionar su banda/espacio/show a consultar su propia entrada QR para ingresar a un evento.
4. **Adaptación nativa a Android, iOS y Web:** Respetar la zona del pulgar y áreas seguras (`SafeAreaView`) en móviles Android/iOS (máximo 5 destinos en barra inferior sin carrusel horizontal) y aprovechar el ancho disponible en Web de escritorio (`>= 1024 px`).
5. **Regla innegociable:** **Nunca sacrificar funcionalidades compartidas para simplificar la navegación.**

| Alternativa | Descripción arquitectónica | Ventajas | Riesgos / Aspectos a validar | Estado de la decisión |
| :--- | :--- | :--- | :--- | :--- |
| **Opción A: Mantener `primaryRole` fijo (Estado actual)** | El menú muestra únicamente las rutas del rol de mayor jerarquía (`ADMIN > ORGANIZADOR > VENUE > EMPRESA_SERVICIOS > ARTISTA > COMPRADOR`). | Sin cambios en `Shell.tsx`. | **Inviable:** Quien adquiere un segundo rol pierde acceso en el menú a `/tickets` y `/purchases`, y no puede usar sus otros perfiles. | **Descartada.** |
| **Opción B: Mostrar todas las pestañas de todos los roles juntas en la barra inferior** | Concatenar en una sola barra todos los enlaces de todos los roles activos del usuario. | Sin selector de contexto. | En cuentas con 2 o 3 roles acumula de 8 a 12 pestañas móviles, rompiendo la ergonomía táctil en `320px`–`390px`. | **Descartada para barra móvil.** |
| **Opción C (Candidata 1): Bottom Tabs contextuales + Selector de Rol Activo (`activeRole`) + Accesos compartidos fijos** | La sesión mantiene un `activeRole` conmutable desde un selector visible en la cabecera (`Contexto: [Rol] ▾`), que adapta los destinos operativos de la barra inferior móvil, **pero manteniendo siempre visibles o a un toque directo las funciones compartidas (`Alertas /notifications`, `Entradas QR /tickets` y `Compras /purchases`)** en la cabecera/barra sin obligar a cambiar primero al rol `COMPRADOR`. | Adapta las herramientas principales al trabajo que el usuario está haciendo en ese momento (ej. producir un show o administrar una sala) con hasta 5 pestañas limpias. | Requiere validar con usuarios reales si comprenden de inmediato el selector de contexto superior o si esperan ver sus herramientas de gestión dentro de una pestaña fija. | **Candidata sujeta a validación en prototipo.** |
| **Opción D (Candidata 2): Barra inferior fija con funciones nucleares compartidas + Hub / Panel Operativo multi-rol** | En móvil, las pestañas inferiores son constantes para toda cuenta autenticada (`1. Descubrir`, `2. Cartelera`, `3. Mis Entradas / Compras`, `4. Gestión / Panel Operativo`, `5. Alertas / Cuenta`), y la pestaña `Gestión` (o selector interno de panel) agrupa dinámicamente los módulos habilitados por `auth.roles` y `auth.can(...)` (`Artista`, `Organizador`, `Espacio`, `Servicios`, `Puerta QR`, `Admin`). En Web desktop, ambas zonas se despliegan en la navegación superior/lateral. | Garantiza que `Entradas QR`, `Compras`, `Descubrir` y `Alertas` jamás cambien de lugar en la barra inferior móvil, eliminando el riesgo de que un artista u organizador "pierda" sus entradas compradas. | En usuarios que solo entran a administrar (ej. `ADMIN` o encargado exclusivo de `VENUE`), añade un paso inicial o requiere recordar la última subvista abierta dentro de `Gestión`. | **Candidata sujeta a validación en prototipo.** |

### 5.2. Garantías de acceso multi-rol en Android, iOS y Web y organización de destinos

Independientemente de que la validación del prototipo incline la implementación final hacia la **Opción C**, la **Opción D** o una **combinación híbrida** (por ejemplo, conservar accesos fijos permanentes a `Entradas QR`, `Compras` y `Notificaciones` en toda sesión mientras el bloque operativo conmuta según el rol activo), la arquitectura de `Shell.tsx` deberá cumplir obligatoriamente las siguientes reglas en las tres plataformas:

1. **Permanencia garantizada de `tickets`, `purchases` y `notifications`:**
   - **Notificaciones (`/notifications`):** Accesible en **todo momento** para cualquier rol autenticado mediante el indicador de alertas con contador de no leídas (`unreadCount`) en la barra superior/inferior.
   - **Entradas QR (`/tickets`) y Compras (`/purchases`):** Accesibles en **todo momento** para cualquier usuario autenticado, sin importar si tiene activos los roles `ARTISTA`, `ORGANIZADOR`, `VENUE`, `EMPRESA_SERVICIOS` o `ADMIN` (tanto desde el acceso directo de entradas/billetera como desde `"Mi cuenta"` `/profile`).
   - **Exploración de eventos (`/discover` y `/search`):** Accesible para todos los perfiles (corrigiendo la omisión actual en `VENUE` y `EMPRESA_SERVICIOS`) y unificando `/discover` con `/recommendations` para eliminar la pestaña duplicada.
2. **Comportamiento diferenciado por plataforma:**
   - **Android (APK Nativo):** Barra inferior de máximo 5 destinos con áreas táctiles de `48×48 dp`, sin scroll horizontal, y soporte del botón físico *Back* para cerrar selectores de contexto o paneles secundarios.
   - **iOS (Nativo):** Barra inferior con respeto estricto de `SafeAreaView` (`useSafeAreaInsets().bottom`) sobre el *Home Indicator* y objetivos táctiles mínimos de `44×44 pt`.
   - **Web (Móvil, Tablet y Escritorio):** En viewports móviles (`< 720 px`) replica el patrón compacto de barra inferior; en tablet y escritorio (`>= 1024 px`) despliega la barra superior con acceso directo visible a las funciones compartidas (`Descubrir`, `Cartelera`, `Mis entradas`, `Mis compras`, `Notificaciones`, `Cuenta`) junto al bloque o selector de herramientas operativas del rol (`Artista`, `Organizador`, `Mi espacio`, `Servicios`, `Puerta QR`, `Admin`), operable 100 % con teclado (`Tab`, `Enter`, `Escape`).
3. **Mapa de módulos operativos por perfil (habilitados según `auth.roles` y `auth.can(...)`):**
   - **Visitante no autenticado:** `Descubrir` (`/discover`), `Cartelera` (`/search`), `Espacios` (`/marketplace`), `Servicios` (`/services`), `Ingresar` (`/login`).
   - **Funciones base compartidas por toda cuenta autenticada (`COMPRADOR` y todos los demás roles):** `Descubrir` (`/discover`), `Cartelera` (`/search`), `Mis entradas QR` (`/tickets`), `Mis compras` (`/purchases`), `Alertas` (`/notifications`) y `Cuenta y Perfiles` (`/profile`, `/profiles`).
   - **Módulos de `ARTISTA`:** `Mi panel artístico` (`/artists` — perfiles de banda, propuestas recibidas y postulación a espacios) y `Explorar espacios` (`/marketplace`).
   - **Módulos de `ORGANIZADOR`:** `Mis shows` (`/organizer` y `/organizer/statistics`), `Espacios y Reservas` (`/marketplace`, `/marketplace/quotes`, `/marketplace/reservations`), `Servicios y Cotizaciones` (`/services`, `/services/quotes`) y `Puerta QR` (`/staff`).
   - **Módulos de `VENUE` (Espacio Físico):** `Mi espacio` (`/marketplace/manage`), `Reservas` (`/marketplace/reservations`) y `Presupuestos` (`/marketplace/quotes`).
   - **Módulos de `EMPRESA_SERVICIOS`:** `Mis empresas` (`/services/mine`), `Cotizaciones` (`/services/quotes`) y `Catálogo` (`/services`).
   - **Módulos de `ADMIN`:** `Admin Hub` (`/admin`, `/admin/establishments`, `/admin/organizations`, `/admin/statistics`), `Usuarios y Solicitudes de Rol` (`/admin/users`), `Conciertos` (`/admin/concerts`) y `Auditoría` (`/admin/audit`).
   - **Asignación transversal de `concert_staff`:** Si una cuenta de cualquier rol posee `hasStaffAssignments === true` (`GET /staff/assignments?limit=1`), se habilita automáticamente el acceso a **Control de acceso QR** (`/staff`).

### 5.3. Organización de pantallas complejas y reducción de carga cognitiva
En las pantallas que hoy apilan múltiples formularios extensos en un solo scroll vertical, se aplicará **división por pestañas internas (Segmented Controls) y formularios colapsables paso a paso**:
- **`ConcertDetail.tsx` (Compra de entradas):**
  - **Estado 1 (Selección):** Mostrar portada, datos clave del show (fecha, hora, lugar, ciudad, artistas vinculados con enlace a `/artist/[id]`) y las tarjetas de tipos de entrada con el nuevo `<QuantityStepper />` (`- 0 +`) y el subtotal calculado en vivo.
  - **Estado 2 (Pago simulado):** El formulario de tarjeta simulada (`Número de tarjeta`, `MM/AA`, `CVV`) **solo se despliega cuando el usuario seleccionó al menos 1 entrada y presionó `"Continuar al pago"`** (o decide `"Reservar y pagar después"`), eliminando el ruido visual cuando el usuario solo está explorando el evento.
- **`ConcertEditor.tsx` (Producción de concierto):**
  - Organizar la vista de edición de un concierto existente en 3 pestañas internas claras:
    1. `1. Datos y Espacio` (Información general, fechas amigables, reserva confirmada de espacio y artistas del cartel).
    2. `2. Entradas y Precios` (`TicketEditor` y cupos).
    3. `3. Contrataciones y Staff` (`OrganizerArtistHiringPanel` y `StaffPanel`).
- **`ManageScreen.tsx` (Panel de Espacio Físico):**
  - Mantener la selección de establecimiento como contexto principal y presentar sus subsecciones (`Salas y capacidades`, `Horarios y bloqueos`, `Artistas y organizadores`, `Contratar artista`, `Datos del establecimiento`) como pestañas bien diferenciadas en lugar de botones que mezclan formularios largos con tarjetas superpuestas.

---

## 6. RESPONSIVE Y ADAPTABILIDAD MULTIPLATAFORMA

### 6.1. Diferenciación técnica obligatoria: Android vs. iOS vs. Web

React Native compila a vistas nativas gobernadas por **Yoga** en Android e iOS, mientras que en Web (`react-native-web`) traduce a nodos DOM con **CSS Flexbox**. Como demostró la prueba física del APK en contraste con el test web `ui-e2e.mjs`, **un estilo que no falla en Chromium puede superponerse en Android**. Por ello se establecen criterios específicos por plataforma:

| Aspecto técnico | Android (APK Nativo) | iOS (Nativo) | Web (Móvil, Tablet y Escritorio) |
| :--- | :--- | :--- | :--- |
| **Motor de Layout (`BentoGrid` + `Card`)** | Yoga en Android calcula erróneamente `height: "100%"` en hijos de un contenedor `flexDirection: "row", flexWrap: "wrap"` cuando `flexBasis` es `"100%"`, haciendo que el contenido desborde y pise la fila inferior. **Regla:** Prohibido usar `height: "100%"` en tarjetas móviles; en `mobile` (`width < 720`) `BentoGrid` debe operar en `flexDirection: "column"` o sin altura porcentual forzada. | Yoga en iOS requiere `SafeAreaView` inferior (`useSafeAreaInsets().bottom`) para que la barra de pestañas no colisione con el *Home Indicator*, y `KeyboardAvoidingView` (`behavior="padding"`) en formularios extensos. | CSS Flexbox soporta estiramiento automático de tarjetas hermanas en filas multi-columna (`alignItems: "stretch"` con `flex: 1` en el contenedor de la celda, nunca `height: "100%"` fijo con hermanos externos debajo). |
| **Áreas táctiles mínimas** | Mínimo **48×48 dp** (Material Design) y uso de `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}` en controles compactos. | Mínimo **44×44 pt** (Apple HIG). | Mínimo **40–48 px** con estados `:hover` y `:focus-visible` (`webStyles.web.ts`). |
| **Teclado y entradas** | `keyboardType="number-pad"` / `"decimal-pad"` / `"email-address"` y manejo de botón físico *Back* de Android para cerrar modales (`onRequestClose` obligatorio en `<Modal>`). | Cierre de teclado numérico al tocar fuera (`keyboardShouldPersistTaps="handled"` en `ScrollView`). | Soporte completo de navegación por teclado (`Tab`, `Shift+Tab`, `Enter`, `Escape` para cerrar selectores/modales), auditado por `a11y-audit.mjs`. |
| **Cámara y escaneo QR (`StaffScreen.tsx`)** | `CameraView` (`expo-camera`) con solicitud explícita de permisos de cámara en Android (`useCameraPermissions`). | `CameraView` con permisos de `NSCameraUsageDescription`. | Fallback automático a ingreso manual o lector QR USB HID (`Platform.OS === "web"` ya contemplado en `StaffScreen.tsx` línea 247). |

### 6.2. Diagnóstico y solución definitiva a la superposición de tarjetas en móviles

Se documentan las tres causas exactas confirmadas en la auditoría de código y la solución técnica que se aplicará en la Etapa 1:

1. **Superposición entre tarjetas de listado en `BentoGrid` (`ConcertList.tsx`, `StatTile`, `PurchasesScreen.tsx`, `ArtistsScreen.tsx`, `MarketplaceScreen.tsx`, `QuotesScreen.tsx`, `ReservationsScreen.tsx`, `ServicesScreen.tsx`, `ServiceQuotesScreen.tsx`, `StaffScreen.tsx`):**
   - *Causa:* `<Card style={{ height: "100%", justifyContent: "space-between" }}>` dentro de celdas con `flexBasis: mobile ? "100%" : 320` en un contenedor `flexDirection: "row", flexWrap: "wrap"`.
   - *Solución:* En `BentoGrid` (`frontend/src/components/ui/index.tsx` línea 231), cuando `mobile` sea `true` (`width < 720`), usar `flexDirection: "column"` con `alignItems: "stretch"`, y en `Card` eliminar `height: "100%"` en móvil (o reemplazarlo por `flexGrow: 1` únicamente cuando la celda no tenga botones hermanos fuera de la tarjeta).
2. **Superposición crítica de `VenueCard` y `OfferingCard` sobre sus propios botones de edición/publicación en `ManageScreen.tsx` (líneas 672–678) y `ProvidersScreen.tsx` (líneas 329–341):**
   - *Causa:* En ambos archivos, dentro de un mismo `<View style={{ gap: 8 }}>` se renderiza `<VenueCard />` (o `<OfferingCard />`), el cual tiene internamente `height: "100%"`, seguido inmediatamente por un `<View style={styles.row}>` con los botones `"Editar"` y `"Publicar/Archivar"`. Al reclamar el `100%` de la altura del padre, la tarjeta empuja o se superpone sobre la fila de botones inferior.
   - *Solución:* Pasar las acciones de gestión como prop opcional `footerActions` dentro de `VenueCard` y `OfferingCard` (para que vivan dentro del flujo interno del `<Card>`), y retirar `height: "100%"`.
3. **Superposición de badges en `MusicalCover` (`frontend/src/components/ui/index.tsx` líneas 559–603):**
   - *Causa:* `badge` y `subBadge` en `position: "absolute"` comparten una fila sin `flexShrink: 1` ni límite de líneas. Cuando `ConcertDetail.tsx` pasa múltiples géneros concatenados en `subBadge`, ambos badges se pisan en pantallas de `360 px`–`390 px`.
   - *Solución:* Aplicar `flexShrink: 1` y `numberOfLines={1}` en los `<Text>` de ambos badges y limitar `subBadge` a un máximo de 2 géneros visibles (`+N`) o truncamiento con elipsis.

### 6.3. Resoluciones representativas de prueba (Content-Driven)
Sin atar el diseño a dispositivos fijos, toda pantalla se validará en cinco anchos de referencia:
- **`320 px × 640 px` (Móvil compacto / Android pequeño):** 1 columna estricta, sin scroll horizontal, botones de acción apilados si superan el ancho, barra inferior compacta.
- **`360 px × 800 px` y `390 px × 844 px` (Estándar Android e iOS):** 1 columna para tarjetas de conciertos/espacios/servicios; 2 columnas solo para mosaicos numéricos cortos (`StatTile`).
- **`768 px × 1024 px` (Tablet Portrait):** Grilla `BentoGrid` de 2 columnas (`cols = 2` en `useBento`), formularios con campos cortos en pares (`flex: 1, minWidth: 220`).
- **`1024 px × 768 px` (Tablet Landscape / Laptop compacta):** Navegación superior completa, grillas de 2 a 3 columnas y vista de edición en 2 paneles (`BentoGrid` con columna principal `flexGrow: 2` y panel lateral `flexGrow: 1`).
- **`1440 px × 1000 px` (Escritorio amplio):** Contenedor central limitado a `maxWidth: 1240 px` con márgenes laterales amplios y grillas de 3 columnas (`cols = 3`).

---

## 7. RENDIMIENTO

### 7.1. Principio rector obligatorio: medir primero, optimizar solo cuellos de botella comprobados y volver a medir
Ninguna optimización de rendimiento (`React.memo`, memoización con `useMemo`/`useCallback`, caché en memoria, `debounce`, cambios de paginación, `FlashList`, optimización/compresión adicional de imágenes, CDN o servicios externos) se incorporará simplemente porque se considere una "buena práctica" teórica.

Toda intervención vinculada al rendimiento deberá seguir estrictamente este **protocolo de ingeniería en cinco pasos**:
1. **Medir primero el rendimiento actual (Línea base):** Registrar métricas reales sobre el código sin modificar en Web y en APK Android.
2. **Identificar el cuello de botella real:** Localizar con evidencia (React Profiler, pestaña Network o Performance Monitor de Expo) qué componente, consulta o flujo produce una degradación observable.
3. **Aplicar únicamente la optimización que resuelva un problema comprobado:** Intervenir de manera quirúrgica solo en el punto donde se demostró el cuello de botella.
4. **Volver a medir y comparar resultados:** Repetir exactamente la misma medición y verificar cuantitativamente la mejora frente a la línea base; si un cambio (ej. un `React.memo`) no aporta mejora medible, se descarta.
5. **Evitar agregar complejidad o infraestructura innecesaria:** Queda descartado introducir `FlashList`, `expo-image`, `Redis`, `CDN`, servicios externos o paginación por cursor (`keyset`) mientras la paginación actual de 12–20 registros (`<Pager />`) y los índices MySQL respondan dentro de las metas de validación.

### 7.2. Protocolo reproducible de medición y objetivos orientativos
Antes de aplicar cualquier ajuste, se tomará la línea base reproducible en dos entornos:
1. **Entorno Web (Chromium / Playwright Performance API):**
   - Tiempo hasta primer renderizado con datos (*Time to Useful Content*) en `/discover`, `/search`, `/marketplace` y `/organizer/statistics`.
   - Conteo de peticiones HTTP disparadas al montar cada pantalla y al escribir una búsqueda de 8 caracteres (para medir peticiones redundantes en `useResource`).
2. **Entorno Nativo Android (APK en dispositivo físico con Performance Monitor de Expo / React DevTools Profiler):**
   - **FPS en hilo de UI y en hilo de JS** durante el scroll vertical completo de `/search` (12 tarjetas con portadas SVG/imágenes) y `/discover`.
   - Cantidad de re-renderizados y duración de commit (`ms`) al escribir en filtros de `ConcertList.tsx` o editar entradas en `ConcertEditor.tsx`.
   - Tiempo de respuesta táctil al cambiar de pestaña en `Shell.tsx` y al abrir/cerrar un selector `<Select />`.

**Protocolo de medición reproducible (Condiciones de control):**
- **Dispositivo y sistema operativo:** Registrar modelo exacto de teléfono Android físico, versión de Android, RAM y resolución (y en Web, versión de sistema operativo y navegador Chromium).
- **Versión de la aplicación y entorno de ejecución:** Indicar hash de commit, versión de Expo (`~57.0.0`) / React Native (`0.86.3`) y modo de compilación (evaluando fluidez real sobre build de previsualización/release y no únicamente en bundle de desarrollo con debugging activo).
- **Condiciones de conexión:** Especificar el perfil de red empleado en cada corrida (Wi-Fi local estable o emulación controlada de 4G con latencia fija contra la instancia MySQL/Aiven).
- **Caché fría vs. caché caliente:** Diferenciar explícitamente la primera carga tras abrir la sesión (*caché fría*, sin catálogos ni imágenes en memoria) de las navegaciones subsiguientes dentro de la misma sesión (*caché caliente*).
- **Repeticiones por escenario:** Ejecutar un mínimo de **5 repeticiones consecutivas** por cada tarea medida bajo idénticas condiciones antes y después del cambio.
- **Criterio de comparación (Mediana y p75):** Comparar los resultados antes/después utilizando la **mediana (p50)** y el **percentil 75 (p75)** de las repeticiones para evitar distorsiones por valores atípicos (*outliers*).

**Objetivos orientativos de referencia (metas de validación, NO requisitos absolutos ni resultados garantizados):**
- Feedback visual al presionar un botón (`Pressable`): objetivo orientativo `< 100 ms`.
- Cambio entre pestañas principales ya montadas: objetivo orientativo `< 250 ms`.
- Apertura de pantalla de detalle con estado de carga / esqueleto visible: objetivo orientativo `< 300 ms`.
- Estabilidad visual de layout (`CLS = 0`): reserva de altura fija en todas las portadas `<MusicalCover height={...} />` antes de que cargue la imagen remota.

### 7.3. Hipótesis de cuellos de botella en el código actual, validación previa y política de invalidación de caché
La inspección estática del código identificó cuatro puntos específicos donde se aplicará el ciclo **Medir → Aplicar si se comprueba → Volver a medir**:

1. **Ráfaga de peticiones HTTP por tecla en buscadores conectados a `useResource` (`Debounce`):**
   - *Hallazgo en código:* En `ArtistsScreen.tsx` (líneas 293 y 528), `ConcertEditor.tsx` (líneas 52 y 385), `Select.tsx` (línea 29) y `AdminScreen.tsx` (línea 49), la URL de `useResource` depende directamente del texto del input (`onChangeText`), disparando una petición HTTP + consulta SQL en cada pulsación.
   - *Medición previa y criterio de aplicación:* Medir el número de requests disparados al escribir un término de búsqueda; aplicar `useDebouncedValue(search, 300)` (en TypeScript puro, sin dependencias) únicamente en esos buscadores en vivo y comprobar que las llamadas por palabra caen de $N$ letras a `1` petición tras `300 ms` de pausa.
2. **Destrucción y recreación de subárboles por `JSON.stringify` en `key` (`ConcertEditor.tsx` línea 362):**
   - *Hallazgo en código:* La lista de tipos de entrada usa `key={`${type.id}-${JSON.stringify(type)}`}`, forzando el desmontaje completo del componente en cada actualización.
   - *Medición previa y criterio de aplicación:* Verificar con React DevTools el remount de `TicketEditor`, reemplazar por `key={type.id}` con sincronización vía `useEffect([ticket])` y comprobar la conservación del foco y reducción del tiempo de commit.
3. **Re-renderizado de tarjetas con gráficos SVG (`ConcertCard`, `VenueCard`, `OfferingCard`, `ProviderCard`, `MusicalCover`):**
   - *Hallazgo en código:* Cada tarjeta construye múltiples nodos `<Svg>`, `<Defs>` y `<LinearGradient>` (`ui/index.tsx` líneas 479–554).
   - *Medición previa y criterio de aplicación:* Medir con el Profiler de React el tiempo de render de `ConcertList.tsx` al escribir en los filtros. Aplicar `React.memo` **únicamente si** el perfilado confirma que las 12 tarjetas se re-renderizan innecesariamente durante la edición de filtros, y medir el tiempo de commit posterior.
4. **Caché en memoria para catálogos de lectura frecuente y su estrategia obligatoria de invalidación:**
   - *Hallazgo en código:* Al abrir formularios con múltiples selectores (`<Select path="/cities" />`, `<Select path="/genres" />`, `/marketplace/catalogs`, `/services/categories`), se consulta repetidamente el mismo catálogo estático.
   - *Alcance estricto:* Si la medición de red confirma peticiones repetidas en una misma vista, se habilitará una caché en memoria de sesión **exclusivamente para endpoints de catálogos maestros**. **Queda terminantemente prohibido cachear endpoints transaccionales o dinámicos** (conciertos, disponibilidad de salas, reservas `HOLD`, compras, entradas QR, propuestas, presupuestos o notificaciones).
   - **Política explícita de invalidación de caché (prevención de datos obsoletos):**
     1. **Invalidación inmediata por mutación administrativa:** Cuando un `ADMIN` cree, edite o desactive un género, provincia, distrito o ciudad en `AdminScreen.tsx` (`POST`, `PATCH` o `DELETE` sobre `/genres`, `/provinces`, `/districts`, `/cities`), se invocará inmediatamente `invalidateResourceCache()` para purgar las entradas de catálogo en memoria antes de recargar la vista.
     2. **Invalidación por cambio de sesión o rol:** Al ejecutar `logout()`, cambiar de cuenta o recargar permisos en `AuthContext`, se vaciará por completo el mapa de caché en memoria.
     3. **Bypass explícito en recarga manual:** Toda llamada explícita a `resource.reload()` realizada por el usuario ignorará la caché (`forceRefresh: true`) y consultará directamente al backend.
     4. **Expiración pasiva acotada (TTL):** Cada entrada de catálogo tendrá un tiempo de vida máximo corto (`TTL = 5 minutos`) tras el cual se descarta automáticamente.

---

## 8. ANIMACIONES Y MICROINTERACCIONES

### 8.1. Criterio de valor: dónde animar y dónde evitar animaciones
Una microinteracción en Venti solo se incluye si cumple una función cognitiva concreta: **confirmar que una acción fue registrada, orientar espacialmente al usuario o suavizar una espera de red**. Se descartan efectos decorativos (parallax, rebotes exagerados, entradas escalonadas lentas en cada scroll) que degradan los FPS en dispositivos Android de gama media.

### 8.2. Diferenciación de implementación: Web vs. Nativo (Android / iOS) sin agregar dependencias pesadas
En lugar de incorporar `react-native-reanimated` (que añade peso nativo y requiere recompilación del binario de Expo), Venti cuenta ya con:
- **En Web (`frontend/src/components/layout/webStyles.web.ts`):** Transiciones CSS nativas aceleradas por GPU (`transform`, `opacity`, `box-shadow`, `background-color`) y la regla `@media (prefers-reduced-motion: reduce)` ya instalada en las líneas 53–60 de `webStyles.web.ts`.
- **En Android e iOS (`react-native` core):** La API nativa `Animated` (con `useNativeDriver: true` para `opacity` y `transform`) y `AccessibilityInfo.isReduceMotionEnabled()` provistos directamente por `react-native`.

### 8.3. Catálogo de microinteracciones aprobadas

| Interacción | Función en la experiencia | Implementación en Web | Implementación en Android / iOS | Comportamiento con Movimiento Reducido (`reduceMotion = true`) |
| :--- | :--- | :--- | :--- | :--- |
| **1. Feedback táctil en botones (`<Button />`)** | Confirmar contacto físico inmediato (`< 100 ms`). | Cambio de color (`primaryHover`) y `transform: scale(0.985)` en `:active`. | `Pressable` con cambio de color de superficie y escala `0.985` en `pressed` (ya presente en `ui/index.tsx` línea 720). | Solo cambio de color (`primaryHover`), sin `transform: scale`. |
| **2. Skeleton de carga inicial (`<ResourceState />`)** | Comunicar estructura de tarjetas mientras responde la API (`> 250 ms`). | Pulso suave de opacidad (`0.55` ↔ `0.9`) en bloques con forma de tarjeta. | `Animated.loop` sobre `opacity` con `useNativeDriver: true`. | Bloques estáticos con opacidad fija (`0.75`), sin pulso animado. |
| **3. Apertura de hoja inferior (`<Select />` / Modales)** | Explicar el origen espacial del selector sobre la pantalla actual. | Fade + traslación vertical corta (`160 ms ease-out`). | `<Modal animationType="slide">` (móvil) o `"fade"`. | `animationType="none"` (apertura instantánea). |
| **4. Cambio de cantidad de entradas (`<QuantityStepper />`)** | Confirmar actualización del subtotal de compra. | Transición suave de borde en tarjeta seleccionada (`accentBorder`). | Destello breve de borde en color `accent` (`150 ms`). | Cambio de estado instantáneo sin transición. |
| **5. Error de validación en formulario (`<FormScope />`)** | Dirigir la atención al primer campo inválido (`aria-invalid="true"`). | Borde rojo (`dangerBorder`) + foco automático en el campo. | Borde rojo + scroll suave al campo con error. | Scroll instantáneo (`animated: false`) + borde rojo. |
| **6. Botón `"Volver arriba"` (`<Page />`)** | Retorno rápido al encabezado tras hacer scroll largo (`> 350 px`). | `scrollTo({ y: 0, animated: !reducedMotion })` (ya verificado en `ui-e2e.mjs` líneas 108–130). | `scrollTo({ y: 0, animated: !reducedMotion })` + traslado de foco al título. | `animated: false` (salto inmediato al tope). |

---

## 9. PERFECCIONAMIENTO FUNCIONAL DETALLADO

A continuación se especifica la resolución técnica de cada problema funcional detectado en `DIAGNOSTICO_FUNCIONAL_VENTI.md`, respetando íntegramente las reglas de negocio y contratos del backend.

### 9.1. Autogestión y solicitud de perfiles de usuario (`PF-01`)
- **Problema:** `ProfilesScreen.tsx` (`/profiles`) consulta `GET /me/profiles`, pero ignora las listas `self_service`, `requestable` y `requests` devueltas por el backend. No existen botones para activar roles de autogestión (`POST /me/profiles`, ej. `ARTISTA`) ni para enviar solicitudes de perfiles sujetos a moderación (`POST /me/profile-requests`, ej. `ORGANIZADOR`, `VENUE`, `EMPRESA_SERVICIOS`), y `ProfileScreen.tsx` no tiene enlace hacia `/profiles`.
- **Causa identificada (Verificada en código):** Implementación trunca de `frontend/src/features/auth/ProfilesScreen.tsx` (líneas 24–61), que solo renderiza una tarjeta informativa del `primaryRole` actual.
- **Solución propuesta:**
  1. En `ProfileScreen.tsx`, agregar una tarjeta destacada `"Mis perfiles y permisos"` que muestre todos los roles activos del usuario (`auth.roles.map(r => ROLE_LABELS[r])`), el selector de contexto activo (si tiene más de un rol) y un botón `"Gestionar o solicitar perfiles"` que navegue a `/profiles`.
  2. En `ProfilesScreen.tsx`, renderizar tres secciones conectadas a los endpoints reales ya existentes en `admin.repository.ts`:
     - **Perfiles activos (`active`):** Listado de roles que la cuenta ya posee, con botón `"Usar este perfil ahora"` para cambiar el contexto de navegación.
     - **Activación inmediata (`self_service`):** Para cada rol disponible en `self_service` (como `ARTISTA`), botón `"Activar perfil de [Rol]"` que invoque `POST /me/profiles` con `{ role }`, seguido de `await auth.reload()` y `await resource.reload()`.
     - **Perfiles con aprobación de administración (`requestable` y `requests`):** Formulario con campo opcional `"Motivo o descripción de tu actividad"` y botón `"Solicitar perfil de [Rol]"` que invoque `POST /me/profile-requests` con `{ role, reason }`, más el historial de solicitudes (`PENDING`, `APPROVED`, `REJECTED` con su motivo de revisión).
- **Archivos involucrados:** `frontend/src/features/auth/ProfilesScreen.tsx`, `frontend/src/features/auth/ProfileScreen.tsx`.
- **Dependencias:** Ninguna externa; el backend (`GET/POST /me/profiles`, `POST /me/profile-requests`) ya está implementado y probado.
- **Riesgos:** Si el usuario es invitado (`user.is_guest === true`), el backend rechaza la activación/solicitud de perfiles; la UI debe mostrar un aviso claro invitando a completar el registro con email antes de solicitar roles.
- **Criterios de aceptación:** Un usuario registrado con rol `COMPRADOR` puede entrar a `/profile` → `/profiles`, activar `ARTISTA` (`POST /me/profiles`) o solicitar `ORGANIZADOR` (`POST /me/profile-requests`), ver su solicitud en estado `Pendiente`, y el administrador la ve aparecer en `ProfileRequestsPanel` (`/admin/users`).
- **Cómo probarlo:** Prueba E2E automatizada y prueba manual en APK creando una cuenta nueva, solicitando un perfil y aprobándolo desde una cuenta `ADMIN`.

### 9.2. Navegación multi-rol y preservación permanente de funciones compartidas (`PF-02`)
- **Problema:** `Shell.tsx` determina el menú exclusivamente con `primaryRole(auth.roles)`. Al adquirir cualquier rol superior a `COMPRADOR`, el usuario pierde los accesos a `"Mis entradas"` (`/tickets`) y `"Mis compras"` (`/purchases`); los roles `VENUE` y `EMPRESA_SERVICIOS` pierden `"Descubrir"` (`/discover`); y para `COMPRADOR` aparecen duplicados `/discover` y `/recommendations`. Además, en `UsersScreen.tsx` (línea 227), el administrador sobrescribe todos los roles al enviar `{ replace: true }`.
- **Causa identificada (Verificada en código):** `frontend/src/components/layout/Shell.tsx` (líneas 116–190), `frontend/app/(app)/(tabs)/recommendations.tsx` (línea 1) y `frontend/src/features/admin/UsersScreen.tsx` (línea 227).
- **Solución propuesta (Sujeta a validación de prototipo entre Opción C y Opción D de la Sección 5.1):**
  1. Incorporar en `AuthContext.tsx` el soporte de contexto multi-rol (`activeRole: Role`, inicializado en `primaryRole(roles)` y validado contra `auth.roles`) y evaluar en el prototipo de la Etapa 2 las dos arquitecturas candidatas de `Shell.tsx`:
     - **Opción C:** Barra inferior adaptada al `activeRole` con selector de contexto visible en cabecera + accesos permanentes garantizados a las funciones compartidas.
     - **Opción D:** Barra inferior fija con las funciones compartidas nucleares (`Descubrir`, `Cartelera`, `Entradas / Compras`, `Alertas`, `Cuenta`) + acceso al Hub / Panel Operativo según los permisos reales (`auth.can(...)`).
  2. **Regla obligatoria en ambas variantes (Android, iOS y Web):** Jamás sacrificar funcionalidades compartidas para simplificar la navegación. Toda cuenta autenticada debe mantener accesibles en todo momento `"Mis entradas y QR"` (`/tickets`), `"Mis compras"` (`/purchases`), `"Alertas / Notificaciones"` (`/notifications`) y `"Explorar cartelera"` (`/discover` y `/search`), independientemente de los roles que posea o del contexto activo.
  3. Eliminar de `linksForRole` en `Shell.tsx` el enlace redundante `/recommendations` (manteniendo el archivo de ruta por retrocompatibilidad de URLs, pero unificando el acceso en `/discover`).
  4. **Gestión aditiva de roles en Administración (`UsersScreen.tsx` `/admin/users/[id]`) con protecciones obligatorias de seguridad e integridad:**
     - Permitir al administrador agregar o quitar roles individualmente (`POST /admin/users/:id/roles` sin `replace: true` y `DELETE /admin/users/:id/roles/:role`, mostrando todos los roles activos de la cuenta y no solo `primaryRole`), respetando estrictamente las siguientes protecciones:
       1. **Protección del último administrador activo:** Prohibir eliminar el rol `ADMIN` si la cuenta afectada es el último administrador activo del sistema.
       2. **Prevención de auto-desadministración crítica:** Impedir que un administrador elimine su propio rol `ADMIN` cuando ello deje al sistema sin administradores activos.
       3. **Garantía de rol válido habilitante:** No permitir que una cuenta quede con cero roles activos (`user_roles` vacío); toda cuenta debe conservar al menos un rol válido habilitante (ej. `COMPRADOR`).
       4. **Validación en el backend y registro de auditoría:** La verificación de permisos, pertenencia de roles y reglas de protección reside obligatoriamente en el backend (`admin.repository.ts`), registrando cada alta o baja de rol en `audit_logs`.
       5. **Manejo explícito en la interfaz:** La UI deshabilitará preventivamente las acciones no permitidas (ej. quitar el único rol de una cuenta o auto-quitarse el último `ADMIN`) y mostrará mensajes de error claros (`ActionFeedback` / `Notice`) cuando el backend rechace una operación restringida.
- **Archivos involucrados:** `frontend/src/contexts/AuthContext.tsx`, `frontend/src/components/layout/Shell.tsx`, `frontend/src/features/auth/ProfileScreen.tsx`, `frontend/src/features/admin/UsersScreen.tsx` (y validación correspondiente en `backend/src/repositories/admin.repository.ts`).
- **Criterios de aceptación:** Un usuario con roles múltiples (ej. `["COMPRADOR", "ARTISTA"]` u `["ORGANIZADOR", "COMPRADOR"]`) puede operar todas las herramientas de sus perfiles en Android, iOS y Web y acceder en cualquier momento a sus códigos QR (`/tickets`), compras (`/purchases`) y notificaciones (`/notifications`), mientras que la gestión de roles impide dejar cuentas sin rol o al sistema sin administradores y registra cada cambio en auditoría.

### 9.3. Eliminación de identificadores internos en `<Select />` y conversión a hoja modal (`PF-03`)
- **Problema:** `Select.tsx` muestra en el botón los IDs crudos seleccionados (`values.join(", ")`, ej. `Ciudad (14)`) y al abrirse inserta un `<Card>` paginado dentro del flujo inline del formulario, rompiendo el layout de las filas vecinas.
- **Causa identificada (Verificada en código):** `frontend/src/components/ui/Select.tsx` (líneas 22–77).
- **Solución propuesta:**
  1. Mantener un diccionario interno `selectedLabels: Record<string, string>` dentro de `Select.tsx` alimentado por los ítems cargados y seleccionados, de modo que el botón muestre siempre `Ciudad: Mar del Plata` o `Géneros: Rock, Pop (2)` y **jamás un ID o UUID**.
  2. Renderizar el listado de opciones dentro de un `<Modal transparent animationType="slide">` (tipo *Bottom Sheet* en móvil y cuadro modal centrado en desktop) con cierre por botón `"Listo"`, tecla `Escape` o botón físico *Back* de Android, e incorporar `useDebouncedValue` en su buscador.
- **Archivos involucrados:** `frontend/src/components/ui/Select.tsx`.
- **Criterios de aceptación:** En ninguna pantalla de Venti se muestra un ID numérico ni UUID dentro de un botón selector, y abrir un `<Select />` no desplaza ni superpone los campos adyacentes del formulario.

### 9.4. Selector visual de calendario y horario con ocultamiento total del formato técnico (`PF-04`)
- **Problema:** En `ConcertList.tsx` y `ConcertEditor.tsx` el usuario debe tipear cadenas ISO UTC (`2027-06-10T23:00:00Z`); en otras pantallas con campos de fecha (`VenueScreen.tsx`, `ServicesScreen.tsx`, `QuotesScreen.tsx`, `ServiceQuotesScreen.tsx`, `StatisticsScreen.tsx`, `AdminScreen.tsx`, `ArtistsScreen.tsx`) se pide escribir fechas a mano; y en `ManageScreen.tsx` debe tipear horarios con sintaxis `"1 10:00-23:00"`.
- **Causa identificada (Verificada en código):** `frontend/src/features/concerts/ConcertList.tsx` (líneas 273–280), `frontend/src/features/organizer/ConcertEditor.tsx` (líneas 30–38, 270–280, 567–568), `frontend/src/features/marketplace/ManageScreen.tsx` (líneas 687–691, 752), `VenueScreen.tsx`, `QuotesScreen.tsx`, `ServicesScreen.tsx`, `ServiceQuotesScreen.tsx` y `StatisticsScreen.tsx`.
- **Solución propuesta:**
  1. **Prohibir el ingreso manual en formato `AAAA-MM-DD` o ISO 8601:** Crear el componente `<DateTimeField />` que **jamás pide al usuario escribir cadenas técnicas**. Al tocar el campo, abre un **calendario visual interactivo** (grilla mensual navegable con días seleccionables y atajos rápidos como *"Hoy"*, *"Mañana"*, *"Este fin de semana"*) y, cuando el campo incluye hora, un **selector visual de horario** (`HH:MM`).
  2. **Presentación localizada y conversión interna transparente (`UTC-3` ↔ `UTC`):**
     - **Hacia el usuario:** Muestra siempre formato legible localizado en español de Argentina (ej. `14/11/2026` o `Sáb 14/11/2026 · 21:00 hs`) y mensajes de validación comprensibles (ej. *"La fecha y hora de finalización debe ser posterior al inicio"*).
     - **Hacia el backend:** Convierte internamente la selección desde la zona horaria local del evento (`America/Argentina/Buenos_Aires`, `UTC-3`, apoyándose en `frontend/src/features/marketplace/time.ts`) al formato técnico exacto requerido por cada endpoint (`YYYY-MM-DD` para fechas puras o `YYYY-MM-DDTHH:mm:ss.sssZ` en `UTC` para timestamps ISO 8601), y convierte de `UTC` a `UTC-3` al cargar datos existentes. El formato técnico permanece 100 % oculto al usuario.
  3. En `ManageScreen.tsx` (`VenueForm`), reemplazar el `TextInput` multilínea de horarios por un editor visual de franjas horarias por día (`Lunes` a `Domingo`, selector de hora `Desde` y `Hasta`, botón `"Agregar franja"` y `"Quitar"`), generando internamente el arreglo `opening_hours: [{ day_of_week, opens_at, closes_at }]` esperado por `POST/PATCH /marketplace/venues`.
- **Archivos involucrados:** `frontend/src/components/ui/index.tsx` (o `DateTimeField.tsx`), `frontend/src/features/concerts/ConcertList.tsx`, `frontend/src/features/organizer/ConcertEditor.tsx`, `frontend/src/features/marketplace/ManageScreen.tsx`, `VenueScreen.tsx`, `QuotesScreen.tsx`, `ServicesScreen.tsx`, `ServiceQuotesScreen.tsx`, `StatisticsScreen.tsx`, `AdminScreen.tsx`.
- **Criterios de aceptación:** Ningún usuario en ninguna pantalla de Venti tiene que tipear `AAAA-MM-DD`, ni una letra `T`, ni una `Z`, ni un número de día `1..7`; todas las fechas y horas se eligen mediante calendario visual y selector de horario, respetando `UTC-3` y `UTC` sin errores de desfase de día.

### 9.5. Perfeccionamiento del checkout de entradas y tratamiento de reservas `HOLD` de 15 minutos (`PF-05`)
- **Problema:** En `ConcertDetail.tsx`, la cantidad de entradas se ingresa en un input de texto libre y el formulario de tarjeta simulada aparece siempre desplegado incluso con 0 entradas seleccionadas. Además, en las reservas temporales de 15 minutos (`HOLD` en `ReservationsScreen.tsx` y órdenes `PENDING` en `PurchasesScreen.tsx`) es necesario clarificar el estado de vencimiento sin alterar la autoridad transaccional del servidor.
- **Causa identificada (Verificada en código):** `frontend/src/features/concerts/ConcertDetail.tsx` (líneas 198–308), `frontend/src/features/purchases/PurchasesScreen.tsx` y `frontend/src/features/marketplace/ReservationsScreen.tsx`.
- **Solución propuesta:**
  1. Sustituir el `<Field keyboardType="number-pad" />` de cada tipo de entrada por `<QuantityStepper />` (`-` / `+`), deshabilitando `+` cuando se alcance `Math.min(type.max_per_purchase, type.stock_available)` y mostrando claramente `"Agotado"` o `"Fuera de ventana de venta"` cuando corresponda.
  2. Mostrar una barra de resumen con el total de entradas seleccionadas y el monto total (`money(totalAmount)`), desplegando el formulario de tarjeta simulada (`Número`, `MM/AA`, `CVV`) recién cuando `totalSelectedTickets > 0`.
  3. **Reglas estrictas para el indicador de retención temporal de 15 minutos (`HOLD` en `ReservationsScreen.tsx` y compra pendiente en `PurchasesScreen.tsx`):**
     - **Indicador de frontend aproximado e informativo:** El contador o badge visual (`warningSoft` / `dangerSoft`) que muestra el tiempo restante hasta `hold_expires_at` (o `expires_at`) cumple una función **aproximada y estrictamente informativa** de orientación para el usuario.
     - **Autoridad exclusiva del backend:** La expiración real de la reserva o intento de compra la determina **única y exclusivamente el backend** en MySQL (`hold_expires_at <= UTC_TIMESTAMP()` en `marketplace.repository.ts` y `expires_at <= UTC_TIMESTAMP()` en `commerce.repository.ts` / procedimientos almacenados).
     - **Prohibición absoluta de extensión desde el cliente:** El contador del cliente **jamás puede extender, pausar ni modificar** una reserva ni su tiempo de retención.
     - **Preferencia por referencia temporal del servidor (mitigación de reloj local desfasado):** Dado que el reloj del dispositivo del usuario (`Date.now()`) puede estar adelantado o atrasado, se establece como preferencia calcular el remanente utilizando una **referencia temporal del servidor** o el desfase horario estimado contra él (`clockOffset = serverNowMs - clientNowMs`). **Consideración técnica:** si un endpoint del backend no incluye actualmente un timestamp explícito de servidor en el cuerpo JSON (o si en entorno nativo/CORS no está expuesta la cabecera HTTP `Date`), no se modifica el backend en esta etapa de planificación; se deja documentada dicha consideración técnica para la implementación, manteniendo el contador del cliente como **aproximado e informativo** y consultando siempre al backend como única fuente de verdad al recuperar foco (`useFocusEffect`), volver a primer plano (`AppState` `"active"`) o reconectar la red (`resource.reload()`).
     - **Preservación intacta de la lógica transaccional:** Se conserva sin modificaciones la lógica transaccional del backend (`SELECT ... FOR UPDATE`, `LOCK IN SHARE MODE`, expiración atómica previa al pago/confirmación). Si el usuario intenta pagar en el instante exacto en que vence el `HOLD` y el backend devuelve error de expiración (`409` / estado `EXPIRED`), el frontend capturará la respuesta, actualizará el estado de la vista a `Vencida` y deshabilitará los botones de pago.
- **Archivos involucrados:** `frontend/src/features/concerts/ConcertDetail.tsx`, `frontend/src/features/purchases/PurchasesScreen.tsx`, `frontend/src/features/marketplace/ReservationsScreen.tsx`.
- **Criterios de aceptación:** El comprador selecciona entradas con botones `-`/`+`, el indicador de 15 minutos refleja fielmente el estado del servidor tras cerrar/reabrir la app o perder red, el backend sigue siendo el único árbitro de la expiración y se verifica sin fallos el caso límite de intento de pago al expirar el `HOLD`.

### 9.6. Consistencia en rechazo de propuestas artísticas y estados de negociación (`PF-06`)
- **Problema:** En `ArtistsScreen.tsx` (`ArtistProposalsPanel`, línea 259) y `ManageScreen.tsx` (`VenueHiringsPanel`, línea 496), el botón `"Rechazar"` de la tarjeta rechaza inmediatamente la propuesta enviando un texto fijo hardcodeado (`"No contamos con disponibilidad en esa fecha."`), sin dejar que el usuario escriba su propio motivo ni confirmar la acción, mientras que `ProposalScreen.tsx` (`/proposals/[id]`) sí exige escribir el motivo.
- **Causa identificada (Verificada en código):** `frontend/src/features/artists/ArtistsScreen.tsx` (líneas 250–262) y `frontend/src/features/marketplace/ManageScreen.tsx` (líneas 490–498).
- **Solución propuesta:**
  1. En las tarjetas de `ArtistProposalsPanel` y `VenueHiringsPanel`, agregar el botón `"Ver detalle completo"` hacia `/proposals/${proposal.id}` y hacer que al tocar `"Rechazar"` se despliegue inline un campo obligatorio `"Motivo del rechazo (mínimo 3 caracteres)"` con el botón de confirmación `"Confirmar rechazo"`, unificando el comportamiento con `ProposalScreen.tsx`, `UsersScreen.tsx` y `EstablishmentsReviewScreen.tsx`.
- **Archivos involucrados:** `frontend/src/features/artists/ArtistsScreen.tsx`, `frontend/src/features/marketplace/ManageScreen.tsx`.
- **Criterios de aceptación:** Ninguna propuesta puede rechazarse sin que el destinatario ingrese o confirme explícitamente el motivo del rechazo, y la contraparte recibe la notificación con dicho motivo.

---

## 10. SEGURIDAD Y CONSISTENCIA TRANSACCIONAL

### 10.1. Aspectos verificados en el código actual (Qué ya está garantizado y no debe romperse)
La auditoría de los repositorios del backend (`backend/src/repositories/`) y del esquema SQL (`database/venti_mvp_mysql84.sql`) confirma que Venti ya implementa controles de seguridad que deben preservarse intactos:
1. **Autorización real en el servidor (`requirePermission` / verificación de membresía):** Todos los endpoints verifican los permisos de la cuenta en base de datos y validan pertenencia a la organización (`organization_members`) o al perfil artístico (`artist_profile_members`) antes de mutar datos. Ocultar un botón en React Native es solo UX; la frontera de seguridad sigue estando en el backend.
2. **Prevención de sobreventa de entradas (`sp_create_purchase`):** Utiliza transacciones con bloqueo pesimista (`SELECT ... FOR UPDATE` sobre `ticket_types`), verificando que el concierto esté `PUBLISHED`, que la fecha actual esté entre `sales_start_at` y `sales_end_at`, que no se supere `max_per_order` y que exista stock disponible antes de descontar `quantity_sold`.
3. **Prevención de reservas simultáneas solapadas (`marketplace.repository.ts`):** La creación de reservas (`HOLD`) y la aceptación de presupuestos abren una transacción en MySQL, bloquean la sala (`SELECT ... FOR UPDATE`), expiran reservas vencidas (`hold_expires_at <= UTC_TIMESTAMP()`) y comprueban solapamientos contra `venue_reservation_occupancies` y `venue_availability_blocks` usando `LOCK IN SHARE MODE`, considerando tanto reservas de sala (`VENUE`) como de complejo completo (`ESTABLISHMENT`). **Esta lógica transaccional no se modificará salvo que una prueba demuestre una justificación técnica fehaciente.**
4. **Integridad de códigos QR (`sp_validate_ticket_qr`):** Verifica en una única transacción que el `qr_token` exista, pertenezca al `concert_id` seleccionado por el staff, que la orden esté `CONFIRMED` y que el ticket esté `VALID`, marcándolo atómicamente como `USED` con `used_at = UTC_TIMESTAMP()`.
5. **No persistencia de datos sensibles de tarjetas (`purchaseAttempt.ts` y `commerce.repository.ts`):** El número de tarjeta, vencimiento y CVV ingresados en el frontend solo se validan localmente en memoria (`validateSimulatedCard`) para fines pedagógicos y **jamás se envían en el body HTTP ni se guardan en MySQL** (el endpoint `/purchases/:id/confirm` solo recibe `{ outcome: "APPROVED" }`).
6. **Invisibilidad del rol `ADMIN` en negociaciones privadas:** Los administradores gestionan usuarios, catálogos, verificación de proveedoras y publicación inicial de establecimientos (`PENDING_REVIEW`), pero no alteran presupuestos ni propuestas comerciales entre partes.

### 10.2. Aspectos que requieren pruebas de verificación continua durante el rediseño
1. **Sincronización de sesión al suspender una cuenta o cambiar roles:** Verificar que cuando un `ADMIN` suspende una cuenta (`POST /admin/users/:id/suspend`), el cierre de sesiones en base de datos invalida inmediatamente el refresh token en la app móvil y redirige a `/login`.
2. **Condición de carrera en el límite de expiración de reservas `HOLD` de 15 minutos y recuperación de estado:**
   - Probar explícitamente qué sucede cuando un usuario intenta completar el pago simulado (`POST /marketplace/reservations/:id/pay` o `POST /purchases/:id/confirm`) **justo en el instante en que expira la ventana de 15 minutos (`hold_expires_at` / `expires_at`)**.
   - Comprobar que el backend rechaza atómicamente la confirmación sobre una retención vencida, libera el cupo/franja horaria sin generar **compras dobles ni reservas inconsistentes**, y que el frontend sincroniza inmediatamente el estado real (`EXPIRED`) tanto en ese caso límite como después de un corte de red, cierre de la aplicación o reanudación de sesión desde segundo plano.
3. **Protección contra envíos duplicados (Doble tap en móvil):** Asegurar que todas las acciones de mutación utilicen el hook `useAction()` (`action.busy`) o refs de bloqueo (`locked.current` como en `StaffScreen.tsx`) para impedir dobles llamadas concurrentes en conexiones móviles lentas.

---

## 11. MATRIZ DE PRIORIZACIÓN

Cada mejora se clasifica con las prioridades **P0** (crítico: impide usar correctamente una función, oculta flujos existentes o rompe el layout móvil), **P1** (importante: afecta significativamente la usabilidad, la navegación o la identidad visual obligatoria), **P2** (mejora relevante no bloqueante) y **P3** (mejora de pulido o rendimiento fino).

| ID | Problema detectado | Solución técnica | Prioridad | Impacto | Esfuerzo | Riesgo | Dependencias | Plataforma afectada | Criterio de aceptación verificable |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- |
| **M-01** | Superposición de tarjetas en móviles por `height: "100%"` en `BentoGrid` (`flexWrap: "wrap"`) y botones fuera de `VenueCard`/`OfferingCard`. | En `BentoGrid` usar columna única en `mobile` sin `height: "100%"` en `Card`, e integrar acciones de pie dentro de `VenueCard` y `OfferingCard`. | **P0** | Alto | Medio | Bajo | Ninguna | Android, iOS, Web móvil | Cero tarjetas o botones superpuestos en APK Android y en `320px`/`390px` en las 12 pantallas afectadas. |
| **M-02** | Colisión de `badge` y `subBadge` en `MusicalCover` cuando hay varios géneros o textos largos. | Añadir `flexShrink: 1`, `maxWidth` y `numberOfLines={1}` en los badges de `MusicalCover` y truncar lista de géneros en portada. | **P0** | Alto | Bajo | Bajo | Ninguna | Android, iOS, Web móvil | `badge` y `subBadge` nunca se tocan ni desbordan en `320px` de ancho. |
| **M-03** | `ProfilesScreen.tsx` (`/profiles`) no permite activar perfiles *self-service* ni solicitar perfiles a administración, y no tiene enlace desde `/profile`. | Completar `ProfilesScreen.tsx` conectándola a `POST /me/profiles` y `POST /me/profile-requests`, y enlazarla desde `ProfileScreen.tsx`. | **P0** | Alto | Medio | Bajo | Backend `/me/profiles` (ya activo) | Android, iOS, Web | Un usuario puede activar `ARTISTA` o solicitar `ORGANIZADOR`/`VENUE`/`EMPRESA_SERVICIOS` desde la UI y ver el estado de su solicitud. |
| **M-04** | Pérdida de acceso a `/tickets` y `/purchases` para usuarios con roles distintos de `COMPRADOR`, ausencia de navegación multi-rol validada, `/discover` duplicado con `/recommendations` y reemplazo destructivo de roles en `/admin/users/[id]`. | Validar mediante prototipo la arquitectura de `Shell.tsx` (Opción C vs. Opción D), garantizando acceso permanente a `/tickets`, `/purchases`, `/notifications` y `/discover`, quitando el duplicado `/recommendations` y habilitando gestión aditiva de roles en `/admin/users/[id]` con protecciones en backend/UI (no eliminar último `ADMIN`, impedir auto-eliminación del último `ADMIN`, no dejar cuentas sin rol válido y auditar en `audit_logs`). | **P0** | Alto | Medio | Medio | `AuthContext`, `Shell.tsx`, `admin.repository.ts` | Android, iOS, Web | Acceso permanente a funciones compartidas y gestión aditiva de roles protegida en backend/UI y auditada. |
| **M-05** | `Select.tsx` muestra IDs internos crudos en el botón (`Ciudad (4)`) y al abrirse inline deforma la fila del formulario. | Guardar mapa `id -> name` para mostrar etiquetas legibles y abrir el selector en un `<Modal>` (*Bottom Sheet* en móvil / modal en desktop). | **P0** | Alto | Medio | Bajo | `Select.tsx` | Android, iOS, Web | Ningún botón selector muestra IDs ni UUIDs, y abrir el selector no altera el layout del formulario. |
| **M-06** | Paleta actual dominada por azul/índigo (`Electric Stage Indigo`), contraria a la identidad definida. | Implementar la paleta semántica **Urbano Contemporáneo** (carbón, amarillo energético `#F5C542`, rojo `#D9383A`, superficies neutras) en `palette.ts` y `MusicalCover`. | **P1** | Alto | Medio | Bajo | Auditoría `a11y-audit.mjs` | Android, iOS, Web | 100 % de pantallas utilizan los nuevos tokens en modo oscuro y claro, con `0` fallos de contraste WCAG AA en `test:a11y`. |
| **M-07** | Formularios y filtros piden escribir manualmente fechas en formato `AAAA-MM-DD` o ISO 8601 (`2027-06-10T23:00:00Z`), y `ManageScreen` exige sintaxis `"1 10:00-23:00"`. | Crear `<DateTimeField />` con **calendario visual interactivo y selector de horario**, presentación localizada (`dd/mm/aaaa`) y conversión interna oculta entre `UTC-3` y `AAAA-MM-DD` / ISO 8601 `UTC`, más editor visual de horarios por día en `ManageScreen.tsx`. | **P1** | Alto | Medio | Medio | Utilidades en `marketplace/time.ts` | Android, iOS, Web | Ningún usuario escribe manualmente `AAAA-MM-DD` ni cadenas ISO; selección 100 % visual con manejo exacto de `UTC-3` y `UTC`. |
| **M-08** | Compra en `ConcertDetail.tsx` usa input de texto para cantidad y muestra tarjeta antes de elegir entradas; reservas `HOLD` de 15 min requieren indicador aproximado e informativo resiliente a desfase de reloj y red/cierre de app. | Implementar `<QuantityStepper />` (`-` / `+`), paso de pago progresivo e indicador aproximado/informativo (`15 min`) con preferencia por referencia temporal del servidor y recarga al recuperar foco/primer plano/reconexión, manteniendo la expiración real exclusivamente en el backend. | **P1** | Alto | Bajo | Bajo | `ConcertDetail.tsx`, `ReservationsScreen.tsx` | Android, iOS, Web | Selección táctil `-`/`+`, contador que jamás extiende el `HOLD` y rechazo limpio en backend si expira al pagar. |
| **M-09** | Rechazo rápido de propuestas en `ArtistsScreen.tsx` y `ManageScreen.tsx` envía motivo hardcodeado sin pedir motivo real ni confirmación. | Solicitar motivo de rechazo (`>= 3` caracteres) y confirmación antes de invocar `POST /proposals/:id/reject`. | **P1** | Medio | Bajo | Bajo | `ArtistsScreen`, `ManageScreen` | Android, iOS, Web | Todo rechazo de propuesta registra el motivo real ingresado por el usuario. |
| **M-10** | Sobrecarga visual en pantallas con múltiples subformularios apilados (`ConcertEditor.tsx`, `ManageScreen.tsx`). | Organizar las secciones internas mediante pestañas segmentadas (*Segmented Tabs*) manteniendo el estado del formulario. | **P2** | Medio | Medio | Bajo | `M-01`, `M-07` | Android, iOS, Web | El usuario visualiza una tarea principal a la vez sin perder datos al cambiar de pestaña interna. |
| **M-11** | Posibles cuellos de botella en buscadores en vivo (`useResource` por tecla), `JSON.stringify` en `key` de `TicketEditor`, re-renders de tarjetas SVG y consultas repetidas de catálogos. | **Medir primero línea base**; aplicar solo donde se compruebe el problema (`useDebouncedValue`, `key={type.id}`, `React.memo`, caché de catálogos con invalidación explícita en `/admin`, `logout` y `reload`); **volver a medir y comparar**. | **P2** | Medio | Bajo | Bajo | Medición previa (Sección 7) | Android, iOS, Web | Mejora verificada con mediciones antes/después y cero datos obsoletos tras editar catálogos en `/admin`. |
| **M-12** | Ausencia de skeleton estructural en cargas iniciales y de hook unificado de movimiento reducido en nativo. | Incorporar variante skeleton en `<ResourceState />` y hook `useReducedMotion()` (`AccessibilityInfo` en nativo + media query en web). | **P3** | Bajo | Bajo | Bajo | `M-06` | Android, iOS, Web | Cargas muestran estructura de tarjeta y las animaciones se desactivan cuando el sistema operativo pide reducir movimiento. |

---

## 12. PLAN DE IMPLEMENTACIÓN POR ETAPAS

El trabajo se estructura en **5 etapas secuenciales** ordenadas por dependencias técnicas, donde ninguna etapa avanza a la siguiente sin superar sus pruebas obligatorias.

### Etapa 1 — Sistema de Diseño "Urbano Contemporáneo" y Corrección Estructural de Layout Móvil (`M-01`, `M-02`, `M-06`)
- **Objetivo:** Sustituir el tema azul/índigo por la identidad **Urbano Contemporáneo** (modo oscuro y modo claro) y erradicar todas las superposiciones de tarjetas, badges y botones en dispositivos móviles.
- **Tareas:**
  1. Actualizar `frontend/src/components/ui/palette.ts` con los tokens semánticos verificados de la Sección 4.2 (carbón, amarillo `#F5C542`, ocre accesible en claro, rojo `#D9383A`, superficies y bordes).
  2. Rediseñar las ilustraciones SVG y badges de `MusicalCover` en `frontend/src/components/ui/index.tsx` eliminando los colores índigo hardcodeados y agregando truncamiento seguro (`flexShrink: 1`, `numberOfLines={1}`) en `badge` y `subBadge`.
  3. Corregir `BentoGrid`, `Card` y `StatTile` en `frontend/src/components/ui/index.tsx`, y eliminar `height: "100%"` conflictivo en `ConcertList.tsx`, `PurchasesScreen.tsx`, `ArtistsScreen.tsx`, `MarketplaceScreen.tsx`, `ManageScreen.tsx`, `QuotesScreen.tsx`, `ReservationsScreen.tsx`, `ServicesScreen.tsx`, `ProvidersScreen.tsx`, `ServiceQuotesScreen.tsx` y `StaffScreen.tsx`.
  4. Integrar los botones de administración dentro del pie de `VenueCard` (`ManageScreen.tsx`) y `OfferingCard` (`ProvidersScreen.tsx`) para que nunca queden pisados fuera de la tarjeta.
- **Dependencias:** Ninguna (punto de partida).
- **Archivos involucrados:** `frontend/src/components/ui/palette.ts`, `frontend/src/components/ui/index.tsx`, y los 11 archivos de features listados arriba.
- **Resultado esperado:** Aplicación visualmente transformada a *Urbano Contemporáneo* y libre de superposiciones en móvil y escritorio.
- **Pruebas obligatorias:** `npm run check`, `npm --prefix backend run test:a11y`, `npm --prefix backend run test:ui` y verificación visual en resoluciones `320px`, `390px`, `768px` y `1440px`.
- **Condición de finalización:** Cero errores de contraste WCAG AA en modo claro y oscuro, y cero solapamientos de cajas en móvil y web.

### Etapa 2 — Arquitectura de Navegación Multi-Rol y Autogestión de Perfiles (`M-03`, `M-04`)
- **Objetivo:** Conectar de extremo a extremo la pantalla `/profiles` y validar mediante prototipo la navegación multi-rol en `Shell.tsx` asegurando que jamás se oculten las entradas, compras ni notificaciones del usuario.
- **Tareas:**
  1. Prototipar y validar las dos variantes candidatas de `Shell.tsx` (Opción C: `activeRole` con selector de contexto + accesos compartidos permanentes vs. Opción D: barra inferior compartida fija + panel operativo multi-rol), aplicando la solución validada en `frontend/src/contexts/AuthContext.tsx` y `frontend/src/components/layout/Shell.tsx`.
  2. Garantizar en Android, iOS y Web el acceso permanente a `/tickets`, `/purchases`, `/notifications` y `/discover`, y eliminar la pestaña redundante `/recommendations`.
  3. Completar `frontend/src/features/auth/ProfilesScreen.tsx` con activación de perfiles `self_service` (`POST /me/profiles`), formulario de solicitud de perfiles `requestable` (`POST /me/profile-requests`) y listado de solicitudes (`requests`), agregando su acceso en `ProfileScreen.tsx`.
  4. Actualizar `frontend/src/features/admin/UsersScreen.tsx` (`/admin/users/[id]`) y las validaciones de backend (`admin.repository.ts`) para habilitar la gestión aditiva de roles protegiendo al último `ADMIN` activo (incluyendo contra auto-eliminación), impidiendo que una cuenta quede sin al menos un rol válido habilitante, registrando cada cambio en `audit_logs` y reflejando las restricciones en la interfaz.
- **Dependencias:** Etapa 1 completada.
- **Archivos involucrados:** `AuthContext.tsx`, `Shell.tsx`, `ProfileScreen.tsx`, `ProfilesScreen.tsx`, `UsersScreen.tsx`, `admin.repository.ts`.
- **Resultado esperado:** Flujo de perfiles 100 % conectado, navegación validada para los 6 roles y gestión de roles protegida y auditada.
- **Pruebas obligatorias:** `npm --prefix backend run test:e2e`, `npm --prefix backend run test:a11y` y prueba del flujo `COMPRADOR` → activa `ARTISTA` → conserva acceso en todo momento a `/tickets`, `/purchases` y `/notifications`, más pruebas de protección del último `ADMIN` y de rol mínimo habilitante.
- **Condición de finalización:** Todos los roles pueden activarse o solicitarse desde la UI, ninguna cuenta queda sin rol ni el sistema sin administradores, y ninguna cuenta pierde acceso a sus códigos QR, compras o notificaciones.

### Etapa 3 — Calendario Visual, Selectores de Horario, Selectores Modales y Checkout (`M-05`, `M-07`, `M-08`, `M-09`)
- **Objetivo:** Eliminar toda fricción técnica de entrada de datos (IDs crudos, fechas escritas manualmente en `AAAA-MM-DD` o ISO 8601, horarios codificados y cantidades por texto) e incorporar el indicador aproximado e informativo de reservas `HOLD` de 15 minutos.
- **Tareas:**
  1. Rediseñar `frontend/src/components/ui/Select.tsx` para mostrar siempre nombres legibles (`item.name`) en el botón disparador y abrir las opciones dentro de un `<Modal>` accesible (*Bottom Sheet* en móvil).
  2. Implementar `<DateTimeField />` con **calendario visual interactivo y selector de horario**, presentación localizada (`dd/mm/aaaa`) y conversión interna oculta entre `America/Argentina/Buenos_Aires` (`UTC-3`) y `AAAA-MM-DD` / ISO 8601 `UTC`, reemplazando todas las entradas manuales de fecha/hora en `ConcertList.tsx`, `ConcertEditor.tsx`, `VenueScreen.tsx`, `QuotesScreen.tsx`, `ServicesScreen.tsx`, `ServiceQuotesScreen.tsx`, `StatisticsScreen.tsx` y `AdminScreen.tsx`.
  3. Reemplazar el campo de texto de horarios en `ManageScreen.tsx` (`VenueForm`) por el selector visual estructurado de días y franjas horarias.
  4. Incorporar `<QuantityStepper />` (`-` / `+`) y el despliegue progresivo del pago simulado en `ConcertDetail.tsx`, más el indicador **aproximado y estrictamente informativo** de vencimiento de retención (`15 min`) en `PurchasesScreen.tsx` y `ReservationsScreen.tsx` (preferentemente basado en referencia temporal o desfase del servidor, sin permitir jamás extender la reserva desde el cliente y recargando el estado real del backend al recuperar foco `useFocusEffect`, volver a primer plano `AppState` o reconectar).
  5. Unificar el motivo obligatorio de rechazo de propuestas en `ArtistsScreen.tsx` y `ManageScreen.tsx`.
- **Dependencias:** Etapas 1 y 2 completadas.
- **Archivos involucrados:** `Select.tsx`, `ui/index.tsx`, `ConcertList.tsx`, `ConcertEditor.tsx`, `ConcertDetail.tsx`, `ManageScreen.tsx`, `VenueScreen.tsx`, `QuotesScreen.tsx`, `ServicesScreen.tsx`, `ServiceQuotesScreen.tsx`, `StatisticsScreen.tsx`, `AdminScreen.tsx`, `ArtistsScreen.tsx`, `PurchasesScreen.tsx`, `ReservationsScreen.tsx`.
- **Resultado esperado:** Experiencia de uso intuitiva y guiada en compras, filtros, producción de conciertos y administración de espacios.
- **Pruebas obligatorias:** Suite completa de backend y E2E (`npm test`, `npm --prefix backend run test:e2e`, `npm --prefix backend run test:ui`), incluyendo la prueba de condición de carrera al intentar pagar cuando expira el `HOLD` de 15 minutos.
- **Condición de finalización:** Ningún flujo del sistema muestra IDs internos ni pide escribir fechas en `AAAA-MM-DD`, cadenas ISO o códigos de horario manuales, y la expiración del `HOLD` sigue gobernada exclusivamente por el backend.

### Etapa 4 — Organización de Vistas Densas, Medición/Optimización de Rendimiento y Microinteracciones (`M-10`, `M-11`, `M-12`)
- **Objetivo:** Reducir la densidad cognitiva en paneles de gestión, aplicar el protocolo de medición previa para optimizar únicamente cuellos de botella comprobados y pulir estados de carga y movimiento reducido.
- **Tareas:**
  1. Incorporar pestañas segmentadas (*Segmented Tabs*) en `ConcertEditor.tsx` y `ManageScreen.tsx`.
  2. Ejecutar la medición de línea base (Sección 7.2); aplicar únicamente donde se compruebe un cuello de botella real `useDebouncedValue(300)`, `key={type.id}` en `ConcertEditor.tsx`, `React.memo` en tarjetas SVG y caché de catálogos en `useResource.ts` con **política de invalidación explícita** (mutación en `/admin`, `logout`, `reload` manual y TTL de 5 min); y volver a medir para comparar resultados usando **mediana y percentil 75 (p75)**.
  3. Agregar variante skeleton en `<ResourceState />` y hook `useReducedMotion()` multiplataforma.
- **Dependencias:** Etapa 3 completada.
- **Archivos involucrados:** `useResource.ts`, `ui/index.tsx`, `ConcertEditor.tsx`, `ManageScreen.tsx`, `ConcertList.tsx`, `MarketplaceScreen.tsx`, `ServicesScreen.tsx`, `AdminScreen.tsx`.
- **Resultado esperado:** Pantallas de gestión ordenadas, mejoras de rendimiento demostradas con mediciones antes/después (sin datos obsoletos en caché) y transiciones que respetan `prefers-reduced-motion`.
- **Pruebas obligatorias:** `npm run check`, `test:e2e`, `test:ui` (incluyendo el test de `reducedMotion: 'reduce'`) y `test:a11y`.
- **Condición de finalización:** Todas las suites automatizadas en verde y comparación de métricas antes/después (mediana y p75) documentada.

### Etapa 5 — Validación Integral, Pruebas en APK Físico y Estudio Progresivo con Usuarios
- **Objetivo:** Comprobar empíricamente en Android, iOS/Web y mediante la primera etapa formativa de **5 participantes** que el rediseño resolvió los problemas detectados sin introducir regresiones.
- **Tareas:**
  1. Generar el build de previsualización (`npm --prefix frontend run build:native` / APK) y ejecutar el protocolo completo de validación técnica (Sección 13).
  2. Ejecutar la primera etapa formativa del estudio de campo con **5 participantes totales** (cubriendo los distintos perfiles según la Sección 3.2), registrando tareas, tiempo, errores, dudas, dificultades y observaciones.
  3. Analizar resultados, aplicar ajustes emergentes y **ampliar la muestra únicamente si los hallazgos demuestran que es necesario**.
- **Dependencias:** Etapas 1 a 4 finalizadas.
- **Condición de finalización:** 100 % de pruebas automatizadas y manuales aprobadas sin bloqueantes P0/P1 pendientes.

---

## 13. PLAN DE VALIDACIÓN INTEGRAL

Para garantizar que ninguna mejora rompa el funcionamiento existente de Venti, la validación se divide explícitamente entre **Pruebas Automatizadas** (ejecutables en CI/local mediante scripts existentes y ampliados) y **Pruebas con Intervención Humana** (en dispositivo físico y sesiones de usuario).

### 13.1. Pruebas automatizadas (Sin intervención humana)

| Categoría | Comando / Script en el repositorio | Qué comprueba objetivamente |
| :--- | :--- | :--- |
| **1. Verificación estática, tipos y linting** | `npm run check` (ejecuta `tsc --noEmit` en backend y frontend + `eslint --max-warnings 0`) | Cero errores de TypeScript, contratos de tipos `api.ts` consistentes y cero advertencias de linter. |
| **2. Pruebas de regresión, concurrencia y expiración de API / BD** | `npm --prefix backend test` (`auth.test.js`, `commerce.test.js`, `management.test.js`, `participation.test.js`, `recommendations.test.js`, `insights.test.js`, `security.test.js`, `db-config.test.js`) | Transacciones de compra, stock, reembolsos simulados, validación QR, **condición de carrera al intentar pagar exactamente cuando expira el `HOLD` de 15 minutos** (rechazo atómico en backend sin compras dobles ni reservas inconsistentes), protecciones de gestión de roles (no eliminar último `ADMIN` ni dejar cuentas sin rol), propuestas, presupuestos y conexión MySQL/Aiven. |
| **3. Pruebas funcionales End-to-End (E2E)** | `npm --prefix backend run test:e2e` (`backend/scripts/stage5-e2e.mjs`) | Recorrido completo en navegador real (Playwright) contra API y MySQL aislada: registro, login, creación de concierto con selector visual de fechas, compra simulada, emisión de QR y validación. |
| **4. Pruebas automatizadas de UI, temas y responsive** | `npm --prefix backend run test:ui` (`backend/scripts/ui-e2e.mjs`) | Alternancia y persistencia de tema oscuro/claro, validación inline de formularios, botón `"Volver arriba"` con y sin `reducedMotion`, y **ausencia de scroll horizontal o cajas desbordadas en `320px`, `390px`, `768px` y `1440px`**. Se ampliará con una **comprobación geométrica de intersección 2D entre rectángulos (`boundingBox()`)** que compare simultáneamente los límites horizontales y verticales (`rectA.left < rectB.right - 1 && rectA.right > rectB.left + 1 && rectA.top < rectB.bottom - 1 && rectA.bottom > rectB.top + 1`), detectando únicamente intersecciones reales entre tarjetas/controles hermanos, siendo compatible con grillas responsive de múltiples columnas y excluyendo elementos cuya superposición sea intencional (ej. badges internos sobre portadas `MusicalCover`, cabeceras/barras fijas o modales abiertos). |
| **5. Auditoría automatizada de Accesibilidad (WCAG 2.2 AA)** | `npm --prefix backend run test:a11y` (`backend/scripts/a11y-audit.mjs`) | Verifica en modo oscuro y modo claro (`1440px` y `390px`) que todos los textos cumplan ratio `>= 4.5:1` (`>= 3:1` en texto grande), todas las imágenes tengan `alt`, todos los controles tengan nombre accesible y todo el flujo sea operable solo con teclado (`Tab` / `Enter`) con indicador de foco visible. |

### 13.2. Pruebas manuales y físicas (Requieren intervención humana)

1. **Prueba física en APK Android (Obligatoria en dispositivo real):**
   - Instalar el APK compilado y recorrer las vistas donde antes se superponían las tarjetas: `/discover`, `/search`, `/purchases`, `/tickets`, `/artists`, `/organizer/[id]`, `/marketplace`, `/marketplace/manage`, `/marketplace/quotes`, `/marketplace/reservations`, `/services`, `/services/mine`, `/services/quotes`, `/staff` y `/organizer/statistics`.
   - Comprobar el calendario visual y selector de horario (`<DateTimeField />`), el cierre de modales con el botón físico *Back*, la sincronización del contador informativo de `HOLD` tras minimizar/cerrar y reabrir la app o desconectar/reconectar la red, y el escaneo de un código QR real utilizando la cámara trasera en `/staff`.
2. **Validación en iOS / Simulador y Safari móvil:**
   - Verificar el respeto de áreas seguras (`SafeAreaView` superior en Dynamic Island/Notch e inferior en Home Indicator) en la barra de pestañas inferior y en los modales de calendario y selectores.
3. **Matriz de validación manual de Roles y Permisos:**
   - Verificar con una cuenta multi-rol (`COMPRADOR` + `ARTISTA` + `ORGANIZADOR`) que la navegación mantiene siempre accesibles las entradas QR (`/tickets`), compras (`/purchases`), notificaciones (`/notifications`) y cartelera (`/discover`), y que un administrador puede aprobar establecimientos y solicitudes de perfil sin intervenir en presupuestos ni propuestas privadas.
4. **Primera etapa formativa de pruebas con usuarios (Protocolo progresivo de la Sección 3):**
   - Ejecutar los escenarios `T-COMP`, `T-MULTI`, `T-ART`, `T-VEN`, `T-ORG`, `T-SRV` y `T-ADM-STF` con la muestra inicial de **5 participantes totales**, registrando tareas, tiempo, errores, dudas, dificultades y observaciones antes de decidir si se requiere ampliar la muestra.

---

## 14. RIESGOS, LIMITACIONES Y DECISIONES PENDIENTES

### 14.1. Riesgos técnicos identificados y su mitigación
1. **Riesgo de rotura de selectores en los tests E2E existentes (`stage5-e2e.mjs`, `ui-e2e.mjs`, `a11y-audit.mjs`):**
   - *Causa:* Los scripts de Playwright buscan botones y campos por su etiqueta accesible exacta (`getByRole('button', { name: ... })`, `getByLabel(...)`).
   - *Mitigación:* Conservar los `accessibilityLabel` y nombres accesibles esperados por la suite de pruebas o actualizar de manera sincronizada los tests cuando se reemplace un input crudo por el calendario visual `<DateTimeField />`.
2. **Riesgo de desfase de fecha por zona horaria entre el calendario visual (`UTC-3`) y el backend (`UTC`):**
   - *Causa:* Un concierto que comienza el sábado a las `22:00 hs` en Mar del Plata (`America/Argentina/Buenos_Aires`, `UTC-3`) corresponde al domingo a las `01:00:00Z` en `UTC`. Si se trunca la cadena ISO sin convertir el huso horario, el evento se mostraría en el día equivocado.
   - *Mitigación:* Centralizar toda conversión de `<DateTimeField />` en las funciones de zona horaria Argentina (`UTC-3`) de `frontend/src/features/marketplace/time.ts`, cubiertas con tests unitarios para horarios nocturnos (`21:00` a `23:59` `UTC-3`).
3. **Riesgo de desincronización visual del indicador `HOLD` de 15 minutos si el reloj del dispositivo está desfasado o la app pasa a segundo plano:**
   - *Causa:* El reloj local del dispositivo puede estar corrido respecto del servidor y, cuando la app pasa a segundo plano en Android/iOS, los timers de JS se pausan.
   - *Mitigación:* Preferir siempre una referencia temporal del servidor (o el desfase calculado contra él) por sobre `Date.now()` puro; si el endpoint consultado no provee aún dicha referencia temporal, dejarlo asentado como consideración técnica sin alterar el backend en esta tarea, manteniendo el indicador como **aproximado e informativo**, impidiendo que el cliente extienda jamás la reserva y consultando al backend (`resource.reload()`) al recuperar foco (`useFocusEffect`), volver a primer plano (`AppState`) o reconectar. La autoridad sobre el vencimiento reside exclusivamente en el backend (`UTC_TIMESTAMP()` en MySQL).
4. **Riesgo de contraste insuficiente del amarillo en modo claro y diferencias Yoga vs. Flexbox:**
   - *Mitigación:* Resuelto mediante texto carbón `#171305` sobre botón primario `#F5C542` (`10.8:1`) y acento ocre `#855D00` / `#6E4C00` (`> 5.8:1`) en modo claro (validado con `a11y-audit.mjs`), más la prohibición de `height: "100%"` en contenedores `flexWrap: "wrap"`.

### 14.2. Limitaciones del alcance académico
- **Pagos y reembolsos simulados:** El sistema no procesa dinero real ni conecta con pasarelas bancarias externas.
- **Imágenes por URL:** Las imágenes de conciertos, artistas, salas y servicios se seguirán vinculando mediante URLs (`https://...`), sin infraestructura de almacenamiento de blobs/CDN propia en esta etapa.
- **Notificaciones in-app y correo:** Las notificaciones operan dentro de la bandeja de la aplicación (`/notifications`) y vía correo transaccional (`nodemailer`), sin servicio de notificaciones push nativas en segundo plano (FCM/APNs).

### 14.3. Decisiones pendientes que requieren validación o confirmación antes de codificar
1. **Validación en prototipo de la arquitectura de navegación multi-rol (Sección 5.1):**
   - Comparar mediante prototipos interactivos las alternativas **Opción C** (Bottom Tabs contextuales + selector de rol activo en cabecera con accesos fijos a funciones compartidas) y **Opción D** (Barra inferior fija con funciones compartidas + Hub / Panel Operativo según permisos activos) antes de tomar una decisión definitiva, respetando siempre la regla innegociable de mantener `tickets`, `purchases`, `notifications` y `discover` accesibles en todo momento.
2. **Validación visual de los tonos exactos de la paleta Urbano Contemporáneo (Sección 4.2):** Mantener **Urbano Contemporáneo** como la identidad elegida y validar visualmente si el tono de amarillo energético (`#F5C542`), el carbón base (`#111113` / `#19191D`) y el rojo de énfasis (`#D9383A`) propuestos se aprueban tal cual o requieren un ajuste leve de temperatura antes de aplicarlos en `palette.ts`.
3. **Gestión aditiva de roles en Administración (`/admin/users/[id]`) con protecciones obligatorias (Sección 9.2):**
   - Confirmar la adopción del modo aditivo en `UsersScreen.tsx` y `admin.repository.ts` sujeto a las protecciones definidas: prohibir eliminar al último administrador activo del sistema, impedir la autoeliminación de un administrador cuando deje al sistema sin administradores, impedir que una cuenta quede sin un rol válido habilitante, validar siempre permisos y pertenencia en el backend, registrar los cambios en `audit_logs` y contemplar errores y restricciones en la interfaz.
4. **Flujo de pagos simulados (Sección 9.5):**
   - Mantener el flujo de pago simulado actual (formulario de tarjeta simulada en compra de entradas y botones directos de simulación en reservas de espacios `ReservationsScreen.tsx`), salvo que durante las pruebas se detecte un problema concreto de usabilidad que justifique ajustarlo.

---

## 15. CRITERIOS GENERALES DE CALIDAD

Toda intervención de código que se ejecute a partir de este plan maestro deberá cumplir sin excepción los siguientes 10 principios de calidad de ingeniería:

1. **Resolver un problema real y trazable:** Ningún archivo se modifica por preferencia subjetiva; todo cambio debe responder a un identificador de la Matriz de Priorización (`M-01` a `M-12`).
2. **Mantener consistencia visual bajo la identidad Urbano Contemporáneo:** Todo color debe provenir de los tokens semánticos de `palette.ts` (`colors.*`); queda prohibido introducir colores hexadecimales hardcodeados fuera del sistema de diseño.
3. **Ser intuitiva y ocultar los formatos técnicos al usuario:** No exponer jamás identificadores internos (IDs/UUIDs), códigos de base de datos ni pedir escribir manualmente fechas en formato `AAAA-MM-DD` o ISO 8601; ofrecer siempre calendarios visuales y selectores de horario con formato localizado legible y conversión interna hacia el backend.
4. **Ser genuinamente responsive en Android, iOS y Web y preservar las funciones compartidas:** Respetar las particularidades de Yoga en nativo y Flexbox en web desde `320 px` hasta `1440 px`, garantizando que las entradas QR, compras y notificaciones permanezcan accesibles en todo momento para cualquier combinación de roles.
5. **Respetar la accesibilidad (WCAG 2.2 AA):** Mantener ratios de contraste `>= 4.5:1` en texto normal y `>= 3:1` en texto grande y controles, áreas táctiles mínimas (`48x48 dp` / `44x44 pt`), etiquetas accesibles completas, operación por teclado y soporte para movimiento reducido (`prefers-reduced-motion`).
6. **Medir antes de optimizar y mantener compatibilidad estricta con el stack actual:** Aplicar optimizaciones de rendimiento únicamente tras medir el estado actual, identificar un cuello de botella real y volver a medir después (especificando siempre la invalidación cuando exista caché), sin introducir librerías ni infraestructura innecesaria en React `19.2.3`, React Native `0.86.3` y Expo SDK `57`.
7. **Respetar la autoridad transaccional del backend:** En retenciones temporales (`HOLD` de 15 minutos) y compras, el indicador del frontend es estrictamente informativo y nunca puede extender el tiempo; la expiración real, el bloqueo de filas y la consistencia ante condiciones de carrera residen exclusivamente en el backend y MySQL.
8. **Ser técnicamente sostenible y limpia:** Código tipado estrictamente en TypeScript (`tsc --noEmit` sin errores), sin duplicación de lógica y con componentes cohesivos.
9. **Tener validación reproducible:** Cada etapa debe pasar el 100 % de las pruebas automatizadas (`npm run check`, `npm --prefix backend test`, `test:e2e`, `test:ui`, `test:a11y`), las pruebas de borde (como el pago al límite del `HOLD`) y las verificaciones físicas en APK.
10. **Poder justificarse académicamente con rigor metodológico:** Diferenciar claramente investigación exploratoria, pruebas de usabilidad formativas (iniciando con 5 participantes sin atribuirles representatividad estadística) y validación cuantitativa, respaldando cada decisión en evidencia verificable.
