# API — Autenticación, conciertos, compras y entradas

Recomendaciones y preferencias: [Etapa 6](VENTI_ETAPA_6.md).

El contrato de favoritos persistentes, asignaciones Staff y asistentes está en [Ajuste 5.1](VENTI_AJUSTE_5_1.md).

El contrato de conciertos, artistas, géneros, ubicaciones y tipos de entrada está en [Etapa 3](VENTI_ETAPA_3.md). Las rutas de autenticación siguientes se conservan.

El contrato de compras/reservas, tickets, validación QR, estados y cancelaciones está en [Etapa 4](VENTI_ETAPA_4.md).

Base: `http://localhost:3000`. JSON, nombres de campos indicados abajo; se rechazan propiedades extra en cuerpos de autenticación. Emails normalizados a minúsculas y sin espacios exteriores. Contraseña nueva: mínimo 12 caracteres, máximo 72 bytes UTF-8 (límite de bcrypt). IDs como strings.

Éxito: `{ "success": true, "data": ... }`.
Error: `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`. `details` solo aparece cuando corresponde. Sin stack traces, SQL ni secretos.

| Método y ruta | Body / autenticación | Resultado |
|---|---|---|
| POST `/auth/register` | `{first_name,last_name,email,password}` | 201: usuario público, `roles:["USER"]`, mensaje. Envía verificación. |
| POST `/auth/verify-email` | `{token}` | 200: email verificado; token de un solo uso. |
| POST `/auth/resend-verification` | `{email}` | 200: mensaje genérico; invalida verificaciones anteriores. |
| POST `/auth/login` | `{email,password}` | 200: sesión. |
| POST `/auth/refresh` | `{refreshToken}` | 200: nueva sesión; revoca refresh anterior atómicamente. |
| POST `/auth/logout` | `{refreshToken}` | 200: mensaje; idempotente. No requiere access vigente. |
| GET `/auth/me` | `Authorization: Bearer <accessToken>` | 200: `{user,roles,preferences}`. |
| POST `/auth/forgot-password` | `{email}` | 200: mensaje genérico para cuentas existentes, ausentes o inactivas. |
| POST `/auth/reset-password` | `{token,password}` | 200: cambia contraseña y revoca todos los refresh. |
| GET `/auth/oauth/:provider` | Query opcional: `mode=web` o `mode=mobile&codeChallenge=...` | 302 al proveedor y cookie HttpOnly. |
| GET `/auth/oauth/:provider/callback` | Query del proveedor: `state`, `code` o `error`; cookie del navegador | Sesión JSON (web) o deep link (mobile). |
| POST `/auth/oauth/:provider/link` | Bearer + `{mode?,codeChallenge?}` | `{authorizationUrl}` y cookie: inicia vinculación explícita al usuario autenticado. |
| POST `/auth/oauth/exchange` | `{code,codeVerifier}` | 200: sesión; código de un solo uso. |

Sesión: `{user,roles,accessToken,refreshToken,tokenType:"Bearer",expiresIn:900}` (expiración configurable). `user` contiene id, nombres, email, avatar, email_verified_at, estado y fechas; nunca password_hash. `preferences` contiene `recommendations_enabled` y `notifications_enabled`.

Estados: 400 JSON o estado OAuth inválido; 401 credenciales/token inválidos, caducados o consumidos; 403 falta de permisos, usuario pendiente de verificación u origen CORS; 404 ruta/recurso inexistente; 409 email o vinculación en conflicto; 422 validación; 429 límite; 500 error interno/configuración externa ausente.

Tokens persistidos de refresh, verificación y recuperación: 32 bytes aleatorios, representación hex de 64 caracteres; MySQL guarda exclusivamente SHA-256. Refresh 30 días, verificación 24 horas, recuperación 30 minutos por defecto. Todos configurables por env. Un refresh revocado no puede volver a usarse; no hay familia adicional ni revocación masiva por replay porque el esquema no la contiene.

## OAuth web

Abrir `/auth/oauth/google`, `/auth/oauth/github` o `/auth/oauth/facebook` en el navegador. La API crea un state de un uso (10 minutos), cookie HttpOnly SameSite=Lax (Secure en producción) y PKCE S256 para Google/GitHub. El callback consume el state ligado al mismo navegador y proveedor, canjea el código en servidor y responde JSON sin cache. Los tokens de proveedores no se persisten.

La identidad se resuelve primero por `(provider_id,provider_user_id)`. Si existe un usuario por email, el autovínculo requiere garantía de email verificado del proveedor **y** cuenta local previamente verificada. Así se evita conservar una contraseña que alguien pudiera haber prerregistrado usando un email ajeno.

Google usa `email_verified` de UserInfo ([referencia oficial](https://developers.google.com/identity/openid-connect/reference)); GitHub selecciona un email verificado de `/user/emails` ([referencia oficial](https://docs.github.com/en/rest/users/emails)). GitHub admite PKCE S256 ([flujo oficial](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)). Para Facebook se adopta una política conservadora: no inferir verificación del email a partir de atributos del perfil. Una cuenta nueva recibe verificación local; con la política por defecto no obtiene sesión hasta verificarla. Una cuenta existente debe usar vinculación explícita autenticada.

Si el proveedor no entrega email, un usuario nuevo recibe `OAUTH_EMAIL_REQUIRED`: registrarse por email, verificar, iniciar sesión y vincular explícitamente. La vinculación explícita se completa en un navegador que conserve la cookie de `/link`; el cliente web debe usar `credentials: include`. No se acepta un `userId` ni un redirect arbitrario del cliente.

En Etapa 5, `mode=web&codeChallenge=<S256>` redirige a `WEB_OAUTH_REDIRECT_URL` con un código efímero y utiliza `/auth/oauth/exchange`, igual que Mobile. El destino es fijo y configurado por servidor (HTTPS en producción). El modo web sin challenge conserva la respuesta JSON anterior.

## React Native / Expo

1. El cliente genera `codeVerifier` aleatorio de 43–128 caracteres permitidos por PKCE y conserva ese valor.
2. Calcula `codeChallenge = base64url(SHA256(codeVerifier))`, sin padding.
3. Abre en navegador del sistema `/auth/oauth/google?mode=mobile&codeChallenge=...` (también github/facebook). Inicio y callback se hacen en ese mismo navegador para conservar cookie.
4. El callback redirige exclusivamente a `APP_DEEP_LINK`, por ejemplo `venti://oauth-callback?code=<código efímero>`. Nunca coloca access/refresh tokens en la URL.
5. El cliente POSTea `{code,codeVerifier}` a `/auth/oauth/exchange`. El código vence en 60 segundos y solo se consume si el verifier coincide.
6. Recibe la sesión y guarda el refresh en almacenamiento seguro. La implementación de ese cliente queda fuera de Etapa 2.

Las respuestas de error OAuth son JSON en la API; el cliente futuro debe permitir cerrar el navegador y mostrar el error. `APP_DEEP_LINK` y callbacks provienen exclusivamente del entorno, sin redirecciones proporcionadas por usuarios.

## Email

Las URLs SMTP llevan el token en el fragmento para que no llegue en requests HTTP ni Referer. El cliente debe leer `#token=...` y enviarlo en JSON. La verificación y reset no se ejecutan mediante GET, evitando consumo accidental por escáneres de enlaces. Reenviar invalida el enlace previo. Las respuestas de recuperación nunca incluyen tokens ni informan si el email existe.
