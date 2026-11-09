# Auditoría Funcional: Venti Oficial (`venti.com.ar`) vs. Nuestro Proyecto Venti

**Fecha de auditoría:** Etapa 3 — Auditoría Funcional y Comparativa de Código Real  
**Objetivo:** Relevar de forma pública y pasiva la plataforma comercial `venti.com.ar` (sin sesiones autenticadas ni pruebas intrusivas) y contrastar sus funcionalidades con la implementación real de nuestro repositorio Venti (frontend Expo/React Native + Web, backend Node.js/Express/TypeScript y base de datos MySQL 8.4).

---

## 1. Resumen ejecutivo

1. **Venti Oficial (`venti.com.ar`)** es una ticketera comercial (SaaS B2C/B2B) orientada a la venta masiva de entradas digitales, mesas VIP, consumiciones y reventa oficial (*Venti Swap*) para fiestas, clubes nocturnos, festivales y conciertos en Argentina, Uruguay y Chile, con fuerte apalancamiento en redes de **RRPPs (públicas/promotores)** y pasarelas de pago reales.
2. **Nuestro proyecto Venti** trasciende el modelo de ticketera pura y construye un **ecosistema integral para la industria musical en vivo** con 6 roles (`COMPRADOR`, `ARTISTA`, `ORGANIZADOR`, `VENUE`, `EMPRESA_SERVICIOS`, `ADMIN`), abarcando:
   - Cartelera y venta de entradas con emisión de códigos QR y control de acceso en puerta (`StaffScreen`).
   - Recomendador personalizado (*Venti Discover*).
   - Catálogo de perfiles artísticos y **contrataciones bidireccionales** (`ORGANIZER_TO_ARTIST`, `VENUE_TO_ARTIST`, `ARTIST_TO_VENUE`).
   - **Marketplace de espacios físicos** (establecimientos, salas, disponibilidad horaria con armado/evento/desarme, bloqueos, reservas temporales *HOLD* y presupuestos).
   - **Directorio de empresas de servicios técnicos** (sonido, iluminación, seguridad, etc.) y flujo de cotizaciones.
   - **Panel administrativo y auditoría trazable** (`audit_logs`).
3. **Hallazgo crítico de la auditoría de código + prueba física del APK:** El backend y el modelo de datos de nuestro Venti son sólidos, completos y transaccionalmente seguros, pero **el frontend presenta problemas importantes de experiencia de usuario (UX), inconsistencias de navegación por roles y defectos de diseño responsive en dispositivos móviles** (incluyendo superposición de tarjetas, selectores inline que muestran IDs numéricos/UUIDs, campos de fecha que exigen formato ISO manual y pantallas desconectadas como `ProfilesScreen`). Asimismo, la identidad visual actual basada en azul/índigo (`#4338CA` / `#4F46E5`) deberá reemplazarse en la etapa de rediseño por una paleta más atrevida y musicalmente expresiva.

---

## 2. Alcance y limitaciones de la investigación

- **Sobre Venti Oficial (`venti.com.ar`):**
  - Se inspeccionaron únicamente las vistas públicas accesibles sin autenticación (`https://venti.com.ar/`, fichas públicas de eventos, centro de ayuda y modales públicos de acceso).
  - **Restricción cumplida:** No se crearon cuentas, no se iniciaron sesiones autenticadas, no se emitieron pagos ni se interactuó con endpoints privados de `venti.com.ar`. Todo flujo detrás de login en Venti Oficial se documenta de forma transparente como *"No verificable sin sesión autenticada en Venti Oficial"*.
- **Sobre nuestro proyecto Venti:**
  - Se auditó el **100 % del código fuente real** del repositorio: esquema y procedimientos SQL (`database/venti_mvp_mysql84.sql`), los 12 repositorios y servicios del backend (`backend/src/`), y todas las pantallas, contextos, componentes y rutas del frontend (`frontend/src/` y `frontend/app/`), incorporando además las observaciones de la **prueba física del APK en Android**.

---

## 3. Etapa A — Acceso público e inicio de Venti Oficial

- **Landing principal (`venti.com.ar`):**
  - Cabecera minimalista con logotipo Venti, buscador global en vivo (por nombre de evento, club o ciudad), selector de ubicación/país y botón de acceso (`Iniciar sesión / Registrarse`).
  - Carrusel hero superior con banners panorámicos de los eventos destacados de la semana.
  - Grilla limpia de tarjetas de eventos (póster vertical/cuadrado, título del evento, fecha resumida y nombre del venue/ciudad).
  - Pie de página con enlaces legales (Términos y Condiciones, Política de Privacidad, Botón de Arrepentimiento exigido por normativa argentina, Contacto y FAQ).
- **Navegación sin cuenta:**
  - Un visitante anónimo puede explorar el catálogo completo, buscar eventos y abrir la ficha pública de cualquier evento para consultar los lotes/tipos de entradas y sus precios antes de que se le solicite iniciar sesión.

---

## 4. Etapa B — Autenticación y cuentas en Venti Oficial

- **Flujos visibles públicamente en `venti.com.ar`:**
  - Inicio de sesión mediante correo electrónico y contraseña.
  - Inicio de sesión social con **Google (OAuth)** y **Apple**.
  - Registro de cuenta nueva solicitando datos personales e identificación documental (DNI / documento de identidad, obligatorio en ticketeras comerciales argentinas para prevenir fraude contracargo y vincular el QR nominativo).
  - Recuperación de contraseña por correo electrónico.
- **Diferencia con nuestro Venti:**
  - Nuestro Venti implementa registro/login propio con JWT + Refresh Token rotativo, verificación de email, recupero de contraseña, login con **Google OAuth** y además un **modo Invitado (`POST /auth/guest`)** explícito en `AuthScreen.tsx`, pero no solicita DNI en el registro.

---

## 5. Etapa C — Exploración y búsqueda de eventos en Venti Oficial

- **Búsqueda y filtros:**
  - Buscador predictivo en cabecera y filtros rápidos por ciudad/región y rango de fechas (Hoy, Este fin de semana, Próximos).
- **Tarjetas de eventos:**
  - Diseño altamente visual dominado por el flyer/arte del evento, badge de fecha, nombre del evento y lugar, sin sobrecargar la tarjeta con texto administrativo ni botones secundarios.
- **Ficha de detalle del evento:**
  - Portada/flyer principal, fecha y hora de apertura/cierre, nombre del venue con dirección y enlace a mapa, restricción de edad (+18 / +21), descripción del line-up y listado de sectores/tandas de entradas (*Early Bird*, *Tanda 1*, *General*, *VIP Standing*, *Mesas VIP*) con estado (*Disponible*, *Agotado*, *Próximamente*).

---

## 6. Etapa D — Flujo de entradas en Venti Oficial

- **Selección de tickets:**
  - En la ficha del evento, cada tanda muestra su precio unitario (+ cargo por servicio / *service charge* discriminado) y selectores de cantidad (`-` / `+`).
- **Tipos de productos comercializados en Venti Oficial:**
  - Entradas generales y VIP por tanda/lote.
  - **Mesas VIP / Camarotes** (con consumo incluido y cupo de personas).
  - **Combos de bebidas / consumiciones anticipadas** y estacionamiento.
  - **Venta por link de RRPP (Públicas):** atribución de la venta a un promotor específico mediante URL parametrizada.
- **Restricción de verificación:**
  - El checkout final, la pasarela de pago real (Mercado Pago / tarjetas de crédito/débito), la billetera de QR dinámicos post-compra, la transferencia nominal de entradas a otro usuario y el sistema de reventa secundaria oficial (**Venti Swap**) requieren sesión autenticada y pago real, por lo que quedan fuera de la inspección activa en Venti Oficial.

---

## 7. Etapa E — Perfil de usuario en Venti Oficial

- **Visible desde documentación pública y estructura de acceso:**
  - Sección *"Mis Entradas"* (acceso a los códigos QR de próximos eventos y eventos pasados).
  - Gestión de entradas transferidas o publicadas en *Venti Swap*.
  - Datos personales de la cuenta (nombre, email, teléfono, documento, fecha de nacimiento) y cierre de sesión.

---

## 8. Etapa F — Roles adicionales en Venti Oficial

- **Ecosistema B2B en Venti Oficial (externo al portal público de compradores):**
  - Venti Oficial separa la experiencia del comprador (`venti.com.ar`) del backoffice para **Productoras / Organizadores** y **RRPPs** (gestión de eventos, lotes, cortesías, links de promotor, liquidación de borderaux y app móvil independiente de control de acceso / escaneo QR en puerta).
  - **No posee en su web pública:** catálogo de artistas para contratación, marketplace de alquiler por hora de salas de ensayo/espacios físicos ni directorio de proveedores de sonido/iluminación.

---

## 9. Etapa G — Diseño y experiencia de usuario (UI/UX) en Venti Oficial

- **Estética nocturna y musical:**
  - Predominio de modo oscuro profundo (*dark mode* nativo de entretenimiento nocturno) con acentos vibrantes de alto contraste, tipografía geométrica moderna y gran protagonismo fotográfico de los flyers de cada show.
- **Jerarquía mobile-first:**
  - Tarjetas compactas, sin alturas forzadas que colisionen, botones de acción (`CTA`) fijos o claramente diferenciados, selectores táctiles (`+`/`-`) y mínima carga cognitiva por pantalla.

---

## 10. Etapa H — Mapa funcional de Venti Oficial

| Módulo en Venti Oficial | Alcance en `venti.com.ar` | Observabilidad pública |
| :--- | :--- | :--- |
| Cartelera y buscador público | Exploración de shows, fiestas y festivales por texto, fecha y ubicación | Verificado públicamente |
| Ficha de evento y tandas | Detalle de line-up, mapa, edad mínima, lotes de entradas, Mesas VIP y consumiciones | Verificado públicamente |
| Registro y Login (Email / Google / Apple) | Acceso de compradores con validación de identidad | Modal público verificado; sesión interna no verificable sin cuenta |
| Checkout con cargos por servicio y pasarela real | Pago con Mercado Pago / tarjetas y atribución por link de RRPP | No verificable sin sesión autenticada |
| Billetera de QRs, transferencia de tickets y *Venti Swap* | Gestión post-compra, envío de entradas a amigos y reventa oficial segura | Documentado públicamente; flujo interno no verificable sin sesión |
| Backoffice de Productoras, RRPPs y App de Puerta | Panel B2B separado del portal B2C del comprador | No expuesto en la web pública de compradores |

---

## 11. Etapa I — Comparación con nuestro Venti (Basada en el código real del repositorio)

Para evaluar de manera rigurosa nuestro propio proyecto frente a Venti Oficial y frente a los objetivos del sistema, se auditó el código real de frontend (`frontend/src/`), backend (`backend/src/`) y base de datos (`database/venti_mvp_mysql84.sql`).

Cada funcionalidad de nuestro repositorio se clasifica obligatoriamente bajo uno de los siguientes cinco estados:

- **Implementada y funcional.**
- **Implementada parcialmente.**
- **Implementada, pero con problemas.**
- **No implementada.**
- **No verificable.**

### 11.1. Matriz comparativa por área funcional

| Aspecto inspeccionado | Venti Oficial (`venti.com.ar`) | Nuestro Venti (Implementación real en código) | Clasificación en Nuestro Venti | Evidencia técnica en nuestro repositorio |
| :--- | :--- | :--- | :--- | :--- |
| **1. Registro e inicio de sesión** | Login con email, Google y Apple; registro con DNI; recupero de clave. | Login (`POST /auth/login`), registro (`POST /auth/register`), acceso como invitado (`POST /auth/guest`), Google OAuth (`/auth/oauth/google`), verificación de email y recupero de clave con rotación de refresh tokens. En móvil, verificar email o resetear clave sin abrir deep link exige pegar un token hex de 64 caracteres manualmente. | **Implementada y funcional.** | `frontend/src/features/auth/AuthScreen.tsx`, `backend/src/repositories/mysql.repository.js` |
| **2. Roles y permisos** | Comprador en portal B2C; Productoras y RRPPs en paneles separados. | 6 roles (`COMPRADOR`, `ARTISTA`, `ORGANIZADOR`, `VENUE`, `EMPRESA_SERVICIOS`, `ADMIN`) y 23 permisos granulares en BD. Sin embargo, el frontend colapsa la sesión a un único rol mediante `primaryRole(auth.roles)` sin selector de rol activo, ocultando menús de comprador a otros roles, y la pantalla `ProfilesScreen.tsx` no renderiza los botones para activar ni solicitar perfiles. | **Implementada, pero con problemas.** | `frontend/src/types/api.ts`, `frontend/src/components/layout/Shell.tsx`, `frontend/src/features/auth/ProfilesScreen.tsx`, `frontend/src/features/admin/UsersScreen.tsx` |
| **3. Exploración de eventos** | Buscador rápido, filtros con selector de fechas amigable, tarjetas visuales limpias. | Cartelera pública (`/concerts`), búsqueda por texto, filtros por ciudad/género/artista y rango de fechas, más recomendador *Venti Discover* (`/discover`). Presenta problemas en móvil: las tarjetas usan `height: "100%"` dentro de `BentoGrid` (`flexWrap: "wrap"`), causando superposición; los filtros de fecha piden texto ISO crudo (`2027-01-01T00:00:00Z`) y el componente `Select` muestra IDs crudos en el botón. | **Implementada, pero con problemas.** | `frontend/src/features/concerts/ConcertList.tsx`, `frontend/src/features/discover/DiscoverScreen.tsx`, `frontend/src/components/ui/Select.tsx` |
| **4. Compra y gestión de entradas** | Selección por `+`/`-`, cargo por servicio, pago real (Mercado Pago/tarjetas), *Venti Swap* y transferencia. | Reserva de stock transaccional (`sp_create_purchase`), compra directa con tarjeta simulada en `ConcertDetail.tsx` o reserva temporal + confirmación en `PurchasesScreen.tsx`, cancelación y reembolso simulado (`sp_cancel_purchase`). Usa `TextInput` numérico en vez de botones `-`/`+` para cantidades y carece de transferencia de entradas o reventa (*Venti Swap*). | **Implementada y funcional.** *(con mejoras de UX pendientes)* | `frontend/src/features/concerts/ConcertDetail.tsx`, `frontend/src/features/purchases/PurchasesScreen.tsx`, `backend/src/repositories/commerce.repository.ts` |
| **5. Códigos QR y control de acceso** | QR dinámico en billetera del usuario y app de escaneo para puerta. | Emisión de `qr_token` único por entrada en `TicketsScreen.tsx` (`react-native-qrcode-svg`) y validación en puerta en `StaffScreen.tsx` mediante cámara (`expo-camera`) o carga manual/lector USB (`sp_validate_ticket_qr`), con padrón de asistentes paginado. Si el comprador adquiere otro rol superior (`ARTISTA`, `ORGANIZADOR`, etc.), pierde el enlace a `/tickets` en el menú. | **Implementada y funcional.** *(afectada por navegación de roles)* | `frontend/src/features/tickets/TicketsScreen.tsx`, `frontend/src/features/staff/StaffScreen.tsx`, `backend/src/repositories/participation.repository.ts` |
| **6. Perfiles de usuario** | Datos personales del comprador, DNI e historial. | Edición de nombre, apellido y teléfono en `ProfileScreen.tsx` (`PATCH /me`) y preferencia de notificaciones. En cambio, la gestión de perfiles adicionales en `ProfilesScreen.tsx` (`/profiles`) está **inconclusa en UI**: consulta `GET /me/profiles`, pero ignora `self_service`, `requestable` y `requests`, y no tiene ningún botón ni enlace desde `ProfileScreen.tsx`. | **Implementada parcialmente.** | `frontend/src/features/auth/ProfileScreen.tsx`, `frontend/src/features/auth/ProfilesScreen.tsx`, `backend/src/repositories/admin.repository.ts` |
| **7. Funciones para artistas** | No existe como módulo en Venti Oficial (solo figuran en el texto del line-up). | Creación/edición/publicación/archivado de perfiles artísticos (`/artists`), gestión de integrantes (`OWNER`/`MEMBER`), perfil público (`/artist/[id]`), recepción de propuestas de contratación y postulación a espacios físicos (`ARTIST_TO_VENUE`). | **Implementada y funcional.** | `frontend/src/features/artists/ArtistsScreen.tsx`, `frontend/src/features/artists/ProposalScreen.tsx`, `backend/src/repositories/artists.repository.ts` |
| **8. Funciones para organizadores** | Backoffice B2B externo (creación de eventos, tandas, RRPPs, borderaux). | ABM de conciertos (`/organizer`), transición `DRAFT -> PUBLISHED -> CANCELLED`, vinculación de artistas al cartel (`ArtistPicker`), tipos de entrada (`TicketEditor`), asignación de staff por email (`StaffPanel`), contratación de artistas (`OrganizerArtistHiringPanel`) y estadísticas (`/organizer/statistics`). Exige fechas ISO manuales al crear conciertos y tipos de entrada. | **Implementada y funcional.** *(con fricción de UX en fechas ISO)* | `frontend/src/features/organizer/ConcertEditor.tsx`, `backend/src/repositories/management.repository.ts` |
| **9. Gestión de espacios (Marketplace)** | No existe en Venti Oficial. | Organizaciones, establecimientos (con flujo de revisión administrativa `PENDING_REVIEW`), salas/espacios (`venues`), fotos, comodidades, horarios de apertura, bloqueos operativos (`blocks`), resumen de artistas contratados y organizadores vinculados (`ManageScreen.tsx`). Carga de horarios y fotos mediante texto multilínea crudo. | **Implementada y funcional.** | `frontend/src/features/marketplace/MarketplaceScreen.tsx`, `frontend/src/features/marketplace/VenueScreen.tsx`, `frontend/src/features/marketplace/ManageScreen.tsx`, `backend/src/repositories/marketplace.repository.ts` |
| **10. Reservas de espacios** | No existe en Venti Oficial. | Consulta de disponibilidad horaria con fases (`SETUP`, `EVENT`, `TEARDOWN`), creación de reserva temporal (`HOLD` por 15 min) con detección de solapamientos (`LOCK IN SHARE MODE`), pago simulado, aceptación/rechazo por parte del espacio, historial de transiciones y vinculación posterior al publicar conciertos. | **Implementada y funcional.** | `frontend/src/features/marketplace/ReservationsScreen.tsx`, `frontend/src/features/marketplace/VenueScreen.tsx`, `backend/src/repositories/marketplace.repository.ts` |
| **11. Propuestas y presupuestos** | No existe en Venti Oficial. | Tres flujos completos: (a) Propuestas artísticas (`ORGANIZER_TO_ARTIST`, `VENUE_TO_ARTIST`, `ARTIST_TO_VENUE`), (b) Presupuestos de espacios con ítems/cargos/descuentos que al aceptarse generan una reserva `HOLD` (`/marketplace/quotes`), y (c) Cotizaciones de servicios técnicos (`/services/quotes`). | **Implementada y funcional.** | `frontend/src/features/artists/ProposalScreen.tsx`, `frontend/src/features/marketplace/QuotesScreen.tsx`, `frontend/src/features/services/ServiceQuotesScreen.tsx` |
| **12. Notificaciones** | Notificaciones por email de compra/transferencia. | Bandeja interna paginada (`/notifications`), contador de no leídas en cabecera (`NotificationsContext`), marcado individual y masivo (`read-all`), preferencia opt-in/opt-out para *Venti Discover* y redirección contextual (`notificationTarget.ts`). No incluye notificaciones push nativas (FCM/APNs). | **Implementada y funcional.** | `frontend/src/features/notifications/NotificationsScreen.tsx`, `frontend/src/utils/notificationTarget.ts`, `backend/src/repositories/notifications.repository.ts` |
| **13. Administración** | Backoffice interno de Venti Oficial. | Hub `/admin` con gestión de usuarios (`/admin/users`), aprobación/rechazo de solicitudes de rol (`ProfileRequestsPanel`), suspensión/reactivación, cambio de rol, auditoría filtrable (`/admin/audit`), organizaciones y verificación de empresas de servicios (`/admin/organizations`), aprobación de establecimientos (`/admin/establishments`), estadísticas globales y catálogos geográficos/musicales. | **Implementada y funcional.** | `frontend/src/features/admin/AdminScreen.tsx`, `frontend/src/features/admin/UsersScreen.tsx`, `frontend/src/features/admin/OrganizationsScreen.tsx`, `frontend/src/features/admin/EstablishmentsReviewScreen.tsx` |
| **14. Navegación** | Barra superior simple + tabs de comprador muy intuitivas. | `Shell.tsx` calcula los enlaces exclusivamente con `primaryRole(auth.roles)` en lugar de combinar permisos. No hay selector de rol activo, no hay enlace a `/profiles` desde `ProfileScreen.tsx`, los roles `VENUE` y `EMPRESA_SERVICIOS` ni siquiera tienen enlace a `/discover`, y cualquier usuario que sube de rol pierde los enlaces a `/tickets` y `/purchases`. | **Implementada, pero con problemas.** | `frontend/src/components/layout/Shell.tsx`, `frontend/src/features/auth/ProfileScreen.tsx` |
| **15. Diseño responsive y paleta visual** | Mobile-first real, sin solapamientos, estética oscura vibrante. | Uso de `height: "100%"` en `Card` dentro de `BentoGrid` (`flexDirection: "row", flexWrap: "wrap"`) provoca **superposición de tarjetas en móviles Android**; badges absolutos en `MusicalCover` se pisan con textos largos; `Select` inline empuja o desborda filas; y la paleta actual está dominada por el azul/índigo (`#4338CA` / `#4F46E5`) que debe abandonarse. | **Implementada, pero con problemas.** | `frontend/src/components/ui/index.tsx`, `frontend/src/components/ui/palette.ts`, `frontend/src/features/concerts/ConcertList.tsx` |
| **16. Estados de carga, error y vacío** | Skeletons y mensajes claros en cada vista. | Componente unificado `ResourceState` (spinner + `"Cargando información..."`, tarjeta de error con botón `"Reintentar"`, estado vacío `"No hay resultados para mostrar."`) y `ActionFeedback` en formularios. | **Implementada y funcional.** | `frontend/src/components/ui/index.tsx` |
| **17. Funciones exclusivas de Venti Oficial (RRPPs, Mesas VIP, Venti Swap, Pasarela real)** | Links de promotores/RRPPs, venta de Mesas VIP y consumiciones, reventa *Venti Swap*, transferencia nominal de tickets y cobro real con Mercado Pago. | Fuera del alcance del modelo académico (pagos simulados por diseño; sin módulo de RRPPs ni reventa secundaria). | **No implementada.** *(Diferencia de modelo de negocio)* | `frontend/src/features/concerts/purchaseAttempt.ts`, `backend/src/repositories/commerce.repository.ts` |

---

## 12. Diferencias estructurales entre Venti Oficial y nuestro Venti

1. **Modelo de negocio:**
   - **Venti Oficial** es una ticketera B2C/B2B enfocada en la **comercialización y reventa de accesos** (tickets, mesas VIP, bebidas, links de RRPPs) para eventos ya producidos.
   - **Nuestro Venti** es una **plataforma de producción y comercialización musical de punta a punta**: permite que el organizador busque y alquile el espacio físico (`/marketplace`), contrate a los artistas (`/proposals`), cotice el sonido y la iluminación (`/services`), arme el concierto (`/organizer`), venda las entradas (`/concerts/[id]`) y valide el ingreso con QR en puerta (`/staff`).
2. **Complejidad de interfaz:**
   - Al reunir 6 actores distintos dentro de una misma aplicación móvil/web, nuestro Venti expone formularios densos, múltiples subpaneles y flujos cruzados que en Venti Oficial no existen en la app del comprador. Esto explica por qué en la prueba física del APK nuestra aplicación se percibe **poco intuitiva y sobrecargada**.

---

## 13. Conclusiones de la comparativa

- **Fortaleza de nuestro proyecto:** La arquitectura de datos, las reglas de negocio en MySQL 8.4 y la cobertura funcional de los 6 roles superan ampliamente a una ticketera básica en cuanto a gestión integral de eventos musicales.
- **Brecha frente a Venti Oficial:** Venti Oficial nos supera claramente en **simplicidad de navegación, pulido responsive en móviles, controles de formulario amigables (selectores de fecha, steppers `+`/`-`, modales limpios) e identidad visual nocturna/musical**.
- El detalle exhaustivo de cada problema detectado en el código, las pantallas exactas donde ocurren superposiciones de tarjetas en móviles y el plan de acción priorizado se encuentran documentados en `docs/DIAGNOSTICO_FUNCIONAL_VENTI.md`.

---

## 14. Veredicto final

**VEREDICTO: SÍ, CONTAMOS CON INFORMACIÓN COMPLETA Y SUFICIENTE PARA COMENZAR LA ETAPA DE REDISEÑO Y MEJORAS.**

La auditoría funcional de Venti Oficial junto con la inspección línea por línea de nuestro repositorio (frontend, backend y base de datos) y los hallazgos de la prueba física del APK han permitido identificar con exactitud quirúrgica todos los componentes, pantallas, estilos y flujos que requieren intervención, sin necesidad de realizar nuevas auditorías exploratorias.
