# VENTI

Aplicación académica: marketplace de conciertos, espacios y servicios para eventos. Permite descubrir y publicar conciertos, comprar entradas con QR y controlar el ingreso. También permite reservar salas y escenarios y pedir cotizaciones a empresas de servicios (sonido, iluminación, seguridad…). Un mismo frontend funciona en Android, iOS y Web/Desktop. Los pagos son simulados: **no procesa pagos reales** ni pide datos de tarjeta.

## Funcionalidades y perfiles

La API autoriza **por permiso**. Cada cuenta tiene uno o más perfiles, y sus permisos se suman.

| Perfil | Funciones | Activación |
| --- | --- | --- |
| COMPRADOR | Registro, verificación, login/OAuth, recuperación, búsqueda con filtro de precio, compras con pago simulado y reembolso, entradas QR, Venti Discover y notificaciones. | Al registrarse |
| ARTISTA | Perfil de artista o banda (con integrantes), búsqueda de espacios, presupuestos y reservas de salas. Sus presentaciones aparecen en el perfil público. | Autoservicio en Mi cuenta → Mis perfiles |
| ORGANIZADOR | Conciertos propios con tipos de entrada y artistas en el cartel; staff por concierto; estadísticas propias; reservas de espacios y cotizaciones de servicios. | Un ADMIN |
| VENUE | Organizaciones, establecimientos, espacios y bloqueos. Responde presupuestos y acepta o rechaza reservas pagadas. | Un ADMIN |
| EMPRESA_SERVICIOS | Empresa de servicios, su catálogo, integrantes y respuesta a cotizaciones. | Un ADMIN |
| ADMIN | Usuarios, perfiles y suspensiones con auditoría; catálogos; estadísticas globales; verificación de empresas; control de ingreso de cualquier concierto. | Un ADMIN; el primero por SQL |

**STAFF ya no es un perfil.** El organizador asigna cuentas a un concierto desde el editor, y esas cuentas validan las entradas de ese concierto. Los perfiles que asigna un ADMIN se gestionan en `/admin/users`. Cada cambio queda en la auditoría (`/admin/audit`). Detalle en [Seguridad y autorización](docs/permissions.md) y [Perfiles, permisos y endpoints](docs/PERMISOS.md).

## Tecnologías y arquitectura

- React Native 0.86, React 19, Expo SDK 57, Expo Router y TypeScript estricto; almacenamiento seguro nativo y refresh token en almacenamiento local Web.
- Node.js, Express 5, MySQL 8+, mysql2, Zod, bcrypt y JWT. Backend mixto JS/TS: los módulos TypeScript usan `strict`; la autenticación conserva JavaScript.
- API REST → controladores → servicios/permisos → repositorios → MySQL. Compras, stock, pagos simulados, reservas, cotizaciones, notificaciones y validación QR usan transacciones.
- Discover calcula recomendaciones explicables con el historial de entradas, sin IA externa. Las notificaciones se consultan periódicamente; no son push.
- Tema visual centralizado en `frontend/src/components/ui/theme.ts` (violeta eléctrico, solo modo oscuro). En Web también se expone como variables CSS `--venti-*`.

```text
backend/src/                Rutas, controladores, servicios, repositorios y validadores
backend/tests/              Pruebas HTTP con MySQL real
backend/scripts/            Checks, respaldo/migración de la base y recorrido E2E en navegador
database/venti_shema2.sql   Esquema vigente: tablas, triggers, procedimientos y datos iniciales
database/migrations/        Migraciones para bases creadas con una versión anterior del esquema
database/schema.sql         Esquema anterior (no usar en instalaciones nuevas)
frontend/app/               Rutas Expo Router
frontend/src/               Pantallas, componentes, tema, contextos y cliente HTTP
frontend/tests/             Pruebas unitarias del cliente
docs/                       Contratos, permisos, instalación y manual
```

## Inicio local

Requisitos: Node **22.13+** (validado con 24), npm, MySQL 8.0+/8.4 y SMTP de desarrollo o real. OAuth requiere credenciales propias y es opcional. Instrucciones completas y SQL: [Instalación](docs/INSTALLATION.md).

1. En MySQL 8 (no MariaDB), ejecutar `SOURCE /ruta/al/proyecto/database/venti_shema2.sql;` sobre una instalación nueva y crear el usuario limitado de la API. Después, registrar la primera cuenta y darle el perfil ADMIN por SQL ([pasos](docs/INSTALLATION.md#cuentas-y-perfiles-para-la-demostración)).
2. Ejecutar `npm ci --prefix backend` y `npm ci --prefix frontend`.
3. Copiar `backend/.env.example` a `backend/.env` y `frontend/.env.example` a `frontend/.env`. Configurar MySQL, secreto JWT aleatorio, SMTP y URL de la API.
4. En una terminal: `cd backend`, `npm run build`, `npm start` (desarrollo: `npm run dev`).
5. En otra: `cd frontend`, `npm run web` para navegador o `npm start` para Expo. En teléfono, usar la IP LAN de la API; `localhost` apunta al propio dispositivo.

API local: `http://localhost:3000`; Web: `http://localhost:8081`. `.env.example` contiene todas las variables; los secretos nunca van en `EXPO_PUBLIC_*` ni en Git. Para APK usar una API HTTPS accesible desde el teléfono.

## Verificación

Instalar ambas carpetas primero: las herramientas de lint compartidas están en `frontend/devDependencies`. Los tests backend crean y eliminan únicamente bases aleatorias `venti_test_*`; requieren MySQL aislado y variables `TEST_DB_*` ([pasos](docs/INSTALLATION.md#tests)).

```text
backend:  npm run check
backend:  npm run db:check
backend:  npm run lint
backend:  npm test
backend:  npm run build
frontend: npm run typecheck
frontend: npm run lint
frontend: npm test
frontend: npm run build
frontend: npm run build:native
frontend: npx expo install --check
backend:  npm run test:e2e
```

El E2E necesita:

- el Web exportado con API `http://localhost:3000`;
- Chromium de Playwright (o `E2E_BROWSER_CHANNEL=msedge`);
- los puertos 3000 y 8081 libres.

Recorre el flujo a **390, 768 y 1440 px**:

- perfiles asignados por un ADMIN y activados por autoservicio;
- conciertos con artistas en el cartel y filtro de precio;
- compra con pago simulado, QR leído desde la imagen y rechazo del segundo escaneo;
- reservas de espacios que acepta el venue;
- cotizaciones de servicios.

El script se actualizó al flujo actual pero **todavía no se ejecutó**. Nunca hay que correrlo contra la base de producción: crea su propia base `venti_test_*`.

`build:native` exporta bundles Android/iOS; no produce APK ni reemplaza una prueba física.

## Entrega y documentación

- [Instalación desde cero y Android/EAS](docs/INSTALLATION.md)
- [API: rutas, bodies, permisos y errores](docs/API.md)
- [Manual por rol y demostración](docs/USER_MANUAL.md)
- [Seguridad y autorización](docs/permissions.md)
- [Perfiles, permisos y endpoints](docs/PERMISOS.md)
- [Etapa 8: resultados y pendientes](docs/VENTI_ETAPA_8.md)

SMTP/OAuth reales y APK firmado requieren configuración externa. El login hoy no exige el email verificado, aunque `REQUIRE_EMAIL_VERIFICATION` esté activo. El bloqueo está desactivado temporalmente en `backend/src/services/auth.service.js`. Antes de exposición pública, revisar los avisos transitivos de Expo detallados en el informe de entrega.

La operación actual admite una instancia Node: estados OAuth y rate limiting están en memoria. Access JWT de 15 minutos por defecto; logout/reset revocan refresh, sin blacklist de access. SMTP se envía después del commit sin cola persistente. Producción requiere TLS, CORS exacto y `TRUST_PROXY_HOPS` acorde al proxy real. No registrar cuerpos de autenticación, Authorization, QR ni URLs con tokens.
