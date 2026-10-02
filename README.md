# VENTI — Etapa 6

[Venti Discover](docs/VENTI_ETAPA_6.md): recomendaciones explicables al vuelo y preferencias ON/OFF, sin IA externa ni cambios de schema.

Incluye [Ajuste 5.1: favoritos persistentes, asignaciones Staff y asistentes](docs/VENTI_AJUSTE_5_1.md).

Backend REST con Node.js 22+, Express 5 y MySQL 8.4 (compatible con el esquema MySQL 8+), integrado con frontend React Native + Expo para Mobile y Web/Desktop. Incluye autenticación, gestión de conciertos, compras/reservas con stock transaccional, tickets individuales y validación QR. Los módulos nuevos usan TypeScript estricto; la Etapa 2 conserva JavaScript. No incluye pagos externos.

Frontend: `cd frontend`, `npm ci`, configurar `.env` desde `.env.example`, y `npm run web` o `npm start`. Consultar [Etapa 5: configuración, funciones, pruebas y límites reales](docs/VENTI_ETAPA_5.md).

## Instalación

1. Importar `database/schema.sql` en MySQL. Es una copia exacta del archivo proporcionado; incluye roles y proveedores requeridos.
2. Crear un usuario MySQL para la aplicación con `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre `venti.*`. No ejecutar la API con credenciales administrativas.
3. Desde `backend/`, ejecutar `npm ci`, copiar `.env.example` a `.env` y completar conexión, secreto JWT, SMTP y proveedores OAuth que se usarán.
4. Ejecutar `npm run build` y `npm start` (o `npm run dev`).

`npm run build` comprueba TypeScript estricto y sintaxis JavaScript, y genera `dist/`. `npm start` ejecuta `dist/server.js`; construir antes de iniciar. `npm run dev` usa `tsx watch` sobre las fuentes. `npm test` ejecuta las pruebas con `tsx`. Las validaciones de entrada y configuración usan Zod.

Generar el secreto JWT: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

La configuración se valida al iniciar. Las credenciales OAuth pueden quedar vacías; ese proveedor responderá `OAUTH_NOT_CONFIGURED` hasta configurarlo. Registrar en cada proveedor el callback exacto `https://<api>/auth/oauth/<google|github|facebook>/callback`. HTTPS es obligatorio en producción.

Los enlaces de emails apuntan a `EMAIL_VERIFY_URL` y `PASSWORD_RESET_URL`, con el token en el fragmento `#token=...`. El frontend lee el fragmento y envía el POST correspondiente al confirmar. También permite copiar el token desde el email.

## Pruebas

Las pruebas HTTP usan el esquema original en **MySQL real**, bcrypt, JWT y transacciones. OAuth usa respuestas controladas; SMTP se verifica con un servidor local efímero. No contactan proveedores externos.

Configurar `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER` y `TEST_DB_PASSWORD`; valores por defecto: `127.0.0.1`, `3306`, `root`, contraseña vacía. Usar una instancia local aislada y un usuario que pueda crear y borrar bases **de prueba**. Cada suite crea `venti_test_<16 caracteres aleatorios>` y elimina exclusivamente esa base al finalizar; no utiliza `DB_NAME` ni borra `venti`.

Ejemplo PowerShell desde `backend/`:

```powershell
$env:TEST_DB_HOST='127.0.0.1'
$env:TEST_DB_PORT='3306'
$env:TEST_DB_USER='venti_test_runner'
$env:TEST_DB_PASSWORD='<contraseña local de pruebas>'
npm run build
npm test
```

Opcionalmente levantar MySQL de prueba con `docker compose -f compose.test.yml up -d --wait`; usar puerto `33316`, usuario `root` y contraseña `venti-local-tests-only`. Detener con `docker compose -f compose.test.yml down`. Su almacenamiento es efímero.

## Documentación

- [Contrato REST y OAuth](docs/API.md)
- [Permisos y seguridad](docs/permissions.md)
- [Gestión de conciertos: contrato y reglas de Etapa 3](docs/VENTI_ETAPA_3.md)
- [Compras, entradas y QR: contrato y reglas de Etapa 4](docs/VENTI_ETAPA_4.md)
- [Documento original de Etapa 1](docs/VENTI_ETAPA_1.md)

El documento de Etapa 1 y `database/schema.sql` se conservan sin cambios. Etapa 3 incorpora TypeScript sin migrar ni reescribir la autenticación existente.

## Operación

- Fechas en UTC tanto en mysql2 como en cada sesión MySQL. IDs BIGINT se representan como strings.
- `authenticate` valida JWT y consulta usuario activo y roles vigentes en MySQL. No se usan roles del cliente.
- Los access tokens duran 15 minutos por defecto. Logout y reset revocan refresh tokens; un access token ya emitido conserva su vigencia corta, sin blacklist.
- El usuario debe verificar su email antes del login por defecto. `REQUIRE_EMAIL_VERIFICATION=false` permite desactivar esa política explícitamente.
- Producción: TLS en el proxy/API, SMTP con TLS y secreto JWT aleatorio. `TRUST_PROXY_HOPS=0` por defecto; configurar únicamente para la topología real de proxies.
- Esta implementación opera con **una instancia Node**: los estados OAuth, códigos de deep link y contadores de rate limit están en memoria, acotados y con expiración. Reiniciar cancela flujos OAuth pendientes. Para varias réplicas se requiere un almacén compartido con consumo atómico y rate limiting compartido; la rotación de refresh ya es transaccional en MySQL.
- SMTP se envía después del commit sin bloquear respuestas genéricas de recuperación. Los fallos se registran sin secretos; el usuario puede reenviar la verificación o recuperación. No hay cola de email persistente; un reinicio puede interrumpir envíos pendientes.
- No registrar headers Authorization, cuerpos de `/auth`, cookies, query strings OAuth ni enlaces con tokens en proxies/APM.
- Configurar credenciales reales de SMTP y OAuth y completar una prueba con cada proveedor antes del despliegue. Las pruebas automatizadas no certifican configuración de aplicaciones externas.
