# Instalación y entrega

## Requisitos

- Node.js **22.13+** y npm; MySQL 8.0+ (validado 8.0.46) o 8.4. No usar MariaDB: el schema emplea collation y restricciones de MySQL 8. Expo SDK 57 requiere Node 22.13+.
- SMTP: servidor propio o bandeja local, por ejemplo Mailpit. OAuth es opcional.
- Navegador moderno; para Android/iOS, Expo Go de SDK 57 iniciado desde Expo CLI o build propio. OAuth con esquema `venti://` debe probarse en un build propio.
- APK remoto: cuenta Expo/EAS, proyecto vinculado y firma Android. Compilar localmente requiere además JDK/SDK Android; no se incluyen en el repositorio.

Los ejemplos parten de la raíz del proyecto. Usá dos terminales para API y Expo.

## Dependencias y entorno

```powershell
npm ci --prefix backend
npm ci --prefix frontend
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copiá el secreto generado en `JWT_ACCESS_SECRET`. En macOS/Linux reemplazá `Copy-Item` por `cp`. Si ya hay `.env`, conservá sus valores y comparalos con el ejemplo.

| Archivo/variables | Configuración |
| --- | --- |
| backend: `MYSQL_PUBLIC_URL`, `MYSQL_URL` | URL completa; prioridad externa y luego interna de Railway. Las credenciales URL codificadas se decodifican. |
| backend: `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE` | Alternativa Railway. Se acepta también `MYSQL_DATABASE` y la configuración anterior `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. La aplicación requiere host, usuario y base; no usa `MYSQL_ROOT_PASSWORD`. |
| `JWT_ACCESS_SECRET` | Valor aleatorio propio, nunca el placeholder. TTL de access por defecto 15m, refresh 30 días. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` | Ejemplo local: 127.0.0.1:1025, false, no-reply@venti.example. |
| `SMTP_USER`, `SMTP_PASSWORD` | Ambos vacíos en SMTP local o ambos completos en servidor autenticado. |
| `EMAIL_VERIFY_URL`, `PASSWORD_RESET_URL` | Web accesible: `http://localhost:8081/verify-email` y `/reset-password` en local. Tokens van en el fragmento. |
| `CORS_ORIGINS` | Orígenes Web exactos separados por coma; incluir el puerto real de Expo. Sin rutas ni comodines. |
| `REQUIRE_EMAIL_VERIFICATION` | true por defecto. En demo local sin SMTP puede usarse false; no demuestra el flujo de email. |
| `TRUST_PROXY_HOPS` | 0 sin proxy; ajustar únicamente al número real de proxies confiables. |
| frontend: `EXPO_PUBLIC_API_URL` | `http://localhost:3000` Web local; `http://IP-LAN:3000` para Expo en teléfono; HTTPS público para APK. |

No poner secretos en variables `EXPO_PUBLIC_*`: quedan dentro del bundle. Cambiar la URL requiere reiniciar Expo o volver a exportar/compilar.

La plantilla `backend/.env.example` es orientativa: elegí una URL o el conjunto de variables de conexión, y conservá el `.env` real existente. MySQL se configura solo en el backend. Tras completar `backend/.env`, verificá acceso y base con `cd backend; npm run db:check`; el comando ejecuta `SELECT 1`, cierra el pool e informa el nombre seleccionado sin mostrar credenciales.

## MySQL

Abrí el cliente con `mysql -u root -p` (o su ruta completa en Windows) y ejecutá sobre una instalación nueva:

```sql
SOURCE C:/ruta/ProyectoFinalEstanga/database/venti_shema2.sql;
CREATE USER 'venti_app'@'127.0.0.1' IDENTIFIED BY 'REEMPLAZAR_POR_PASSWORD_PROPIO';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON venti.* TO 'venti_app'@'127.0.0.1';
```

Completá ese usuario/password y `DB_HOST=127.0.0.1` en `.env`. Adaptá el host del usuario si MySQL está en otra máquina. `EXECUTE` es necesario porque las reservas del marketplace usan procedimientos almacenados (`sp_create_reservation_hold`, `sp_simulate_payment`).

`database/venti_shema2.sql` es el **esquema vigente**. Crea la base, las tablas, los triggers, los procedimientos y el evento de vencimiento de reservas. También carga los datos iniciales:

- perfiles, permisos y sus asignaciones;
- estados y proveedores;
- catálogos del marketplace y categorías de servicios.

No incluye usuarios, conciertos ni datos de demostración. El evento necesita `event_scheduler=ON` en el servidor. **Importarlo una sola vez**: las tablas no son una migración idempotente. No eliminar una base existente para reinstalar.

**Base creada con una versión anterior de `venti_shema2.sql`.** Las diferencias van en `database/migrations/`. Cada migración se aplica **una sola vez**, con respaldo previo, mediante `node scripts/db-migrate.mjs` (desde `backend`; ver el encabezado de cada archivo). `20261026_perfiles_y_pagos.sql` ya está aplicada en la base de Railway: no volver a ejecutarla.

`database/venti_shema2.sql` selecciona explícitamente la base `venti`. En Railway, asegurate de que `MYSQLDATABASE` (o el nombre incluido en la URL) también sea `venti`. Si Railway asigna otro nombre y no permite crear `venti`, conservá intacto el archivo original y prepará una copia revisada que cambie únicamente `CREATE DATABASE` y `USE venti` por el nombre asignado; importala solo en una base vacía o respaldada. No borres tablas ni vuelvas a importar sobre datos existentes. `npm run db:check` marca error si el nombre conectado no coincide.

## Backend, Expo y Web

```powershell
cd backend
npm run build
npm start
```

Desarrollo: `npm run dev`. La API valida env y conexión SQL al iniciar. No existe `/health`; comprobar `http://localhost:3000/genres` (JSON público).

En otra terminal desde la raíz:

```powershell
cd frontend
npm run web
```

Abrir `http://localhost:8081`. Para teléfono, `npm start` y abrir el proyecto desde Expo; API y dispositivo deben poder comunicarse. Para emulador Android, el host suele ser `10.0.2.2`. Autorizar el puerto de la API en el firewall local cuando corresponda. La validación manual de QR funciona en todas las plataformas; la cámara del scanner está implementada para Android/iOS.

Export Web: `npm run build` genera `frontend/dist`. Alojar como SPA con fallback de rutas a `index.html`, por HTTPS junto a una API HTTPS; no abrir `index.html` con `file://`. `npm run build:native` produce bundles Hermes y recursos en `dist-native`, sin APK.

## SMTP y OAuth

Con Docker disponible, una bandeja SMTP local opcional:

```text
docker run --rm --name venti-mail -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit
```

Abrir `http://localhost:8025` para leer verificación/reset. Si se usa SMTP real, completar credenciales y TLS. Los errores de entrega no devuelven tokens al cliente; se puede solicitar otro email.

Para cada proveedor usado, completar sus tres variables `*_CLIENT_ID`, `*_CLIENT_SECRET`, `*_CALLBACK_URL`. Registrar el callback exacto `https://API/auth/oauth/google/callback` (análogos github/facebook). Dejar las tres vacías para proveedores no configurados. `WEB_OAUTH_REDIRECT_URL` debe apuntar a `https://WEB/oauth-callback`; `APP_DEEP_LINK=venti://oauth-callback`. Producción exige callbacks HTTPS. Ver detalles de state, PKCE y vinculación en [API](API.md).

## Cuentas y perfiles para la demostración

No existen credenciales predeterminadas. Registrá las cuentas desde la interfaz, con emails y contraseñas propios. Todas nacen con el perfil COMPRADOR.

**1. Primer ADMIN (único paso por SQL).** Mientras no hay ningún ADMIN, nadie puede asignar perfiles desde la interfaz. Con una conexión SQL administrativa, reemplazá el email por el de la cuenta registrada:

```sql
USE venti;
SET @demo_admin = (SELECT id FROM users WHERE email = 'admin@tu-dominio.test');
SELECT @demo_admin; -- Continuar solo si el ID existe y es esa cuenta.
INSERT IGNORE INTO user_roles(user_id, role_id)
  SELECT @demo_admin, id FROM roles WHERE code = 'ADMIN';
```

**2. El resto, desde la interfaz.**

- **Perfiles revisados.** El ADMIN entra en Admin → Usuarios y perfiles (`/admin/users`), busca la cuenta y asigna ORGANIZADOR, VENUE ("Espacios") o EMPRESA_SERVICIOS. Cada cambio queda en la auditoría (`/admin/audit`).
- **Autoservicio.** COMPRADOR y ARTISTA los activa cada persona en Mi cuenta → Mis perfiles.
- **Control de ingreso.** No se otorga por perfil. El organizador escribe el email de una cuenta registrada en "Email del staff" del editor del concierto. Esa cuenta ve la pestaña Staff y valida las entradas mientras el concierto está publicado.
- **Catálogos.** El ADMIN prepara provincias, distritos, ciudades y géneros. Los artistas son perfiles que crean las cuentas ARTISTA. Los espacios los gestionan las cuentas VENUE desde Espacios → Gestionar establecimientos.

Cerrá sesión y volvé a ingresar si un menú no aparece enseguida (la app también recarga los permisos al volver al primer plano y ante un `403`). El [manual](USER_MANUAL.md) contiene el recorrido de presentación.

## Tests

Instalar dependencias de ambas carpetas. Usar MySQL aislado: las suites crean bases `venti_test_<16 hex>` y las eliminan al terminar. No usan `DB_NAME` para destruir datos. El usuario de prueba necesita permisos para crear/eliminar esas bases.

Opción Docker, desde `backend`:

```powershell
docker compose -f compose.test.yml up -d --wait
$env:TEST_DB_HOST='127.0.0.1'
$env:TEST_DB_PORT='33316'
$env:TEST_DB_USER='root'
$env:TEST_DB_PASSWORD='venti-local-tests-only'
npm run check
npm run lint
npm test
npm run build
```

También sirve una instancia MySQL aislada propia con `TEST_DB_HOST/PORT/USER/PASSWORD`. En shell POSIX usar `export VARIABLE=valor` en lugar de `$env:VARIABLE=...`.

Desde `frontend`:

```powershell
npm run typecheck
npm run lint
npm test
$env:EXPO_PUBLIC_API_URL='http://localhost:3000'
npm run build
npm run build:native
npx expo install --check
npx playwright install chromium
```

Cerrar API/Expo si ocupan 3000/8081. Desde `backend`, en la terminal que conserva `TEST_DB_*`, ejecutar `npm run test:e2e`. Levanta sus propios servidores y una base `venti_test_*`; recorre 390/768/1440 px. **No apuntar `TEST_DB_*` a Railway ni a otra base con datos reales.** El script está actualizado al flujo de perfiles, artistas, pagos simulados, reservas aceptadas por el venue y empresas de servicios, pero esa versión todavía no se ejecutó. En Windows con Edge instalado, se puede omitir la descarga de Chromium y establecer `$env:E2E_BROWSER_CHANNEL='msedge'`. OAuth usa un proveedor controlado; QR, navegador, API y SQL son reales. Capturas ignoradas por Git en `frontend/test-results`.

Al terminar, `docker compose -f compose.test.yml down` si usaste Docker. Auditoría: `npm audit --omit=dev` en backend y `npm audit` en frontend; ver los pendientes vigentes en [Etapa 8](VENTI_ETAPA_8.md).

## Android APK / EAS

`frontend/eas.json` prepara **preview → APK instalable** y **production → AAB**. Identificador Android: `com.venti.app`; esquema OAuth: `venti`. No contiene projectId, cuenta ni firma inventados. Configuración basada en [Expo: APK](https://docs.expo.dev/build-reference/apk/) y [variables EAS](https://docs.expo.dev/eas/environment-variables/usage/).

Desde `frontend`, con cuenta y API HTTPS propias:

```text
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://TU-API --visibility plaintext
npx eas-cli@latest build --platform android --profile preview
```

Reemplazar `https://TU-API` por el servidor accesible. `init` vincula el proyecto y guarda su identificador real; `build` solicita o genera la firma mediante la cuenta autorizada. Si la variable existe, editarla en EAS. No subir `.env`, keystores ni `credentials.json` a Git. La URL pública se incluye en el bundle y no es un secreto.

Para AAB, configurar la misma variable en el entorno `production` y ejecutar `npx eas-cli@latest build --platform android --profile production`. Descargar el artefacto desde el enlace de EAS; instalar el APK y probar cámara, deep link OAuth, teclado, cambio de red y sesión. Esta entrega verifica exportación nativa; la firma/build remoto y validación física quedan pendientes de cuenta/credenciales/dispositivo.

## Problemas habituales

- API no inicia: comprobar secreto, variables SMTP obligatorias, usuario MySQL (con `EXECUTE`) e importación de `venti_shema2.sql`.
- Error de conexión en teléfono: sustituir localhost por la IP LAN; en APK usar HTTPS. Reconstruir después de cambiar la URL.
- CORS 403: agregar el origen Web exacto y reiniciar backend.
- Login 401 con la contraseña correcta: la cuenta puede estar suspendida (Admin → Usuarios y perfiles). OAuth puede requerir verificación local, especialmente Facebook.
- No aparece Organizador, Espacios o Mis empresas de servicios: comprobar que un ADMIN asignó el perfil en `/admin/users` y volver a ingresar. Staff: comprobar la asignación en el editor del concierto y que el concierto esté publicado.
- Error al reservar un espacio: comprobar `EXECUTE` sobre los procedimientos y `event_scheduler=ON`.
- 429: esperar la ventana de rate limit; en desarrollo/test no reutilizar tráfico de una demo pública.
