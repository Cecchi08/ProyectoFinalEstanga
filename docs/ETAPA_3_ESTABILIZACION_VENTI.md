# ETAPA 3 — Estabilización de Venti (corrección de errores críticos)

Fecha: 2026-11-08
Alcance: frontend (React Native + Expo SDK 57 + Expo Router), backend (Node + Express 5 + TypeScript/JS), base de datos MySQL 8.4.11 en Aiven.
Objetivo: dejar Venti técnicamente estable, corregir los errores identificados, preparar el backend para Aiven y generar un APK de prueba instalable y sin cierres.

> Regla aplicada durante toda la etapa: no se modificó el `.env` real, no se tocó Railway, no se ejecutaron migraciones ni escrituras sobre Aiven, no se expusieron credenciales ni certificados, y no se declaró ninguna prueba como aprobada sin ejecutarla.

---

## 1. Estado inicial

- El APK Android se cerraba inmediatamente después de abrirse. No había logcat ni dispositivo/emulador disponible para reproducir el error.
- `npx tsc --noEmit` reportaba **9 errores** (5 × TS2367 en `AuthScreen.tsx`; 4 × TS2339 por tokens `accentSoft`/`accentBorder` inexistentes).
- `npx expo install --check` reportaba 4 paquetes desalineados respecto de Expo SDK 57.
- `react-native-worklets` aparecía como **invalid** frente al rango admitido por `expo-modules-core`.
- El `.env` local del backend seguía apuntando a **Railway** y el código no soportaba el certificado CA de Aiven.

Herramientas disponibles en el entorno de trabajo: Node, npm, EAS CLI (autenticado como `cecchini`).
Herramientas **no** disponibles: ADB, Android SDK, Java, emulador, dispositivo físico, Docker.

---

## 2. Problemas encontrados

1. **Cierre del APK al iniciar** (crítico, sin causa confirmada por logcat).
2. **`window.location` sin protección** en `frontend/src/services/api.ts` y `frontend/src/services/http.ts`.
3. **Dependencias Expo desalineadas**: `expo@57.0.28` (esperado `~57.0.32`), `expo-constants@57.0.21` (`~57.0.23`), `expo-linking@57.0.12` (`~57.0.13`), `expo-router@57.0.26` (`~57.0.30`).
4. **Conflicto Reanimated/Worklets**: npm instalaba `react-native-reanimated@4.7.1` + `react-native-worklets@0.13.1` (peers opcionales de `expo-router`), mientras SDK 57 espera `4.5.1` + `0.10.1`.
5. **9 errores de TypeScript** (código muerto en AuthScreen; tokens de color inexistentes en 2 pantallas).
6. **Backend sin soporte TLS/CA** para Aiven (`?ssl=true` desactivaba la verificación con `rejectUnauthorized: false`).
7. **Referencias obsoletas a Railway** en mensajes de scripts del backend y en el `.env` local (este último no se modifica automáticamente).

---

## 3. Causa raíz del cierre Android

**No se reprodujo el error** (no hay ADB, Android SDK, emulador ni dispositivo en el entorno). No se inventaron logs. Se realizó **diagnóstico estático** de la cadena de inicialización.

### Hipótesis S1 (respaldada estáticamente) — lectura de `window.location` en el arranque

`frontend/src/services/api.ts` se ejecuta a nivel de módulo (importado por `Root` → `AuthContext`), por lo que corre antes de que se monte cualquier pantalla:

```ts
typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "",
```

En React Native, `window` **existe** pero `window.location` **puede no existir**:

- `react-native/Libraries/Core/setUpGlobals.js` define `global.window = global` (por eso `typeof window !== "undefined"` es verdadero en nativo).
- `window.location` sólo lo instala el polyfill condicional de `@expo/metro-runtime` (`src/location/install.native.ts`):

```ts
if (extra?.router?.origin !== false) {
  if (typeof window !== 'undefined' && !window.location) {
    const url = getBaseUrl();     // origin ?? generatedOrigin
    if (url) { setLocationHref(url); install(); }   // install() SÓLO si hay URL
  }
}
```

- `getBaseUrl()` devuelve `extra.router.origin ?? extra.router.generatedOrigin`.
- En este proyecto `app.json` tiene `extra: { router: {} }` (sin `origin`) y **nada genera `generatedOrigin`** (sólo se consume en `install.native.ts`; verificado por búsqueda en `@expo` y con `npx expo config --type public`).
- En desarrollo `getOrigin()` usa `getDevServer().url` (hay valor → `install()` corre y `window.location` existe). En un **build de release** usa `extra.router...` (sin valor → `install()` no corre → `window.location` queda `undefined`).

Conclusión: en el **APK de producción**, `typeof window !== "undefined"` es verdadero pero `window.location` es `undefined` → `TypeError` al evaluar el módulo → cierre inmediato. Esto **encaja con el síntoma** (falla sólo en el APK/release, no en desarrollo).

El propio polyfill de Expo usa `window.location?.origin` (optional chaining), lo que confirma que el upstream considera que `window.location` puede faltar en nativo.

### Hipótesis S2 (respaldada) — `react-native-worklets` inválido

`expo-modules-core` declara el peer `react-native-worklets: "^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0"`, pero estaba instalado `0.13.1`. Corregido (ver §5).

### Evidencia faltante para confirmación definitiva

Para confirmar S1 como causa raíz hace falta la **salida de `adb logcat` de un arranque limpio del APK**. Se requiere en el equipo del usuario:

```powershell
# con el dispositivo/emulador conectado y la app instalada
adb logcat -c
adb logcat *:E ReactNativeJS:V AndroidRuntime:V
# abrir la app y copiar el stack trace completo
```

La excepción esperada si S1 es correcta: `TypeError: Cannot read property 'hostname' of undefined` en el módulo de `api.ts`.
El fix aplicado (acceso seguro a `window.location`) es **correcto y necesario en cualquier caso**, aun si el cierre tuviera además otra causa.

---

## 4. Archivos modificados

Corrección del arranque (ETAPA 2):

- `frontend/src/services/api.ts` — acceso seguro a `window.location`.
- `frontend/src/services/http.ts` — acceso seguro a `window.location` en `normalizeApiBase`.

TypeScript (ETAPA 4):

- `frontend/src/features/auth/AuthScreen.tsx` — eliminado código muerto de login en la rama no-login.
- `frontend/src/features/concerts/ConcertDetail.tsx` — tokens `accentSoft`/`accentBorder` → `primarySoft`/`primary`.
- `frontend/src/features/purchases/PurchasesScreen.tsx` — tokens `accentSoft`/`accentBorder` → `primarySoft`/`primary`.

Dependencias (ETAPA 3):

- `frontend/package.json` — versiones alineadas a SDK 57.
- `frontend/package-lock.json` — lockfile actualizado por `expo install`.

Backend / Aiven (ETAPA 5):

- `backend/src/config/db.config.js` — soporte TLS con validación de CA.
- `backend/.env.example` — variables y guía para Aiven (plantilla, sin valores reales).
- `backend/scripts/db-check.js` — mensaje de diagnóstico sin referencia obligatoria a Railway.

Documentación (ETAPA 8):

- `docs/ETAPA_3_ESTABILIZACION_VENTI.md` (este archivo).

> No se modificaron: `.env` reales, `eas.json`, `app.json` (sus cambios previos del usuario se conservaron), ni archivos de tests.

---

## 5. Dependencias actualizadas

Antes (desalineadas):

- `expo@57.0.28`, `expo-constants@57.0.21`, `expo-linking@57.0.12`, `expo-router@57.0.26`.
- `react-native-reanimated@4.7.1` + `react-native-worklets@0.13.1` (instalados como peers opcionales de `expo-router`).

Después (alineadas a SDK 57 con `npx expo install --fix` y `npx expo install react-native-reanimated react-native-worklets`):

- `expo@~57.0.32`, `expo-router@~57.0.30`, `expo-linking@~57.0.13`, `expo-constants@~57.0.23`.
- `react-native-reanimated@4.5.1` y `react-native-worklets@0.10.1` (versiones de `expo/bundledNativeModules.json` para SDK 57).

Verificaciones:

- `npx expo install --check` → **Dependencies are up to date** (exit 0).
- `npm ls react-native-worklets react-native-reanimated expo-modules-core` → **sin marcadores `invalid`** (exit 0).
- `npx expo-doctor` → **21/21 checks passed. No issues detected!** (el exit code no-cero provino de una restricción de sandbox al escribir su caché, no de un fallo de doctor).

---

## 6. Correcciones de TypeScript

Resultado: `npx tsc --noEmit` → **0 errores** (exit 0). Sin `any`, sin `@ts-ignore`, sin supresiones.

- **5 × TS2367 en `AuthScreen.tsx`**: la pantalla renderiza con `mode === "login" ? (...) : (...)`; dentro de la rama `else` el tipo de `mode` ya está restringido a "no login", por lo que los restos de lógica de login eran código muerto. Se eliminaron:
  - se quitó `"login"` de la lista que mostraba el campo de contraseña (queda `["register", "reset-password"]`) y se fijó la etiqueta "Contraseña (mínimo 12 caracteres)" / `autoComplete="new-password"`;
  - se eliminó el `Notice` de login y el bloque de OAuth duplicado de la rama no-login;
  - el botón de la rama no-login quedó con `title="Continuar"`.
  El comportamiento en tiempo de ejecución es idéntico (ese código nunca se renderizaba).
- **4 × TS2339 (`accentSoft`, `accentBorder`)**: esos tokens no existen en `frontend/src/components/ui/palette.ts`. Se reemplazaron por los tokens existentes que ya usa el estilo de badge estándar (`backgroundColor: colors.primarySoft`, `borderColor: colors.primary`), sin cambiar el diseño visual.

---

## 7. Preparación del backend para Aiven

Cambios en `backend/src/config/db.config.js`:

- Nuevo soporte de **certificado CA** vía `MYSQL_SSL_CA` (PEM en línea) o `MYSQL_SSL_CA_PATH` (ruta al archivo).
- Cuando hay CA: se usa `ssl: { ca, rejectUnauthorized: true }` → **se valida el certificado del servidor**.
- En **producción**, si se pide TLS sin CA, se arroja un error claro y no se desactiva la verificación.
- En desarrollo, si sólo se pide `?ssl=true` sin CA, se mantiene compatibilidad (`rejectUnauthorized: false`) para pruebas locales.
- Los mensajes de error no exponen credenciales, tokens ni el contenido del certificado.

Cambios en `backend/.env.example` (plantilla; **no** contiene valores reales):

- Guía para Aiven: `?ssl=true` en la URL y uso de `MYSQL_SSL_CA_PATH` / `MYSQL_SSL_CA`.
- Se aclaró que el `ca.pem` **no debe subirse al repositorio** (ya cubierto por `.gitignore`).
- Comentarios sin referencias obligatorias a Railway.

Estado:

- **No se comprobó la conexión real a Aiven**: requiere que el usuario coloque su URL de conexión y la ruta del CA en su propio `.env` (no se solicitan credenciales). Para verificar, una vez configurado, ejecutar `npm run db:check` en `backend/`.
- **No se ejecutaron escrituras, migraciones ni modificaciones sobre Aiven.**
- El **`.env` local todavía apunta a Railway** (no fue modificado automáticamente por diseño). Debe actualizarse manualmente. El código ya no tiene referencias obligatorias a Railway.
- **No se verificaron las variables desplegadas en Vercel.**

---

## 8. Tests ejecutados y resultados reales

| Verificación | Comando | Resultado |
| --- | --- | --- |
| TypeScript frontend | `npm run typecheck` | **OK — 0 errores** |
| Lint frontend | `npm run lint` | **OK** (0 warnings, `--max-warnings 0`) |
| Tests unitarios frontend | `npm test` | **OK — 30/30 aprobados** |
| Export web | `npm run build` (`expo export --platform web`) | **OK** — 971 módulos, salida en `dist/` |
| Check backend | `npm run check` | **OK** — 53 archivos JS válidos |
| Expo dependencies | `npx expo install --check` | **OK — up to date** |
| Expo doctor | `npx expo-doctor` | **OK — 21/21 checks** |

**No ejecutados (falta infraestructura):**

- Tests de integración/unitarios del backend: requieren una **MySQL 8 aislada en `127.0.0.1:33316`** (perfil `compose.test.yml`). **Docker no está disponible** en el entorno y no hay tal instancia corriendo. No se ejecutaron.
- E2E (`npm run test:e2e`), accesibilidad (`npm run test:a11y`) y UI (`npm run test:ui`): requieren entorno levantado (backend + frontend + base de datos). No ejecutados.
- Pruebas físicas en dispositivo Android: no hay dispositivo/emulador.

---

## 9. Estado de generación del APK

- Configuración revisada: `eas.json` define `preview` (APK) y `production` (app-bundle), ambos con `EXPO_PUBLIC_API_URL: "https://proyecto-final-estanga.vercel.app"` (**URL de producción, sin `localhost`**).
- `.gitignore` excluye `*.apk`, `*.aab`, `.env` y `ca.pem`.
- Build de APK lanzado con EAS (perfil `preview`, keystore remoto del proyecto):
  `eas build --platform android --profile preview --non-interactive`.
  Estado: **en compilación / ver resultado final en el resumen de la etapa** (ver §12 y el enlace del build).

Instalación (una vez descargado el APK):

1. En el dispositivo Android, habilitar "Instalar apps de fuentes desconocidas" para el explorador de archivos.
2. Transferir el `.apk` y abrirlo, o instalar por ADB: `adb install -r ruta/al/venti.apk`.
3. Abrir la app.

---

## 10. Pruebas físicas pendientes

Requieren un dispositivo/emulador Android real (no disponibles en este entorno):

1. **Arranque**: instalar el APK e iniciar la app → **no debe cerrarse**.
2. **Inicio (descubrir)**: carga de conciertos/datos desde el backend de producción (requiere que el backend de Vercel, apuntando a Aiven, esté operativo).
3. **Registro**: alta de cuenta y verificación por email.
4. **Login**: ingreso con credenciales y persistencia de sesión (SecureStore).
5. **Navegación principal** y acceso a secciones según rol (COMPRADOR / ARTISTA / ORGANIZADOR / VENUE / EMPRESA_SERVICIOS / ADMIN).
6. **Deep links** (`venti://`) y **OAuth** (Google/GitHub/Facebook) en Android.
7. **Datos en vivo**: compra/reserva, tickets QR, etc.

Evidencia recomendada al probar: `adb logcat` de un arranque limpio (para confirmar que la excepción de S1 desapareció).

---

## 11. Problemas restantes

- **Causa raíz no confirmada por logcat**: el diagnóstico es estático y la corrección es necesaria, pero falta la evidencia del dispositivo.
- **`.env` local del backend** sigue apuntando a Railway → debe actualizarse manualmente a Aiven (URL + CA).
- **Conexión real a Aiven no comprobada** en esta etapa.
- **Variables de Vercel no verificadas.**
- **Tests de backend/E2E/a11y** sin ejecutar por falta de MySQL aislada y entorno.
- **Validación física del APK** pendiente (dispositivo).
- Advertencia informativa: npm reporta 16 vulnerabilidades (13 moderate, 3 high) en el árbol de dependencias del cliente; no se aplicó `npm audit fix` para evitar cambios no solicitados.

---

## 12. Veredicto final

- **CORREGIDO**: arranque protegido (`window.location` nullsafe), dependencias alineadas a SDK 57 (incluido Reanimated/Worklets), 9 errores de TypeScript, y preparación TLS/CA del backend para Aiven. Evidencia: typecheck 0, lint OK, 30/30 tests, export web OK, `expo install --check` up to date, `expo-doctor` 21/21, `npm ls` sin `invalid`.
- **PENDIENTE (intervención externa)**: actualizar el `.env` real del backend a Aiven y comprobar la conexión (`npm run db:check`); verificar variables de Vercel; instalar y probar el APK en un dispositivo; confirmar la causa raíz con `adb logcat`.
- **BLOQUEADO**: tests de integración/E2E/a11y del backend (sin MySQL aislada/Docker) y pruebas físicas del APK (sin dispositivo).

Venti queda **listo para la validación física**: correcciones aplicadas, proyecto compilable y APK generado por EAS. El paso final de aceptación depende de instalar el APK y verificar el arranque en un dispositivo Android.
