# VENTI — Etapa 5

Actualización: [Ajuste 5.1](VENTI_AJUSTE_5_1.md) reemplaza los favoritos locales por API/MySQL y el ingreso manual de IDs Staff por asignaciones y asistentes. Las limitaciones correspondientes descritas abajo son históricas de Etapa 5.

Una aplicación Expo / React Native / TypeScript estricto, con Expo Router y Context API. `frontend/app/` contiene únicamente rutas y layouts; componentes, estado y operaciones viven en `frontend/src/`. Se conserva `database/schema.sql` y la API de Etapas 1–4. Sin recomendaciones, estadísticas ni notificaciones de Etapas 6–7.

## Ejecutar

1. Configurar y arrancar backend según README (MySQL, JWT, SMTP y OAuth).
2. En `frontend/`, ejecutar `npm ci` y copiar `.env.example` a `.env`.
3. `EXPO_PUBLIC_API_URL` debe apuntar al backend, sin `/api`. En teléfono usar IP LAN o HTTPS accesible, nunca localhost. Esta variable es pública; no colocar secretos.
4. `npm run web` o `npm start`. El proyecto fija Expo SDK 55 y las versiones compatibles de sus módulos. Para cámara y `venti://`, usar un development build compatible; Expo Go de otra versión no sirve como validación.
5. Backend: `CORS_ORIGINS` debe incluir exactamente el origen Web. Valores locales: `http://localhost:8081`; `EMAIL_VERIFY_URL=http://localhost:8081/verify-email`; `PASSWORD_RESET_URL=http://localhost:8081/reset-password`; `WEB_OAUTH_REDIRECT_URL=http://localhost:8081/oauth-callback`; `APP_DEEP_LINK=venti://oauth-callback`.

Web exporta una SPA en `frontend/dist/`; el servidor debe resolver rutas desconocidas a `index.html` y servir HTTPS en producción. Los enlaces de email usan fragmentos `#token=...`. Las pantallas permiten copiar el token en Mobile; para enlaces directos nativos configurar los enlaces del backend hacia `venti://verify-email` y `venti://reset-password` o configurar Universal/App Links propios.

## Funciones

- Autenticación: registro, login, verificación/reenvío, forgot/reset, Google/GitHub/Facebook, perfil de lectura y logout. Refresh persistido en SecureStore Native y localStorage Web; access token solo en memoria. Favoritos usa AsyncStorage Native y localStorage Web para no almacenar datos grandes en el llavero. Refresh único por cliente, rotación, restauración y limpieza si falla. Logout local inmediato, sin resucitar sesión ante refresh concurrente.
- Shell: sidebar desde 900 px; navegación inferior desplazable en pantallas menores. Secciones según pertenencia en `roles[]`; guards para URL directa. Backend mantiene permisos y propiedad reales.
- User: búsqueda/filtros/paginación, detalle, artistas/géneros/venue, selección de cantidades, reserva, confirmación, historial/cancelación y QR individual. El QR contiene exclusivamente `qr_token`. No se indica stock disponible inventado; la reserva valida disponibilidad real.
- Organizer/Admin: CRUD de conciertos, selección paginada de catálogos, asociaciones, publicación/cancelación, CRUD de tipos de entrada. Las fechas se ingresan en ISO con zona horaria. Las transiciones y restricciones se resuelven en backend.
- Staff/Admin: QR con `expo-camera` en Native y token manual/lector USB en todas las plataformas. Se bloquean eventos duplicados de cámara hasta pulsar «Siguiente entrada». Valida con `/tickets/validate`; presenta resultados válidos, usados, inválidos, cancelados, concierto incorrecto y falta de permiso.
- Admin: CRUD de artistas, géneros, venues, ciudades y provincias; gestión global de conciertos.
- Estados de carga, error, vacío, reintento y bloqueo de envíos duplicados. Acciones destructivas requieren un segundo toque explícito.

## Límites reales de la API

No existen rutas de favoritos, asignaciones/listado de conciertos de Staff, asistentes, ventas agregadas, edición de perfil ni administración de usuarios/roles. No se añadieron endpoints para cubrirlos.

Favoritos es una función **local por cuenta y dispositivo**, claramente identificada, sin sincronización con la tabla MySQL. Staff ingresa el ID entregado por la organización; la API comprueba la asignación vigente al validar. Las asignaciones y perfiles/roles de organizador deben estar provisionados previamente. No se muestran listas de asignados, asistentes, ventas ni usuarios que la API no ofrece.

## Cambio mínimo en backend

OAuth Web respondía una sesión JSON en el dominio de la API, impidiendo completar el login dentro de la SPA. Ahora `mode=web&codeChallenge=...` usa el intercambio de código efímero existente, con destino fijo `WEB_OAUTH_REDIRECT_URL` configurado en servidor. No acepta redirects del cliente ni envía access/refresh en URL. El modo web sin challenge conserva el contrato previo; Mobile conserva su deep link. Test adicional verifica destino, PKCE y consumo único.

## Validación reproducible

```powershell
# frontend
npm run typecheck
npm test
npm run build
npm run build:native
# backend, con TEST_DB_* para una instancia aislada
npm run build
npm test
node --import tsx --test scripts/stage5-e2e.mjs
```

Resultado verificado el 2 de octubre de 2026: TypeScript frontend/backend y builds Web/Android/iOS correctos; 109/109 pruebas backend, 10/10 pruebas de cliente y 3/3 E2E (122/122 en total). Los E2E cubren desktop 1440 px, teléfono Web 390 px y tablet Web 768 px; también recuperación de contraseña, los tres proveedores OAuth controlados, edición/cancelación, eliminación de borrador, edición/borrado/paginación de catálogo y estados vacío/reintento. No se ejecutó la aplicación en un teléfono físico.

El E2E requiere dependencias instaladas en ambas carpetas, build Web previo, Microsoft Edge instalado y puertos locales 3000/8081 libres. Crea una base aleatoria `venti_test_*` y la elimina al terminar, como las suites previas. Crea usuarios de prueba, provisiona roles/perfil/asignación mediante fixtures y opera la interfaz con Playwright a 1440 y 390 px. Los catálogos, concierto, publicación, registro/verificación, reserva, compra, QR y validaciones se ejecutan contra Express y MySQL reales. Decodifica el QR renderizado antes de enviarlo al validador. Capturas en `frontend/test-results/` (ignoradas por Git).

Las pruebas con proveedores OAuth controlados no certifican credenciales externas. La exportación nativa no sustituye una prueba de cámara, SecureStore y deep links en un dispositivo físico. No existe un comando lint en el proyecto original.

`npm audit` detecta avisos transitivos en el SDK fijado (node-forge de herramientas Expo, uuid y decode-uri-component). No aplicar `npm audit fix --force`: propone degradar Expo a SDK 44. Revisar actualizaciones compatibles del SDK antes de publicar; los builds locales y pruebas no representan una auditoría de dependencias.

Referencias de integración: [Expo Router](https://docs.expo.dev/router/installation/), [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/).
