# Etapa 8 — Pulido, documentación y entrega

Revisión del 6 de octubre de 2026 sobre el proyecto existente. Sin funcionalidades nuevas ni cambios de schema/arquitectura. Se preservaron las modificaciones previas de etapas 1–7.

## Cambios

- Cliente HTTP: valida el envelope y maneja JSON nulo/inválido y errores HTML del proxy sin TypeError. Conserva códigos de negocio; evita exponer detalles técnicos de validación y errores 5xx.
- Pantalla recuperable ante un error de renderizado, indicador accesible de operación, campos acotados al contenedor y menú desktop desplazable verticalmente.
- Al desactivar un recurso se limpia también su error anterior. Se mantienen locks de acciones y refresh compartido para evitar duplicados.
- ESLint compartido desde devDependencies frontend, sin cambios en TypeScript backend ni dependencias de ejecución. Corrección de optional chaining en un test; excepción localizada para el regex que rechaza caracteres de control.
- E2E completo también a 768 px y selección portable Chromium/Edge; prueba de ancho/scroll del menú y recuperación con respuestas inválidas 400/403/404/409/422/429/500/200. README, contrato API, instalación, manual y EAS preparados.

## Seguridad y límites

JWT HS256 con issuer/audience/expiración; roles y estado de usuario consultados en MySQL; refresh rotativo y tokens de email guardados como hash; OAuth state/cookie/PKCE con destinos fijos. Ownership, SQL parametrizado, stock y QR con transacciones, CORS exacto y límites en autenticación revisados y cubiertos por suites existentes. Sin secretos reales detectados en los archivos versionados; se ignoran también artefactos y credenciales de firma Android/iOS.

El rate limit actual cubre `/auth`; no se afirma que exista uno global. Web conserva refresh en localStorage, accesible a JavaScript del mismo origen. Access emitidos conservan su corta vigencia tras logout/reset. Estados OAuth, códigos de intercambio y contadores son locales a una instancia. SMTP no tiene cola durable. Son límites existentes, sin rediseño en esta etapa.

### Dependencias: pendiente externo

`npm audit --omit=dev` backend: **0 avisos**. `npm audit` frontend: **35 paquetes afectados (21 high, 14 moderate)**, incluyendo propagación por la cadena de Expo/React Native. No equivalen a 35 fallos independientes de VENTI.

| Origen | Alcance revisado / decisión |
| --- | --- |
| [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Patrones de herramientas Metro; sin versión corregida indicada. No admitir configuración/código de terceros no confiables en el entorno de build. |
| [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Herramientas de certificados Expo; sin parche indicado. No se usa para JWT de VENTI. |
| [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | Cadena Babel/Jest; sin parche indicado. |
| [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | xcode usa v4, fuera de los métodos v3/v5/v6 afectados. No se fuerza un salto mayor transitivo. |
| [decode-uri-component](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Riesgo de bloqueo por URL malformada en la cadena expo-router → query-string. 0.5.0 corrige, pero cambia a ESM y no conserva el `require()` invocable de query-string 7. No se aplica un override incompatible. Requiere actualización compatible del proveedor antes de publicación pública. |

No se ejecutó `npm audit fix --force`: la propuesta incluye reemplazos mayores incompatibles (incluso Expo 44). La seguridad de dependencias **no queda certificada sin pendientes**. Repetir auditoría al generar la entrega pública y migrar el conjunto Expo/Router de forma coordinada cuando corresponda.

## Verificación y entrega

Los comandos reproducibles están en [Instalación](INSTALLATION.md#tests). Logs locales en `.local/stage8-*` y capturas en `frontend/test-results` (ignorados por Git).

| Comprobación | Resultado |
| --- | --- |
| TypeScript frontend/backend | OK, strict en módulos TS |
| Lint frontend/backend | OK, cero advertencias de ESLint |
| Tests backend / frontend / E2E | 141/141 · 13/13 · 6/6 (160/160 total) |
| Backend build / Expo Web | OK / OK |
| Export Hermes Android e iOS / expo install --check | OK / OK |
| Responsive Web 390 / 768 / 1440 | OK; flujo completo, QR, permisos, estados y estadísticas |
| APK firmado | PENDIENTE: EAS `whoami` devuelve `Not logged in`; no hay JDK/SDK Android disponibles en PATH |
| Auditoría de dependencias | Backend productivo sin avisos; frontend con pendientes externos detallados arriba |

El aviso de Expo sobre `NO_COLOR`/`FORCE_COLOR` proviene de variables del entorno de ejecución, no del código de la aplicación.

La validación responsive se realiza sobre Web a 390/768/1440 px y el código compartido exporta para Android/iOS. No certifica interacción en teléfono físico. APK/AAB firmado, SMTP/OAuth reales y prueba física requieren configuración externa. EAS y comandos exactos están en [Instalación](INSTALLATION.md#android-apk--eas).
