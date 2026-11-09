# Diagnóstico Funcional Integral de Nuestro Proyecto Venti

**Fecha:** Etapa 3 — Auditoría de Código Real y Experiencia en Dispositivo Móvil (APK)  
**Alcance:** Frontend (`frontend/src/`, `frontend/app/`), Backend (`backend/src/`), Base de Datos (`database/venti_mvp_mysql84.sql`) y Documentación.

---

## 1. Estado funcional general

Tras inspeccionar la totalidad del repositorio y contrastarlo con la prueba física del APK y el relevamiento de Venti Oficial, el diagnóstico general de nuestro proyecto es el siguiente:

- **Backend y Base de Datos (MySQL 8.4):** Se encuentran en un estado **maduro, completo y transaccionalmente robusto**. Los 12 repositorios (`backend/src/repositories/`), los procedimientos almacenados (`sp_create_purchase`, `sp_confirm_purchase`, `sp_cancel_purchase`, `sp_validate_ticket_qr`) y las transacciones con bloqueos de fila (`FOR UPDATE` / `LOCK IN SHARE MODE`) cubren íntegramente el ciclo de vida de usuarios, roles, conciertos, entradas, códigos QR, perfiles artísticos, propuestas de contratación, marketplace de espacios, reservas temporales (*HOLD*), presupuestos, empresas de servicios técnicos, notificaciones, estadísticas y auditoría.
- **Frontend (Expo / React Native + Web):** Todas las pantallas principales existen y se comunican con la API real, pero presentan **cuatro problemas estructurales** que degradan severamente la experiencia de uso en el APK móvil:
  1. **Ruptura de flujos por colapso de roles (`primaryRole`) y pantallas inconclusas (`ProfilesScreen.tsx`).**
  2. **Superposición de tarjetas y elementos en pantallas móviles**, originada principalmente por el uso de `height: "100%"` dentro de contenedores `BentoGrid` con `flexDirection: "row", flexWrap: "wrap"` y badges en posición absoluta sin truncamiento en `MusicalCover`.
  3. **Baja intuición y alta fricción de carga de datos**, obligando al usuario a escribir fechas en formato ISO 8601 (`2027-06-10T23:00:00Z`), horarios codificados por línea (`1 10:00-23:00`) y selectores inline que muestran IDs crudos en el botón.
  4. **Identidad cromática dominada por el azul/índigo (`#4338CA` / `#4F46E5`)**, que debe abandonarse en la siguiente etapa en favor de una paleta musical y nocturna más atrevida y armoniosa.

### 1.1. Matriz maestra de clasificación por aspecto inspeccionado

Escala obligatoria aplicada:
- `Implementada y funcional.`
- `Implementada parcialmente.`
- `Implementada, pero con problemas.`
- `No implementada.`
- `No verificable.`

| # | Aspecto inspeccionado | Clasificación | Resumen de verificación en código |
| :--- | :--- | :--- | :--- |
| 1 | **Registro e inicio de sesión** | **Implementada y funcional.** | Login, registro, invitado, Google OAuth, verificación de email, recupero de clave y rotación de refresh tokens operativos (`AuthScreen.tsx`, `mysql.repository.js`). |
| 2 | **Roles y permisos** | **Implementada, pero con problemas.** | El backend soporta múltiples roles aditivos y 23 permisos, pero el frontend reduce todo a `primaryRole(auth.roles)` sin selector de rol activo, y `AdminUser` (`UsersScreen.tsx`) reemplaza todos los roles (`replace: true`). |
| 3 | **Exploración de eventos** | **Implementada, pero con problemas.** | Cartelera (`/search`), detalle (`/concerts/[id]`) y recomendador (`/discover`) conectados a API, pero con superposición de tarjetas en móvil (`ConcertCard`), fechas ISO manuales y `Select` con IDs crudos. |
| 4 | **Compra y gestión de entradas** | **Implementada y funcional.** | Compra directa con tarjeta simulada (`ConcertDetail.tsx`), órdenes pendientes (`PurchasesScreen.tsx`), confirmación y cancelación con reembolso simulado (`commerce.repository.ts`). |
| 5 | **Códigos QR** | **Implementada y funcional.** | Generación SVG (`TicketsScreen.tsx`) y escaneo con cámara nativa (`expo-camera`) o token manual en puerta (`StaffScreen.tsx` + `sp_validate_ticket_qr`). |
| 6 | **Perfiles** | **Implementada parcialmente.** | `ProfileScreen.tsx` edita datos básicos (`PATCH /me`), pero `ProfilesScreen.tsx` (`/profiles`) **no tiene botones para activar perfiles self-service (`POST /me/profiles`) ni solicitar perfiles (`POST /me/profile-requests`)**, y tampoco hay enlace a `/profiles` en la UI. |
| 7 | **Funciones para artistas** | **Implementada y funcional.** | ABM de perfiles artísticos, publicación/archivo, miembros (`OWNER`/`MEMBER`), perfil público (`/artist/[id]`), recepción de propuestas y postulación a espacios (`ArtistsScreen.tsx`). |
| 8 | **Funciones para organizadores** | **Implementada y funcional.** | Creación/edición/publicación/cancelación de conciertos, cartel de artistas (`ArtistPicker`), tipos de entrada (`TicketEditor`), asignación de staff (`StaffPanel`), propuestas a artistas y estadísticas (`ConcertEditor.tsx`, `StatisticsScreen.tsx`). |
| 9 | **Gestión de espacios** | **Implementada y funcional.** | Organizaciones, miembros, establecimientos (con aprobación admin), salas (`venues`), fotos, comodidades, horarios, bloqueos y panel de artistas/organizadores (`ManageScreen.tsx`, `ServicesScreen.tsx`). |
| 10 | **Reservas** | **Implementada y funcional.** | Disponibilidad por franja (`SETUP`/`EVENT`/`TEARDOWN`), reserva temporal (`HOLD`), pago simulado, decisión del espacio (`accept`/`reject`), cancelación e historial (`ReservationsScreen.tsx`). |
| 11 | **Propuestas y presupuestos** | **Implementada y funcional.** | Contratación artística en 3 direcciones (`ProposalScreen.tsx`), presupuestos de espacios (`QuotesScreen.tsx`) y cotizaciones de servicios técnicos (`ServiceQuotesScreen.tsx`). |
| 12 | **Notificaciones** | **Implementada y funcional.** | Bandeja paginada, contador no leídas en cabecera, marcar leída individual/total, switch de *Venti Discover* y navegación directa al recurso (`NotificationsScreen.tsx`, `notificationTarget.ts`). |
| 13 | **Administración** | **Implementada y funcional.** | Gestión de usuarios, solicitudes de perfil, suspensión, auditoría, organizaciones, verificación de empresas de servicios, moderación de establecimientos, estadísticas globales y catálogos (`AdminScreen.tsx`, `UsersScreen.tsx`). |
| 14 | **Navegación** | **Implementada, pero con problemas.** | `Shell.tsx` oculta rutas clave según `primaryRole`, carece de conmutador de rol, deja rutas huérfanas (`/profiles`, `/artists` para organizadores) y duplica `/discover` con `/recommendations`. |
| 15 | **Diseño responsive** | **Implementada, pero con problemas.** | Tarjetas con `height: "100%"` en grillas `flexWrap: "wrap"` se superponen en móviles Android; badges absolutos colisionan en `MusicalCover`; selectores inline rompen el flujo. |
| 16 | **Estados de carga, error y vacío** | **Implementada y funcional.** | Cubiertos sistemáticamente mediante `ResourceState`, `ActionFeedback` y `Notice` (`frontend/src/components/ui/index.tsx`). |

---

## 2. Funcionalidades completas (`Implementada y funcional.`)

Las siguientes funcionalidades tienen su flujo extremo a extremo (UI → API → Base de Datos → Notificación/Auditoría) completamente conectado y operativo:

1. **Autenticación y seguridad de sesión (`AuthScreen.tsx`, `AuthContext.tsx`, `mysql.repository.js`):**
   - Registro con validación de contraseña fuerte, login con email/clave, ingreso rápido como **Invitado** (`POST /auth/guest`), login con **Google OAuth** (`/auth/oauth/google`), cierre de sesión, verificación de correo electrónico (`/auth/verify-email`) y restablecimiento de contraseña (`/auth/forgot-password` y `/auth/reset-password`).
2. **Ciclo completo de compra de entradas y reembolsos simulados (`ConcertDetail.tsx`, `PurchasesScreen.tsx`, `commerce.repository.ts`):**
   - Validación de ventana de venta, cupo disponible y máximo por compra mediante `sp_create_purchase`.
   - Dos modalidades de pago simulado: pago inmediato con validación de formato de tarjeta (16 dígitos, MM/AA, CVV en `purchaseAttempt.ts`) desde la ficha del concierto, o pago diferido/cancelación desde `/purchases/[id]`.
   - Cancelación de compras confirmadas con reversión de stock, anulación de tickets (`CANCELLED`) y registro de reembolso simulado (`REFUNDED`).
3. **Pases digitales QR y control de acceso en puerta (`TicketsScreen.tsx`, `StaffScreen.tsx`, `participation.repository.ts`):**
   - Renderizado de QR por cada entrada válida en `/tickets`.
   - Selección de concierto asignado en `/staff`, escaneo mediante cámara nativa (`CameraView` de `expo-camera`) o ingreso manual/lector USB (`POST /tickets/validate`), mensajes claros por estado (`VALID`, `ALREADY_USED`, `CANCELLED`, `WRONG_CONCERT`) y listado paginado de asistentes con marca de hora de ingreso (`used_at`).
4. **Gestión de perfiles artísticos y contrataciones (`ArtistsScreen.tsx`, `ProposalScreen.tsx`, `artists.repository.ts`):**
   - Creación, edición, publicación y archivo de perfiles de artista (`/artists` y `/artists/[id]`), administración de miembros (`OWNER` / `MEMBER`), vista pública (`/artist/[id]`) con separación de shows próximos y pasados.
   - Tres flujos de propuestas conectados a notificaciones: Organizador → Artista (`ORGANIZER_TO_ARTIST`), Espacio Físico → Artista (`VENUE_TO_ARTIST`) y Artista → Espacio Físico (`ARTIST_TO_VENUE`), con aceptación, rechazo fundamentado y cancelación.
5. **Producción de conciertos para organizadores (`ConcertEditor.tsx`, `management.repository.ts`):**
   - Creación en borrador (`DRAFT`), asociación de reserva confirmada de espacio (`reservation_id`), ordenamiento de artistas en el cartel (`ArtistPicker`), ABM de tipos de entrada (`TicketEditor`), asignación de staff de puerta (`StaffPanel`), publicación (`PUBLISHED`) y cancelación (`CANCELLED` con reembolso automático a compradores y aviso en bandeja).
6. **Marketplace de espacios físicos, disponibilidad, presupuestos y reservas (`MarketplaceScreen.tsx`, `VenueScreen.tsx`, `ManageScreen.tsx`, `QuotesScreen.tsx`, `ReservationsScreen.tsx`, `marketplace.repository.ts`):**
   - Alta de organizaciones, establecimientos (con moderación administrativa `PENDING_REVIEW -> PUBLISHED`), salas (`venues`), comodidades, fotos, horarios y bloqueos operativos (`MAINTENANCE`, `PRIVATE_USE`, `HOLIDAY`, `OTHER`).
   - Verificación de disponibilidad contemplando fases de `SETUP`, `EVENT` y `TEARDOWN`, reservas directas en `HOLD` (15 minutos) con pago simulado y aprobación del espacio, y flujo completo de presupuestos cotizados por ítems (`/marketplace/quotes`).
7. **Directorio de empresas de servicios técnicos y cotizaciones (`ServicesScreen.tsx`, `ProvidersScreen.tsx`, `ServiceQuotesScreen.tsx`, `services.repository.ts`):**
   - Gestión de empresas proveedoras (`/services/mine`), catálogo de prestaciones técnicas por unidad de cobro (`HOUR`, `DAY`, `EVENT`, `UNIT`, `QUOTE`), consulta de horarios ya contratados y flujo de solicitud, cotización por renglones, aceptación y cancelación (`/services/quotes`).
8. **Bandeja de notificaciones y preferencias (`NotificationsScreen.tsx`, `NotificationPreference.tsx`, `notifications.repository.ts`):**
   - Listado paginado con estado leído/no leído, badge global en barra superior/inferior, marcado masivo o individual y redirección inteligente al recurso asociado (`notificationTarget.ts`).
9. **Administración, moderación, estadísticas y auditoría (`AdminScreen.tsx`, `UsersScreen.tsx`, `OrganizationsScreen.tsx`, `EstablishmentsReviewScreen.tsx`, `StatisticsScreen.tsx`, `StatisticsCharts.tsx`):**
   - Moderación de solicitudes de perfil (`/admin/profile-requests`) y de establecimientos (`/marketplace/establishments/pending`), verificación oficial de empresas de servicios, suspensión/reactivación de cuentas con cierre de sesión inmediato, ABM de catálogos (`genres`, `provinces`, `districts`, `cities`), gráficos SVG de ventas/ocupación y log de auditoría filtrable (`/admin/audit`).
10. **Estados de carga, error y vacío (`frontend/src/components/ui/index.tsx`):**
    - Implementados de forma consistente en todas las vistas mediante `ResourceState` y `ActionFeedback`.

---

## 3. Funcionalidades parciales o con problemas (`Implementada parcialmente.` / `Implementada, pero con problemas.`)

### 3.1. Autogestión y solicitud de perfiles de usuario (`Implementada parcialmente.`)
- **Archivos involucrados:** `frontend/src/features/auth/ProfilesScreen.tsx` (líneas 1–61) y `frontend/src/features/auth/ProfileScreen.tsx` (líneas 1–138).
- **Qué existe en el backend:** `backend/src/repositories/admin.repository.ts` (líneas 293–509) implementa completamente `GET /me/profiles` (devolviendo `active`, `self_service`, `requestable` y `requests`), `POST /me/profiles` (para activar roles de autogestión como `ARTISTA` o `COMPRADOR`) y `POST /me/profile-requests` (para solicitar a un administrador roles como `ORGANIZADOR`, `VENUE` o `EMPRESA_SERVICIOS`).
- **Qué falta en el frontend:**
  - `ProfilesScreen.tsx` realiza `useResource<SelfProfiles>("/me/profiles")`, pero **descarta por completo `self_service`, `requestable` y `requests`**: solo muestra un texto estático describiendo el `primaryRole` actual. No existe ningún botón en el frontend que llame a `POST /me/profiles` ni a `POST /me/profile-requests`.
  - Además, `ProfileScreen.tsx` ni siquiera incluye un botón o enlace para navegar hacia `/profiles`.

### 3.2. Modelo de roles y permisos en el frontend (`Implementada, pero con problemas.`)
- **Archivos involucrados:** `frontend/src/types/api.ts` (líneas 69–85), `frontend/src/components/layout/Shell.tsx` (líneas 116–190) y `frontend/src/features/admin/UsersScreen.tsx` (líneas 223–237).
- **Problema:**
  - Mientras la base de datos (`user_roles`) y el backend permiten que una cuenta posea varios roles simultáneamente (por ejemplo, `COMPRADOR` + `ARTISTA`), el frontend utiliza `primaryRole(auth.roles)` con una jerarquía rígida (`ADMIN > ORGANIZADOR > VENUE > EMPRESA_SERVICIOS > ARTISTA > COMPRADOR`).
  - No existe un selector de "Rol activo / Vista actual" en `Shell.tsx`, y en el panel de administración (`UsersScreen.tsx` línea 227) el cambio de rol envía `{ replace: true }`, sobrescribiendo los demás roles del usuario.

### 3.3. Navegación global y rutas huérfanas (`Implementada, pero con problemas.`)
- **Archivos involucrados:** `frontend/src/components/layout/Shell.tsx` (líneas 116–190) y `frontend/app/(app)/(tabs)/recommendations.tsx`.
- **Problema:**
  - Cuando un usuario tiene como rol principal `ARTISTA`, `ORGANIZADOR`, `VENUE`, `EMPRESA_SERVICIOS` o `ADMIN`, `linksForRole` en `Shell.tsx` **elimina de su barra de navegación los accesos a `"Mis entradas"` (`/tickets`) y `"Mis compras"` (`/purchases`)**, a pesar de que cualquier usuario autenticado puede comprar entradas desde `/concerts/[id]`.
  - Los roles `VENUE` y `EMPRESA_SERVICIOS` ni siquiera tienen el enlace `"Descubrir"` (`/discover`) en su menú principal.
  - Para el rol `COMPRADOR`, el menú muestra tanto `"Descubrir"` (`/discover`) como `"Venti Discover"` (`/recommendations`), pero `frontend/app/(app)/(tabs)/recommendations.tsx` exporta exactamente el mismo componente `DiscoverScreen` que `/discover`, generando dos ítems de menú duplicados que llevan a la misma pantalla.

### 3.4. Exploración de eventos y diseño responsive (`Implementada, pero con problemas.`)
- Detallados en profundidad en las Secciones 5, 6 y 7 de este documento.

---

## 4. Funcionalidades ausentes (`No implementada.` / `No verificable.`)

1. **Funcionalidades comerciales propias de Venti Oficial (`No implementada.` por alcance del MVP académico):**
   - Pasarela de cobro real (Mercado Pago / procesadores bancarios reales): en nuestro proyecto los pagos y reembolsos son explícitamente simulados (`is_simulated = 1`).
   - Sistema de atribución y comisiones por links de **RRPPs / Públicas**.
   - Venta de **Mesas VIP / Camarotes** con plano interactivo y venta de combos de bebidas/consumiciones.
   - Mercado secundario oficial de reventa de entradas (**Venti Swap**) y transferencia nominal de entradas entre cuentas.
2. **Subida nativa de archivos/imágenes desde cámara o galería (`No implementada.`):**
   - Todas las imágenes de conciertos, artistas, espacios y servicios (`image_url`, `logo_url`, `photos`) se cargan pegando URLs externas (`https://...`) en campos de texto, sin selector de galería (`expo-image-picker`) ni almacenamiento multipart/cloud.
3. **Notificaciones Push nativas en segundo plano (`No implementada.`):**
   - Las notificaciones funcionan dentro de la aplicación (`NotificationsScreen` + polling/recarga de `NotificationsContext`), sin integración con Firebase Cloud Messaging (FCM) o APNs.
4. **Flujos internos autenticados de Venti Oficial (`No verificable.`):**
   - Conforme a las reglas de la auditoría, no se iniciaron sesiones autenticadas en `venti.com.ar`.

---

## 5. Problemas detectados (Lógica de UI, Flujos y Consistencia)

1. **Pantalla `/profiles` desconectada y sin acciones (`frontend/src/features/auth/ProfilesScreen.tsx`):**
   - Aunque el administrador tiene en `/admin/users` el panel `ProfileRequestsPanel` para aprobar solicitudes de perfil (`GET /admin/profile-requests`), ningún usuario puede enviar esas solicitudes desde la app porque `ProfilesScreen.tsx` nunca renderiza el formulario hacia `POST /me/profile-requests` ni el activador hacia `POST /me/profiles`.
2. **Pérdida de acceso a Entradas (`/tickets`) y Compras (`/purchases`) para roles no-COMPRADOR (`frontend/src/components/layout/Shell.tsx` líneas 116–190):**
   - En `ConcertDetail.tsx` (línea 198), el formulario de compra se muestra a cualquier usuario autenticado (`auth.user`), sin importar su rol. Si un usuario con rol `ARTISTA` u `ORGANIZADOR` compra una entrada, puede pagar y emitir su QR, pero luego **no tiene el tab `"Mis entradas"` ni `"Mis compras"` en la navegación** para volver a ver su código QR.
3. **Duplicación de ruta `/discover` y `/recommendations` (`Shell.tsx` líneas 121 y 127):**
   - `frontend/app/(app)/(tabs)/discover.tsx` y `frontend/app/(app)/(tabs)/recommendations.tsx` renderizan ambos `DiscoverScreen.tsx`. En la vista de `COMPRADOR`, aparecen dos pestañas distintas (`"Descubrir"` y `"Venti Discover"`) con idéntico contenido.
4. **Inconsistencia en el flujo de pago simulado entre Compras de Entradas y Reservas de Espacios:**
   - En `ConcertDetail.tsx` y `PurchasesScreen.tsx` se exige completar número de tarjeta simulada de 16 dígitos, vencimiento `MM/AA` y `CVV` (`validateSimulatedCard`), mientras que en `ReservationsScreen.tsx` (líneas 152–166) se muestran dos botones directos (`"Simular pago aprobado"` / `"Simular pago rechazado"`).
5. **Rechazo rápido de propuestas sin permitir escribir motivo en listados resumidos:**
   - En `ProposalScreen.tsx` (línea 156) el usuario puede escribir el motivo del rechazo, pero en los listados de `ArtistsScreen.tsx` (`ArtistProposalsPanel`, línea 259) y `ManageScreen.tsx` (`VenueHiringsPanel`, línea 496) el botón `"Rechazar"` envía un motivo fijo hardcodeado (`"No contamos con disponibilidad en esa fecha."`) sin confirmación previa.

---

## 6. Problemas de usabilidad (UX) y hallazgos de la prueba física del APK

La prueba física del APK reveló que **la aplicación resulta poco intuitiva** para el usuario. El análisis del código explica exactamente por qué ocurre esto:

1. **Exigencia de fechas en formato técnico ISO 8601 (`AAAA-MM-DDTHH:MM:SSZ`):**
   - En el filtro de cartelera (`ConcertList.tsx` líneas 273 y 278) se pide al usuario escribir `"Desde (ISO, ej. 2027-01-01T00:00:00Z)"`.
   - En el editor de conciertos (`ConcertEditor.tsx` líneas 30–38, 270, 277, 567, 568) se exige escribir `"Inicio (ISO con zona horaria)"` (`2027-06-10T23:00:00Z`) tanto para el show como para las ventanas `sale_start` y `sale_end` de cada entrada. Ningún usuario final ni productor musical escribe fechas en formato ISO UTC manualmente en un teléfono móvil.
2. **Componente `Select` poco intuitivo que muestra IDs crudos y se expande inline (`frontend/src/components/ui/Select.tsx` líneas 33–76):**
   - El botón del selector construye su título con `values.join(", ")` (línea 36: `title={`${label}${values.length ? ` (${values.join(", ")})` : ""}`}`). Cuando el usuario elige una ciudad o un género, el botón muestra el **ID interno** (por ejemplo, `Ciudad (4)` o un UUID) en lugar del nombre legible (`Ciudad (Mar del Plata)`).
   - Además, al abrirse, despliega un `<Card>` completo con buscador y paginador incrustado dentro de la misma fila (`styles.row`), desplazando y comprimiendo los campos vecinos.
3. **Carga de horarios de apertura mediante sintaxis cruda por línea (`ManageScreen.tsx` líneas 687–691 y 752):**
   - Para configurar los horarios de una sala, el usuario debe escribir en un `TextInput` multilínea códigos como `"1 10:00-23:00"` sabiendo que `1=Lunes ... 7=Domingo`. Cualquier error de espacio o guion arroja una excepción.
4. **Selección de cantidad de entradas con teclado numérico en lugar de botones `-` / `+` (`ConcertDetail.tsx` líneas 213–223):**
   - Para comprar entradas, cada tipo de ticket muestra un `<Field keyboardType="number-pad" />` vacío en lugar de un selector táctil `- 0 +`.
   - Además, el formulario de tarjeta de crédito aparece siempre desplegado al pie de la ficha del concierto antes siquiera de haber elegido cuántas entradas comprar, alargando innecesariamente la pantalla.
5. **Verificación de email y reseteo de clave con pegado manual de token (`AuthScreen.tsx` líneas 180–187):**
   - En dispositivos móviles, si el usuario abre la pantalla de verificar email o restablecer contraseña desde la app sin venir de un deep link, se le muestra un campo obligatorio `"Token"` donde debe copiar y pegar un hash hexadecimal de 64 caracteres.
6. **Exceso de paneles simultáneos en una misma pantalla (`ManageScreen.tsx`, `ConcertEditor.tsx`, `ArtistsScreen.tsx`):**
   - En lugar de organizar las tareas en pestañas limpias, pasos (*wizards*) o modales (*bottom sheets*), las pantallas de gestión apilan formularios de organizaciones, miembros, establecimientos, salas, bloqueos y contrataciones en un único scroll vertical extenso.

---

## 7. Problemas responsive y de diseño visual (Superposición de tarjetas en móviles)

En la prueba física del APK se detectó como problema prioritario que **existen tarjetas que se superponen con otros elementos en dispositivos móviles**, además de la necesidad de **abandonar el color azul/índigo dominante**. A continuación se identifican con precisión todos los componentes y pantallas responsables:

### 7.1. Causa raíz #1 de superposición de tarjetas en móviles: `Card` con `height: "100%"` dentro de `BentoGrid` (`flexWrap: "wrap"`)

En `frontend/src/components/ui/index.tsx` (líneas 231–244), `BentoGrid` se define como un contenedor `View` con `flexDirection: "row"` y `flexWrap: "wrap"`. En React Native (especialmente bajo el motor de layout Yoga en Android), cuando un hijo envuelto al 100 % de ancho (`flexBasis: mobile ? "100%" : ...`) contiene un `<Card style={{ height: "100%", justifyContent: "space-between" }}>`, `height: "100%"` intenta resolver su altura respecto del contenedor padre `row` envuelto en lugar de su propio contenido, provocando que la tarjeta colapse su caja de layout o desborde verticalmente **superponiéndose sobre la tarjeta de la fila siguiente**.

**Pantallas y componentes exactos afectados por este bug:**
1. **Cartelera y búsqueda de conciertos (`frontend/src/features/concerts/ConcertList.tsx`, línea 55):**
   - Componente `ConcertCard` (`<Card variant={...} style={{ height: "100%", justifyContent: "space-between" }}>`). Afecta a `/search`, `/organizer`, `/admin/concerts`, `/discover` y `/artist/[id]`.
2. **Mosaicos de estadísticas (`frontend/src/components/ui/index.tsx`, línea 400):**
   - Componente `StatTile` (`<Card variant={...} style={{ height: "100%", justifyContent: "space-between" }}>`). Afecta a `/organizer/statistics` y `/admin/statistics` (`StatisticsScreen.tsx`).
3. **Listado de compras (`frontend/src/features/purchases/PurchasesScreen.tsx`, línea 66):**
   - Tarjetas de órdenes en `PurchasesScreen`.
4. **Panel de artistas y propuestas (`frontend/src/features/artists/ArtistsScreen.tsx`, líneas 119 y 202):**
   - Tarjetas de perfiles artísticos y tarjetas de propuestas en `ArtistProposalsPanel`.
5. **Marketplace de espacios, presupuestos y reservas:**
   - `VenueCard` en `frontend/src/features/marketplace/MarketplaceScreen.tsx` (línea 44) y `ManageScreen.tsx` (línea 672, donde además debajo del `VenueCard` con `height: "100%"` se renderiza un `<View style={styles.row}>` con botones de editar/publicar dentro del mismo contenedor, causando que el `VenueCard` pise los botones inferiores).
   - Tarjetas de presupuestos en `frontend/src/features/marketplace/QuotesScreen.tsx` (línea 109).
   - Tarjetas de reservas en `frontend/src/features/marketplace/ReservationsScreen.tsx` (línea 66).
6. **Catálogo de servicios técnicos y cotizaciones:**
   - `OfferingCard` y `ProviderCard` en `frontend/src/features/services/ServicesScreen.tsx` (líneas 49 y 78) y `ProvidersScreen.tsx` (línea 329, donde al igual que en `ManageScreen`, `OfferingCard` tiene `height: "100%"` y comparte celda con una fila de botones debajo, superponiéndose con ellos).
   - Tarjetas de cotizaciones en `frontend/src/features/services/ServiceQuotesScreen.tsx` (línea 61).
7. **Control de acceso / Staff (`frontend/src/features/staff/StaffScreen.tsx`, línea 83):**
   - Tarjetas de conciertos asignados en `StaffScreen`.

### 7.2. Causa raíz #2 de superposición en móviles: Badges absolutos en `MusicalCover` (`frontend/src/components/ui/index.tsx`, líneas 559–603)

En `MusicalCover`, los badges superiores (`badge` a la izquierda y `subBadge` a la derecha) están posicionados con `position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between"` sin `flexShrink: 1` ni `numberOfLines={1}`.
- En `ConcertDetail.tsx` (línea 161), se pasa `subBadge={concert.genres.map((g) => g.name).join(" · ")}`. Cuando un concierto tiene 2 o más géneros o el nombre de la categoría/ciudad es largo en una pantalla móvil de 360px de ancho, **el `subBadge` colisiona y se superpone con el `badge` izquierdo** sobre la portada.

### 7.3. Causa raíz #3 de problemas responsive: Filas (`styles.row`) con campos e ítems sin ancho mínimo controlado

- En `QuotesScreen.tsx` (línea 230) y `ServiceQuotesScreen.tsx` (línea 196), cada renglón de cotización coloca 3 `<Field>` (`Ítem`, `Cantidad`, `Precio unitario`) dentro de un mismo `styles.row` (`flexDirection: "row", flexWrap: "wrap"`), pero `Field` no tiene `flex: 1` ni `minWidth` por defecto (`index.tsx` línea 746), por lo que en móvil los inputs quedan de anchos irregulares o truncados.
- En `Shell.tsx` (líneas 241–273), la cabecera móvil muestra el logo, el botón de tema, el nombre del usuario (`maxWidth: 110`) y el botón `"Salir"`. En pantallas angostas (< 360px), la barra superior queda comprimida.
- En `StatisticsCharts.tsx` (líneas 27, 65, 77), los gráficos SVG utilizan un `viewBox="0 0 640 240"` con 14 barras y etiquetas de texto que en pantallas verticales móviles se reducen a un tamaño difícil de leer.

### 7.4. Identidad cromática actual: Dominancia del azul/índigo que debe reemplazarse

- **Archivos involucrados:** `frontend/src/components/ui/palette.ts` (líneas 1–46) y `frontend/src/components/ui/index.tsx` (líneas 479–554 y 594).
- **Estado actual:** La paleta está definida bajo el nombre *"Electric Stage Indigo"*, usando `#4338CA` / `#4F46E5` / `#A5B4FC` como acento principal, bordes acentuados (`#C7D2FE` / `#312E81`), fondos destacados (`#F5F7FF` / `#131629`) y degradados SVG hardcodeados en tonos índigo (`#1E1B4B`, `#4F46E5`, `#818CF8`) dentro de `MusicalCover`.
- **Directriz para la siguiente etapa:** Abandonar por completo el azul/índigo como color dominante y diseñar una paleta más atrevida, vinculada a conciertos, escenarios y música en vivo, manteniendo armonía estética y contraste accesible tanto en modo oscuro (prioritario para la estética de shows en vivo) como en modo claro.

---

## 8. Diferencias relevantes respecto de Venti Oficial (`venti.com.ar`)

| Dimensión | Venti Oficial (`venti.com.ar`) | Nuestro Proyecto Venti |
| :--- | :--- | :--- |
| **Foco del producto** | Ticketera comercial B2C/B2B centrada en venta de accesos, mesas VIP, consumiciones, RRPPs y reventa *Venti Swap*. | Ecosistema integral de música en vivo: Ticketing + Catálogo y Contratación de Artistas + Marketplace de Espacios Físicos + Servicios Técnicos. |
| **Separación de portales** | El comprador usa una web/app B2C ultra simple; organizadores y staff usan herramientas B2B separadas. | Los 6 roles conviven en una única app multiplataforma, lo que exige una arquitectura de navegación y conmutación de rol mucho más clara. |
| **Experiencia de compra** | Steppers `-` / `+`, desglose de cargo por servicio, checkout guiado en pasos y pasarela real. | Cantidad por input de texto, formulario de tarjeta simulada incrustado en la misma ficha del concierto o en el detalle de orden. |
| **Diseño visual y responsive** | Estética nocturna *dark-first*, tarjetas limpias centradas en el póster del evento, sin solapamientos en móvil. | Estética azul/índigo de corte corporativo/SaaS, tarjetas recargadas de metadatos y bug de superposición en móvil por `height: "100%"`. |

---

## 9. Recomendaciones priorizadas para la etapa de rediseño y mejoras

### Prioridad 1 — Corrección crítica de Layout Responsive y Superposición de Tarjetas (Mobile-First)
1. **Eliminar `height: "100%"` de las tarjetas dentro de `BentoGrid`** en `ConcertList.tsx`, `ui/index.tsx` (`StatTile`), `PurchasesScreen.tsx`, `ArtistsScreen.tsx`, `MarketplaceScreen.tsx`, `ManageScreen.tsx`, `QuotesScreen.tsx`, `ReservationsScreen.tsx`, `ServicesScreen.tsx`, `ProvidersScreen.tsx`, `ServiceQuotesScreen.tsx` y `StaffScreen.tsx`, permitiendo que en móvil cada tarjeta tome su altura natural y en desktop se alinee mediante flexbox sin colisionar con elementos hermanos.
2. **Corregir los badges de `MusicalCover` (`ui/index.tsx`)** agregando `flexShrink: 1` y `numberOfLines={1}` con `ellipsizeMode="tail"` para evitar que listas largas de géneros o nombres de categorías se superpongan.
3. **Transformar el componente `Select` (`ui/Select.tsx`)** en un modal o desplegable limpio que muestre los **nombres legibles** de los ítems seleccionados (y no sus IDs crudos) sin romper la grilla donde está inserto.

### Prioridad 2 — Navegación Multi-Rol y Completitud del Flujo de Perfiles
1. **Conectar y completar `ProfilesScreen.tsx` (`/profiles`)** para que muestre:
   - Los perfiles activos de la cuenta.
   - Los botones para activar inmediatamente perfiles `self_service` (`POST /me/profiles`).
   - El formulario para solicitar perfiles `requestable` (`POST /me/profile-requests`) y el estado de las solicitudes enviadas (`requests`), añadiendo además un acceso directo desde `ProfileScreen.tsx`.
2. **Reestructurar la navegación en `Shell.tsx`:**
   - Incorporar un **selector de rol activo (Role Switcher)** cuando el usuario posea más de un rol o preservar siempre el acceso a `"Mis entradas"` (`/tickets`), `"Mis compras"` (`/purchases`) y `"Descubrir"` (`/discover`) desde el menú o desde el perfil.
   - Eliminar el enlace duplicado `/recommendations` cuando ya está presente `/discover`.

### Prioridad 3 — Simplificación de Usabilidad (UX) e Interacciones Intuitivas
1. **Reemplazar los inputs de fecha ISO manuales** en `ConcertList.tsx` y `ConcertEditor.tsx` por controles amigables de fecha (`AAAA-MM-DD`) y hora (`HH:MM`) en hora local de Argentina (reutilizando la lógica de `marketplace/time.ts` o selectores rápidos como *"Hoy"*, *"Este fin de semana"*, *"Este mes"*).
2. **Reemplazar el input de texto de cantidad de entradas en `ConcertDetail.tsx`** por botones táctiles `-` / `+` y mostrar el formulario de pago simulado recién en un segundo paso o modal de confirmación cuando el comprador haya elegido al menos 1 entrada.
3. **Simplificar la carga de horarios de apertura en `ManageScreen.tsx`** mediante selectores por día de la semana en lugar de exigir sintaxis `"1 10:00-23:00"` en un campo de texto libre.

### Prioridad 4 — Nueva Identidad Visual Musical (Abandono del Azul Dominante)
1. **Rediseñar `palette.ts` y los vectores de `MusicalCover` (`ui/index.tsx`)**, abandonando el azul/índigo (`#4338CA` / `#4F46E5`) en favor de una paleta audaz, cálida y escénica inspirada en conciertos y festivales en vivo (por ejemplo, combinaciones sobre fondos carbón/ónix profundos con acentos magenta eléctrico, coral/ámbar escénico o carmesí vibrante), garantizando contraste WCAG AA en modo oscuro y claro.

---

## 10. Veredicto sobre el inicio de la etapa de rediseño y mejoras

**VEREDICTO FINAL: SÍ, CONTAMOS CON INFORMACIÓN COMPLETA, VERIFICADA Y SUFICIENTE PARA COMENZAR LA ETAPA DE REDISEÑO Y MEJORAS.**

Todos los requerimientos funcionales, las diferencias con Venti Oficial, los flujos desconectados, las inconsistencias de roles, los problemas de usabilidad y los componentes exactos que provocan superposiciones en dispositivos móviles están completamente identificados y documentados a nivel de archivo y línea de código.

