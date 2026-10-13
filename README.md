# VENTI

Aplicación académica para descubrir conciertos, reservar y confirmar entradas, presentar QR y controlar el ingreso. Un mismo frontend funciona en Android, iOS y Web/Desktop. La confirmación y devolución son internas: **no procesa pagos reales**.

## Funcionalidades y roles

| Rol | Funciones |
| --- | --- |
| USER | Registro, verificación, login/OAuth, recuperación, búsqueda, favoritos persistentes, reservas, compras, entradas QR, Venti Discover y notificaciones. |
| ORGANIZER | Crear, editar y publicar conciertos propios, gestionar tipos de entrada y consultar estadísticas de ventas/ingresos. |
| STAFF | Consultar conciertos asignados y asistentes; validar QR una sola vez. |
| ADMIN | Administrar artistas, géneros, provincias, ciudades, venues y conciertos; estadísticas globales y control de ingreso. |

Los roles se pueden combinar. El registro asigna USER; roles, perfiles Organizer y asignaciones Staff se provisionan en MySQL siguiendo [Instalación](docs/INSTALLATION.md). La aplicación no incluye administración de cuentas/roles ni asignaciones desde la interfaz.

## Tecnologías y arquitectura

- React Native 0.86, React 19, Expo SDK 57, Expo Router y TypeScript estricto; almacenamiento seguro nativo y refresh token en almacenamiento local Web.
- Node.js, Express 5, MySQL 8+, mysql2, Zod, bcrypt y JWT. Backend mixto JS/TS: los módulos TypeScript usan `strict`; la autenticación conserva JavaScript.
- API REST → controladores → servicios/permisos → repositorios → MySQL. Reservas, stock, confirmación, notificaciones y validación QR usan transacciones.
- Discover calcula recomendaciones explicables con historial/favoritos, sin IA externa. Las notificaciones se consultan periódicamente; no son push.

```text
backend/src/         API, autenticación, permisos y reglas de negocio
backend/tests/       Pruebas HTTP con MySQL real
backend/scripts/     Checks y recorrido E2E en navegador
database/schema.sql  Esquema original y catálogos iniciales
frontend/app/        Rutas Expo Router
frontend/src/        Pantallas, componentes, contextos y cliente HTTP
frontend/tests/      Pruebas unitarias del cliente
docs/                Contratos, instalación y manual
```

## Inicio local

Requisitos: Node **22.13+** (validado con 24), npm, MySQL 8.0+/8.4 y SMTP de desarrollo o real. OAuth requiere credenciales propias y es opcional. Instrucciones completas y SQL: [Instalación](docs/INSTALLATION.md).

1. En MySQL, ejecutar `SOURCE /ruta/al/proyecto/database/schema.sql;` sobre una instalación nueva y crear el usuario limitado de la API.
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

El E2E necesita Web exportado con API `http://localhost:3000`, Chromium de Playwright (o `E2E_BROWSER_CHANNEL=msedge`) y puertos 3000/8081 libres. Comprueba el recorrido a **390, 768 y 1440 px**, incluido QR leído desde la imagen y rechazo del segundo escaneo. `build:native` exporta bundles Android/iOS; no produce APK ni reemplaza una prueba física.

## Entrega y documentación

- [Instalación desde cero y Android/EAS](docs/INSTALLATION.md)
- [API: rutas, bodies, permisos y errores](docs/API.md)
- [Manual por rol y demostración](docs/USER_MANUAL.md)
- [Permisos y seguridad](docs/permissions.md)
- [Etapa 8: resultados y pendientes](docs/VENTI_ETAPA_8.md)

El esquema permanece intacto. SMTP/OAuth reales y APK firmado requieren configuración externa. Antes de exposición pública, revisar los avisos transitivos de Expo detallados en el informe de entrega.

La operación actual admite una instancia Node: estados OAuth y rate limiting están en memoria. Access JWT de 15 minutos por defecto; logout/reset revocan refresh, sin blacklist de access. SMTP se envía después del commit sin cola persistente. Producción requiere TLS, CORS exacto y `TRUST_PROXY_HOPS` acorde al proxy real. No registrar cuerpos de autenticación, Authorization, QR ni URLs con tokens.
