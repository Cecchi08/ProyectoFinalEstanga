# AUDITORÍA TÉCNICA — PROYECTO VENTI

**Etapa:** 2 — Auditoría técnica integral
**Prioridad:** Crítica (cierre inmediato del APK)
**Fecha de ejecución:** 2026-11-08
**Alcance:** relevamiento del repositorio, diagnóstico del cierre del APK, compatibilidad Expo SDK 57, backend y Aiven, autenticación, navegación, pruebas y configuración de compilación Android.

> **Regla de honestidad aplicada:** cada afirmación distingue entre **confirmado** (con evidencia ejecutada o código citado) e **hipótesis**. No se declara la app como estable: no fue probada en un dispositivo real. No se expone información sensible (contraseñas, secretos, tokens).

---

## 1. Resumen ejecutivo

Venti es una aplicación académica (marketplace de música en vivo) compuesta por:

- **Frontend**: React Native + Expo SDK 57 + Expo Router + TypeScript, con exportación adicional a Web.
- **Backend**: Node.js + Express 5 + TypeScript/JavaScript + MySQL (`mysql2`).
- **Base de datos**: MySQL. La documentación histórica apunta a Railway; el usuario reporta una migración reciente a **Aiven MySQL 8.4.11** (Etapa 1).

**Estado del problema crítico:** el APK se cierra inmediatamente. **No fue posible reproducir el cierre en este entorno** porque no hay dispositivo Android, emulador, ADB, Java ni Android SDK disponibles, y no hay APK local para instalar (ver §4). Por lo tanto **la causa raíz definitiva no está confirmada**: está bloqueada por falta de `logcat`. Se agotó el diagnóstico estático y se identificaron **dos sospechosos principales respaldados por evidencia de código** (§4 y §6).

**Hallazgos confirmados de mayor impacto:**

1. **El typecheck del frontend FALLA** (`tsc --noEmit`, exit 2): 9 errores de tipos. Contradice la documentación previa que afirmaba que el typecheck pasaba.
2. **Conflicto de dependencia nativa**: `react-native-worklets@0.13.0` está **fuera del rango requerido** por `expo-modules-core@57.0.22` (npm lo marca `invalid`, código `ELSPROBLEMS`). Los desajustes de módulos nativos son una causa conocida de cierre en el arranque.
3. **El backend local (`backend/.env`) sigue apuntando a Railway**, no a Aiven. La migración reportada **no está reflejada en el entorno local**.
4. **Cuatro paquetes de Expo SDK 57 están por debajo de la versión esperada** (`expo`, `expo-constants`, `expo-linking`, `expo-router`).
5. **No existe `babel.config.js` ni `metro.config.js`** en el proyecto (se depende de los defaults de Expo).

**Lo que sí funciona (probado en esta máquina):** tests unitarios del frontend **30/30**, lint del frontend **sin errores**, verificación estática del backend **OK (53 archivos)**.

---

## 2. Arquitectura actual

```
ProyectoFinalEstanga/
├── backend/                      API REST (Express 5, JS/TS mixto, ESM)
│   ├── src/
│   │   ├── server.js             Arranque del servidor
│   │   ├── app.js                Construcción de la app, CORS, helmet, rutas
│   │   ├── config/               db.config.js, env.config.js, oauth.config.js
│   │   ├── routes/               11 módulos (~140 manejadores)
│   │   ├── controllers/ services/ repositories/
│   │   ├── middlewares/          auth, validation, error
│   │   └── validators/           Esquemas Zod
│   ├── tests/                    Pruebas HTTP contra MySQL real
│   ├── scripts/                  check.js, db-check.js, e2e, seed
│   ├── compose.test.yml          MySQL aislado para pruebas
│   └── .env / .env.example
├── frontend/                     Expo SDK 57 (Android / iOS / Web)
│   ├── app/                      Rutas Expo Router (58 archivos)
│   ├── src/
│   │   ├── components/           ui/, layout/ (Root, Shell, AuthLayout)
│   │   ├── contexts/             AuthContext, NotificationsContext, PreferencesContext
│   │   ├── features/             auth, concerts, purchases, admin, …
│   │   ├── services/             api.ts, http.ts, storage.ts
│   │   ├── hooks/                useResource
│   │   └── types/                api.ts (permisos/roles)
│   ├── app.json                  Config Expo/Android
│   ├── eas.json                  Perfiles de build
│   ├── package.json
│   └── dist-native/              Export Android/IOS (Hermes .hbc)
├── database/                     venti_shema2.sql + migrations/
├── docs/                         Contratos, permisos, instalación
└── README.md
```

- **Navegación**: Expo Router con grupos `(auth)` y `(app)`; `app/index.tsx` redirige a `/discover`.
- **Autenticación**: JWT (access 15 min) + refresh token (30 días). OAuth Google/GitHub/Facebook.
- **Autorización**: **por permisos**, no por rol (`can(...)`, `requirePermission`). Roles: COMPRADOR, ARTISTA, ORGANIZADOR, VENUE, EMPRESA_SERVICIOS, ADMIN, GUEST.
- **Almacenamiento de sesión**: `expo-secure-store` (nativo) / `localStorage` (web).
- **Tema**: paleta única (claro/oscuro), tokens en `palette.ts`/`theme.ts`.

---

## 3. Estado general del proyecto

| Área | Estado | Evidencia |
| --- | --- | --- |
| Estructura del repo | Coherente, monorepo con frontend/backend/database/docs | §2 |
| Export nativo (bundle) | OK | `frontend/dist-native/metadata.json` con `entry-*.hbc` |
| Tests unitarios frontend | **30/30 aprobados** | `npx tsx --test tests/*.test.ts` |
| Lint frontend | **OK (0 warnings)** | `npm run lint` → exit 0 |
| Verificación backend | **OK (53 archivos JS válidos + tsc)** | `npm run check` → exit 0 |
| **Typecheck frontend** | **FALLA (9 errores)** | `npx tsc --noEmit` → exit 2 |
| Tests backend | **NO EJECUTADOS** | Requieren MySQL de prueba (Docker, `compose.test.yml`) |
| E2E / a11y | **NO EJECUTADOS** | Requieren backend + MySQL + navegador |
| APK | **No verificable** | Sin dispositivo/emulador/APK local |
| Documentación | Parcialmente desactualizada | `docs/ReporteEstadoProyecto.md` y `README.md` mencionan Railway y afirman "typecheck pasa" |

---

## 4. Diagnóstico del cierre del APK (PRIORIDAD MÁXIMA)

### 4.1 Limitación de entorno (declarada explícitamente)

No fue posible ejecutar el APK ni obtener `logcat`:

- **Dispositivo/emulador Android:** no disponible.
- **`adb`:** no encontrado. **`java`:** no encontrado. **`ANDROID_HOME`/`ANDROID_SDK`:** ausentes.
- **APK local:** no hay ningún `.apk` en Desktop/Downloads ni en el repo.
- **Consecuencia:** el diagnóstico por `adb logcat` / `AndroidRuntime` / `ReactNativeJS` / `FATAL EXCEPTION` está **BLOQUEADO**.

Se procedió, según lo solicitado, a agotar el **diagnóstico estático** y de compilación.

### 4.2 Punto de entrada y cadena de inicialización (analizada)

```
expo-router/entry
  └─ app/_layout.tsx            (exporta Root + ErrorBoundary)
       └─ src/components/layout/Root.tsx
            ├─ installWebStyles()   → no-op en nativo (webStyles.ts)
            ├─ initTheme()          → lee tema de storage; renderiza View hasta "ready"
            ├─ SafeAreaProvider > AuthProvider > StatusBar > Slot
            └─ AuthProvider (src/contexts/AuthContext.tsx)
                 └─ importa src/services/api.ts  (evaluación de MÓDULO, nivel superior)
```

`api.ts` **ejecuta código en el nivel superior del módulo** (se evalúa al importarse, antes del primer render):

```ts
export const api = new HttpClient(
  normalizeApiBase(
    process.env.EXPO_PUBLIC_API_URL,
    "http://localhost:3000",
    typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "",  // ← línea 7
  ),
  storage,
);
```

### 4.3 Sospechoso principal S1 — `window.location` en `api.ts` (Hipótesis fuerte)

**Capa del fallo:** JavaScript, durante la evaluación de módulos (antes de montar React Native).

**Razonamiento técnico basado en evidencia:**

1. En el runtime nativo, `package.json` **no define `babel.config.js` ni `metro.config.js`**; el entorno se apoya en los módulos de Expo.
2. En React Native, `global.window === global` (`react-native/Libraries/Core/setUpGlobals.js`), pero **el núcleo de React Native NO define `window.location`** (verificado: no existe ninguna asignación de `location` global en `react-native/Libraries`).
3. `window.location` en nativo es provisto **solamente** por un polyfill **condicional** en `@expo/metro-runtime/src/location/install.native.ts`:

```ts
if (extra?.router?.origin !== false) {
  if (typeof window !== 'undefined' && !window.location) {
    const url = getBaseUrl();          // ← puede devolver null
    if (url) { setLocationHref(url); install(); }   // ← install() sólo si hay URL
  }
  ...
}
```

y `getBaseUrl()` depende de `extra.router.origin` / `extra.router.generatedOrigin`.

4. **El `app.json` del proyecto define `extra.router` como objeto vacío** (`"extra": { "router": {}, "eas": { ... } }`), es decir **sin `origin`**. Si `generatedOrigin` no está presente en el manifiesto de release, `getBaseUrl()` devuelve `null`, `install()` **no se ejecuta** y `window.location` queda **`undefined`**.
5. Si `window.location` es `undefined`, la expresión de `api.ts` (línea 7) lanza **`TypeError: Cannot read property 'hostname' of undefined`** durante la carga del bundle → la app no llega a montar el árbol de React → **se cierra inmediatamente**. Coincide con el síntoma.
6. **Evidencia corroborante:** el propio polyfill de Expo usa **optional chaining defensivo** (`window.location?.origin`, líneas 62 y 65 de `install.native.ts`), lo que **prueba que `window.location` puede ser `undefined` en nativo**. El mismo patrón riesgoso aparece en el valor por defecto de `normalizeApiBase` (`http.ts`) y en `api.ts`, ambos **sin `?.`**.

**Estado:** Hipótesis fuerte, no confirmada (requiere `logcat`). Es la causa que mejor explica un cierre **inmediato y determinista** independiente de la pantalla.

### 4.4 Sospechoso principal S2 — Incompatibilidad de módulo nativo (Hipótesis)

**Capa del fallo:** nativa (registro/inicialización de módulos compilados).

Evidencia ejecutada:

```
$ npm ls react-native-worklets expo-modules-core
expo-router@57.0.26
└─ react-native-reanimated@4.7.1
   └── react-native-worklets@0.13.0 deduped invalid:
       "^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0" from node_modules/expo-modules-core
expo@57.0.28
└─ expo-modules-core@57.0.22
   └── react-native-worklets@0.13.0 deduped invalid: (mismo rango)
npm error invalid: react-native-worklets@0.13.0   (ELSPROBLEMS)
```

- `react-native-worklets@0.13.0` está **fuera del rango** que requiere `expo-modules-core@57.0.22`.
- Se instala de forma **transitiva** vía `expo-router → react-native-reanimated@4.7.1`. El árbol resuelve una versión **más nueva de la esperada**, típico de un `package-lock.json` desincronizado.
- `react-native-reanimated` requiere un **plugin de Babel**; el proyecto **no tiene `babel.config.js`** explícito, de modo que la aplicación del plugin depende del comportamiento implícito de `babel-preset-expo` (no verificable sin build).

**Estado:** Hipótesis. Los desajustes de módulos nativos producen cierres en el arranque, pero debe confirmarse con `logcat` (buscar `UnsatisfiedLinkError`, `NoClassDefFoundError`, `ReactNoCrashSoftException` o `FATAL EXCEPTION` de `expo.modules`).

### 4.5 Qué NO es la causa (descartado con evidencia)

- **Error de bundling de Metro/Babel:** descartado. `frontend/dist-native/metadata.json` referencia un bundle Hermes válido (`entry-28583655c10010....hbc`) y el log de export (`frontend/.expo/dev/logs/export.log`) registra exports exitosos de Android/iOS/Web.
- **Fallo del typecheck como causa del cierre:** **NO**. Metro/Babel **eliminan los tipos sin verificar**; los 9 errores de `tsc` no impiden generar el bundle. Son errores de calidad, no la causa del cierre.
- **Migración de base de datos (Railway → Aiven):** **NO** puede causar el cierre del APK. La conexión MySQL ocurre en el **backend**, no en el binario Android.

### 4.6 Cómo confirmar la causa raíz (paso siguiente, cuando haya dispositivo)

```bash
# 1. Instalar el APK y capturar el log del arranque
adb install -r app-release.apk
adb logcat -c && adb logcat | findstr /I "AndroidRuntime ReactNativeJS ExpoModules Hermes FATAL EXCEPTION"
```

Discriminación:
- Si aparece `TypeError: Cannot read property 'hostname' of undefined` en `ReactNativeJS` → **S1** confirmado.
- Si aparece `UnsatisfiedLinkError` / `NoClassDefFoundError` / excepción de `expo.modules` → **S2** confirmado.
- Si el proceso muere antes de `ReactNativeJS` → fallo **nativo** (S2).

---

## 5. Evidencia técnica y logs relevantes

| Verificación | Comando | Resultado |
| --- | --- | --- |
| Typecheck frontend | `npx tsc --noEmit` | **exit 2** — 9 errores |
| Tests frontend | `npx tsx --test tests/*.test.ts` | **30 pass / 0 fail** |
| Lint frontend | `npm run lint` | **exit 0** |
| Check backend | `npm run check` (tsc + check.js) | **exit 0** — "Sintaxis JavaScript válida: 53 archivos." |
| Árbol de dependencias | `npm ls react-native-worklets expo-modules-core` | **`react-native-worklets@0.13.0 invalid` (ELSPROBLEMS)** |
| Compatibilidad Expo | `npx expo install --check` | 4 paquetes desactualizados |
| Expo Doctor | `npx expo-doctor` | 19/21 OK; 1 fallo por **error de red** (no de config); 1 por versiones |

Errores de typecheck del frontend (verbatim, sin datos sensibles):

```
src/features/auth/AuthScreen.tsx(381,25): error TS2367: comparación sin solapamiento ("... | oauth-callback") y ("login")
src/features/auth/AuthScreen.tsx(390,25): error TS2367: idem
src/features/auth/AuthScreen.tsx(395,20): error TS2367: idem
src/features/auth/AuthScreen.tsx(399,28): error TS2367: idem
src/features/auth/AuthScreen.tsx(429,18): error TS2367: idem
src/features/concerts/ConcertDetail.tsx(225,45): error TS2339: Property 'accentSoft' does not exist
src/features/concerts/ConcertDetail.tsx(227,41): error TS2339: Property 'accentBorder' does not exist
src/features/purchases/PurchasesScreen.tsx(200,45): error TS2339: Property 'accentSoft' does not exist
src/features/purchases/PurchasesScreen.tsx(202,41): error TS2339: Property 'accentBorder' does not exist
```

---

## 6. Causa raíz confirmada o hipótesis pendientes

- **Causa raíz del cierre: NO CONFIRMADA.** Bloqueada por falta de `logcat` (§4.1).
- **Hipótesis S1** (JS, `window.location` en `api.ts`): **fuerte**, evidencia de código sólida. Prioridad de verificación 1.
- **Hipótesis S2** (nativa, `react-native-worklets` invalid): **fuerte**, evidencia de `npm ls`. Prioridad de verificación 2.
- **Hipótesis S3** (ausencia de `babel.config.js` → plugin de Reanimated no aplicado): **débil/media**, subordinada a S2.

---

## 7. Problemas de compatibilidad (Expo SDK 57)

Salida de `npx expo install --check`:

```
expo@57.0.28            - esperado ~57.0.32
expo-constants@57.0.21  - esperado ~57.0.23
expo-linking@57.0.12    - esperado ~57.0.13
expo-router@57.0.26     - esperado ~57.0.30
```

- Desajustes a nivel **patch** dentro del mismo SDK 57. Por sí solos rara vez causan un cierre, pero **agravan el riesgo** cuando se combinan con el desajuste nativo de S2.
- **No existe `babel.config.js` ni `metro.config.js`**. La app depende de defaults de Expo; en particular la aplicación del **plugin de `react-native-worklets`/`reanimated`** queda implícita.
- **No se cambió ninguna versión** (regla 9): sólo se reporta.

---

## 8. Estado del backend

- Arranque: `backend/src/server.js` → `createApp()` (`backend/src/app.js`). Middleware: `helmet`, CORS con lista exacta + `localhost`/`*.vercel.app`, `express.json` (16 kB), rutas, `notFound`, `errorHandler`.
- Rutas montadas en `/api/*` **y** en la raíz (`/auth`, etc.). Express 5 usa `/*splat` correctamente (`app.options('/*splat', ...)`).
- Validación: esquemas Zod en `env.config.js` (falla al arrancar si la config es inválida — comportamiento correcto).
- **Verificación estática OK** (`npm run check`): 53 archivos JS válidos + `tsc --noEmit` sin errores.
- **Tests backend NO ejecutados**: requieren MySQL de prueba (`compose.test.yml`, puerto 33316). No se levantaron contenedores.

---

## 9. Estado de la conexión con Aiven

**Hallazgo CRÍTICO/ALTO — la migración a Aiven no está reflejada en el entorno local.**

`backend/.env` (ignorado por git, correcto) **todavía apunta a Railway**:

```
MYSQL_PUBLIC_URL=mysql://***:***@sakura.proxy.rlwy.net:51148/railway
MYSQL_URL=mysql://***:***@mysql.railway.internal:3306/railway
MYSQLHOST=mysql.railway.internal
```

(Se ocultan credenciales; no se exponen valores sensibles.)

Análisis de `backend/src/config/db.config.js`:

- La conexión se resuelve por `MYSQL_PUBLIC_URL` → `DATABASE_URL` → variables sueltas. **No hay referencias obligatorias a Railway en el código** (bien).
- **Soporte TLS para Aiven**: sólo si la URL incluye `?ssl=true|1|required|require`, aplicando `ssl: { rejectUnauthorized: false }`.
- **Limitación detectada**: el proyecto añadió `ca.pem` a `.gitignore` (intención de usar el CA de Aiven), pero `db.config.js` **no lee ningún archivo CA** ni admite `ssl.ca`. Si se pretende usar el certificado de Aiven, **falta implementar la carga del CA**. Con `rejectUnauthorized: false` la conexión cifra pero **no valida** el certificado (riesgo MITM, aceptable sólo como mitigación temporal).
- **No se ejecutó ninguna operación contra Aiven** (regla 6). No se modificaron credenciales (regla 7).

**No verificable aquí:** si el backend desplegado en Vercel tiene configuradas las variables de Aiven (están fuera del repo).

---

## 10. Estado de la autenticación

- **Flujo cliente** (`http.ts` + `AuthContext.tsx`): login → `accept(session)` persiste refresh token; `restore()` rota el refresh al arrancar; ante 401 refresca una sola vez (single-flight); ante 403 recarga permisos; reload silencioso cada 60 s y al volver a foreground.
- **Persistencia**: `expo-secure-store` en nativo; **`window.location` NO se usa aquí** (correcto).
- **OAuth**: Google/GitHub/Facebook con PKCE; deep link `venti://oauth-callback` (`APP_DEEP_LINK`).
- **URL del backend en el APK**: `eas.json` fija `EXPO_PUBLIC_API_URL=https://proyecto-final-estanga.vercel.app` (perfiles `preview` y `production`). **No se usa `localhost` en el build** (requisito cumplido), salvo por el fallback de `normalizeApiBase` que sólo se activaría si la variable faltara en tiempo de build.
- **Riesgo**: `normalizeApiBase` y `api.ts` dependen de `window.location` en nativo (§4.3) — mismo defecto que el punto crítico.
- **Tests**: los tests de `http.ts`/auth (`logout`, refresh, rotación, idempotencia) **pasan** (incluidos en los 30/30).

---

## 11. Estado de la navegación y roles

- **Expo Router** con grupos `(auth)` y `(app)`; `Back`/deep links vía esquema `venti`.
- **Guards**: `Shell.tsx` usa `linksForRole` y componentes `Require`/`Guard`; `PreferencesProvider key={auth.user.id}` y `NotificationsProvider`.
- **Autorización por permisos** (no por rol): el menú y las pantallas se habilitan con `can(...)`. Los tests cubren "las pantallas se filtran por los permisos de cada perfil, no por los códigos de perfil" (aprobado).
- **Roles cubiertos**: COMPRADOR, ARTISTA, ORGANIZADOR, VENUE, EMPRESA_SERVICIOS, ADMIN, GUEST.
- **No se modificó ninguna regla de negocio** (regla 3).
- **Limitación**: no se pudo navegar la app en un dispositivo; la verificación de flujos por rol es **estática** (código + tests de autorización), no empírica.

---

## 12. Resultado de las pruebas automatizadas

| Prueba | Comando | Estado |
| --- | --- | --- |
| **Unitarias frontend** | `npx tsx --test tests/*.test.ts` | **APROBADAS** (30/30) |
| **Lint frontend** | `npm run lint` | **APROBADA** (exit 0) |
| **Check backend** | `npm run check` | **APROBADA** (53 archivos) |
| **Typecheck frontend** | `npx tsc --noEmit` | **FALLIDA** (9 errores) |
| Tests backend (HTTP + MySQL) | `npm test` | **NO EJECUTADAS** (requiere MySQL 33316) |
| E2E (`test:e2e`) | `npm run test:e2e` | **NO EJECUTADAS** (requiere stack completo) |
| a11y / UI (`test:a11y`, `test:ui`) | — | **NO EJECUTADAS** |
| Build APK | EAS | **NO EJECUTADA** (regla 2) |

> No se dan por aprobadas pruebas que no se ejecutaron (regla 11). Los resultados históricos del `ReporteEstadoProyecto.md` (176/176, 13/13, 9/9) **no se re-validaron** en esta auditoría.

---

## 13. Estado de la configuración Android / EAS

`frontend/app.json` (nótese: **hay cambios sin commitear**, §14):

```json
{
  "expo": {
    "name": "VENTI", "slug": "venti", "scheme": "venti",
    "version": "1.0.0", "userInterfaceStyle": "automatic",
    "plugins": ["expo-router","expo-secure-store",
      ["expo-camera",{"cameraPermission":"...","recordAudioAndroid":false}],
      "expo-status-bar","expo-web-browser"],
    "android": {"package":"com.venti.app","versionCode":1,
      "permissions":["android.permission.CAMERA"]},
    "extra": {"router":{},"eas":{"projectId":"2f344811-..."}}
  }
}
```

`frontend/eas.json`: `cli.appVersionSource = "local"`; `preview` → `distribution: internal`, `buildType: apk`; `production` → `app-bundle`; ambos con `EXPO_PUBLIC_API_URL = https://proyecto-final-estanga.vercel.app`.

Observaciones:

- **Application ID** `com.venti.app` y `versionCode 1` presentes.
- **`extra.router` vacío** → riesgo directo para S1 (§4.3).
- **`extra.eas.projectId`** y **`android.permissions`** sólo existen en el árbol de trabajo **sin commitear** (no en `HEAD`). Si se compila desde un checkout limpio, faltarían.
- **Sin `babel.config.js`/`metro.config.js`** (§7).
- La configuración **es suficiente para generar un APK** (Expo Router + plugins válidos + bundle de export exitoso), pero **no garantiza que arranque**, dados los hallazgos de §4.

---

## 14. Riesgos encontrados

1. **Cierre del APK sin causa raíz confirmada** (bloqueo por falta de `logcat`).
2. **`api.ts` sin null-safety sobre `window.location`** en una ruta de evaluación temprana.
3. **Árbol de dependencias nativas desalineado** (`react-native-worklets` invalid).
4. **Typecheck frontend roto** y documentación desactualizada ("typecheck pasa").
5. **Entorno local aún en Railway**; Aiven sin reflejar; sin soporte de CA en el código.
6. **Cambios de configuración sin commitear** (`app.json`, `.gitignore`), con riesgo de builds no reproducibles.
7. **Secretos reales en `backend/.env`** (contraseña MySQL, `JWT_ACCESS_SECRET`, contraseña de aplicación SMTP y secretos OAuth). El archivo está **ignorado por git** (bien), pero **no debe compartirse**; si fue expuesto, deben rotarse.
8. **Inconsistencia de orígenes CORS**: `app.js` permite `https://proyectofinalestanga-frontend.vercel.app` mientras `eas.json` usa `https://proyecto-final-estanga.vercel.app` (no afecta al nativo, que no envía `Origin`, pero sí a la web).
9. **Versión de Node**: `engines` exige `22.x`; la máquina tiene **v24.15.0** (posible diferencia de comportamiento/CI).

---

## 15. Problemas clasificados por prioridad

### CRÍTICO

**P1 — El APK se cierra inmediatamente (causa raíz no confirmada).**
- **Archivo:** (por confirmar) `frontend/src/services/api.ts#L7` (S1) y/o árbol nativo `react-native-worklets` (S2).
- **Evidencia:** §4.3 (polyfill condicional de Expo + optional chaining defensivo del propio polyfill) y §4.4 (`npm ls` → `invalid`).
- **Causa:** (S1) lectura de `window.location.hostname` en nivel superior cuando el polyfill puede no instalarse; (S2) versión de módulo nativo fuera de rango.
- **Consecuencia:** la app no arranca.
- **Solución recomendada:** (S1) cambiar a `Platform.OS === "web" ? window.location.hostname.toLowerCase() : ""` (o `window.location?.hostname ?? ""`); (S2) realinear el árbol de dependencias nativas a lo esperado por `expo-modules-core@57.0.22`. **Confirmar antes con `logcat`.**
- **Prioridad:** 1.

### ALTO

**P2 — Typecheck del frontend falla (9 errores).**
- **Archivos:** `frontend/src/features/auth/AuthScreen.tsx` (L381,390,395,399,429); `frontend/src/features/concerts/ConcertDetail.tsx` (L225,227); `frontend/src/features/purchases/PurchasesScreen.tsx` (L200,202).
- **Evidencia:** `npx tsc --noEmit` → exit 2.
- **Causa:** (a) comparaciones `mode === "login"` dentro de la rama `else` del ternario `mode === "login" ? ... : ...` (código **inalcanzable / muerto**); (b) tokens `accentSoft` y `accentBorder` **inexistentes** en la paleta.
- **Consecuencia:** no rompe el bundle (Metro no chequea tipos), pero (a) señala lógica muerta y (b) produce estilos con **color `undefined`** (bordes/fondos sin pintar) en dos pantallas.
- **Solución recomendada:** eliminar las comparaciones muertas de `AuthScreen.tsx` (el login ya tiene su propia rama) y definir `accentSoft`/`accentBorder` en la paleta o reemplazarlos por tokens existentes (`primarySoft`/`border`).
- **Prioridad:** 2.

**P3 — Backend local apunta a Railway, no a Aiven; falta soporte de CA TLS.**
- **Archivos:** `backend/.env`, `backend/src/config/db.config.js`.
- **Evidencia:** §9.
- **Consecuencia:** el entorno local no reproduce producción; usando `?ssl=true` sin CA, la conexión cifra sin validar el certificado.
- **Solución recomendada:** actualizar el entorno local (sin tocar secretos en el repo) y añadir soporte de `ssl.ca` (leer un `ca.pem` fuera de git) para Aiven.
- **Prioridad:** 3.

### MEDIO

**P4 — Desalineación de dependencias nativas (triangular con S2).** `react-native-worklets@0.13.0 invalid`. Realinear versiones. Prioridad: 2 (sube a CRÍTICO si `logcat` confirma S2).

**P5 — Falta `babel.config.js`/`metro.config.js`.** La aplicación del plugin de Reanimated/worklets queda implícita. Verificar/agregar config explícita. Prioridad: 3.

**P6 — Cambios de configuración sin commitear** (`frontend/app.json`: `permissions` + `extra.eas.projectId`; `.gitignore`: `backups/`, `ca.pem`). Commitear para builds reproducibles. Prioridad: 3.

**P7 — Secretos reales en `backend/.env`.** Ignorado por git, pero debe rotarse si se expuso y nunca compartirse. Prioridad: 3.

**P8 — Versión de Node 24 vs `engines: 22.x`.** Fijar/alinear versión para evitar diferencias. Prioridad: 4.

**P9 — Inconsistencia de orígenes CORS** entre `app.js` y `eas.json`. Unificar el dominio. Prioridad: 4.

### BAJO

**P10 — `boxShadow` en estilos RN** (7 usos: `ui/index.tsx` L87,99,234,699,846; `Shell.tsx` L316,417). Soportado por RN 0.86 (New Architecture), pero es deuda: si se cambia de arquitectura o de versión, esos estilos podrían ignorarse o comportarse distinto.

**P11 — Documentación desactualizada** (`docs/ReporteEstadoProyecto.md`, `README.md`): mencionan Railway, "typecheck pasa" y un estado de e2e que ya no coincide.

---

## 16. Plan de corrección ordenado

> Sin generar APK hasta confirmar la causa raíz (regla 2) y sin refactors masivos durante la auditoría.

**Etapa A — Confirmar la causa raíz (bloqueante)**
1. Conseguir un dispositivo/emulador Android con `adb`.
2. Instalar el APK actual y capturar `adb logcat` (§4.6).
3. Registrar el stack trace y decidir si el fallo es **JS** (S1) o **nativo** (S2).

**Etapa B — Corregir el cierre (mínimo y fundamentado)**
4. Si S1: reemplazar la lectura de `window.location` por una comprobación de plataforma/nullsafe en `api.ts` (y endurecer el default de `normalizeApiBase`).
5. Si S2: realinear `react-native-reanimated`/`react-native-worklets` a las versiones compatibles con `expo-modules-core@57.0.22`; regenerar `package-lock.json`; verificar con `npx expo install --check`.

**Etapa C — Lograr un arranque estable**
6. Alinear los 4 paquetes de Expo SDK 57 a la versión esperada (`npx expo install --fix` revisado manualmente, sin cambios arbitrarios).
7. Añadir/verificar `babel.config.js` con `babel-preset-expo`.

**Etapa D — Backend y Aiven**
8. Actualizar el entorno local a Aiven; añadir soporte de `ssl.ca` si se usará el CA de Aiven. Validar sólo con lecturas.

**Etapa E — Calidad**
9. Corregir los 9 errores de typecheck; agregar los tokens faltantes.
10. Commitear `app.json`/`.gitignore`.
11. Ejecutar tests backend con `compose.test.yml` y luego e2e/a11y.

**Etapa F — Validación final**
12. Recién entonces generar un build de prueba y verificar: apertura, login, comunicación con el backend y navegación por rol.

---

## 17. Criterios verificables para considerar estable la aplicación

La app se considerará **estable** sólo cuando TODOS se cumplan **con evidencia**:

1. `adb logcat` de un arranque limpio **sin** `FATAL EXCEPTION` ni `ReactNativeJS` fatales.
2. El APK **abre** y permanece abierto; se ve la pantalla inicial (`/discover`).
3. `npx tsc --noEmit` en el frontend → **exit 0**.
4. `npx expo install --check` → **sin paquetes desactualizados**; `npm ls` → **sin `invalid`**.
5. La app **se comunica** con `https://proyecto-final-estanga.vercel.app` (login real contra el backend desplegado).
6. El backend desplegado responde usando **Aiven** (verificado por lecturas, sin migraciones).
7. Tests backend (`npm test`) **aprobados**; e2e/a11y ejecutados.
8. Cada rol (usuario/artista/organizador/admin) accede **sólo** a sus funciones (verificación funcional, no sólo estática).
9. `backend/.env` local alineado a Aiven y sin secretos expuestos.
10. Build reproducible desde un checkout limpio (config commiteada).

**Mientras 1 y 2 no se cumplan, Venti NO puede declararse estable.**

---

## Anexo A — Entorno de auditoría

- SO: Windows. Node **v24.15.0** (engines pide 22.x), npm 11.12.1, Expo CLI 57.0.29.
- **Sin** Android SDK, `adb`, `java`, emulador ni dispositivo. **Sin** APK local.
- Se respetaron las 13 reglas: sin builds de diagnóstico, sin migraciones ni escrituras en Aiven, sin cambios de credenciales, sin exponer secretos, sin ocultar errores y sin declarar aprobada ninguna prueba no ejecutada.
