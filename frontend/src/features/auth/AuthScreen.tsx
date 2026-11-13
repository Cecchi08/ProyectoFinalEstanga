// Pantalla de autenticación: ingreso, registro, validación de correo y recuperación de cuenta.
import { useEffect, useState } from "react";
import { Link, Redirect, router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { Platform, Pressable, Text, View } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../services/api";
import {
  PUBLIC_REGISTRATION_ROLES,
  ROLE_GUIDES,
  type PublicRegistrationRole,
} from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  colors,
  Copy,
  Field,
  FormScope,
  MusicalCover,
  Notice,
  Page,
  radius,
  styles,
  useAction,
  useBento,
  useForm,
} from "../../components/ui";
import { finishOAuth, startOAuth } from "./oauth";

type Mode =
  | "login"
  | "register"
  | "verify-email"
  | "forgot-password"
  | "reset-password"
  | "oauth-callback";

const titles: Record<Mode, string> = {
  login: "La música te espera.",
  register: "Creá tu cuenta",
  "verify-email": "Validación de correo electrónico",
  "forgot-password": "Recuperá tu cuenta",
  "reset-password": "Nueva contraseña",
  "oauth-callback": "Conectando tu cuenta",
};

export default function AuthScreen({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const action = useAction();
  const resendAction = useAction();
  const form = useForm();
  const { desktop } = useBento();
  const params = useLocalSearchParams<{ code?: string; token?: string; email?: string }>();
  const url = Linking.useURL();

  const [email, setEmail] = useState(params.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<PublicRegistrationRole>("COMPRADOR");
  const [token, setToken] = useState(params.token ?? "");
  const [registeredSuccess, setRegisteredSuccess] = useState(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  const requiresPhone = role === "ORGANIZADOR" || role === "VENUE" || role === "EMPRESA_SERVICIOS";

  // Extracción del token seguro desde la URL o el fragmento hash si proviene del enlace de correo.
  useEffect(() => {
    let value = params.token;
    if (!value && Platform.OS === "web" && typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search).get("token");
      const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, "")).get("token");
      value = search || hash || undefined;
    } else if (!value && url) {
      const [baseAndQuery, fragment] = url.split("#");
      const queryPart = baseAndQuery.split("?")[1] ?? "";
      value = new URLSearchParams(queryPart).get("token") ?? new URLSearchParams(fragment ?? "").get("token") ?? undefined;
    }
    if (value) {
      setToken(value);
      if (Platform.OS === "web" && typeof window !== "undefined" && mode === "verify-email") {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [url, params.token, mode]);

  // Si se abre la pantalla con un token de validación en la URL, se ejecuta automáticamente la validación segura.
  useEffect(() => {
    if (mode === "verify-email" && token && !verifiedSuccess) {
      void action.run(async () => {
        const { data } = await api.request<{ message?: string }>("/auth/verify-email", {
          method: "POST",
          body: { token: token.trim() },
          auth: false,
        });
        setVerifiedSuccess(true);
        action.setMessage(data.message ?? "¡Tu correo electrónico ha sido validado exitosamente!");
      });
    }
  }, [mode, token, verifiedSuccess]);

  // Manejo del intercambio de credenciales OAuth de terceros.
  useEffect(() => {
    if (mode === "oauth-callback" && params.code) {
      void action.run(async () => {
        await finishOAuth(params.code!);
        router.replace("/cartelera");
      });
    }
  }, [mode, params.code]);

  if (
    auth.user &&
    (mode === "login" || mode === "register" || mode === "oauth-callback")
  ) {
    return <Redirect href="/cartelera" />;
  }

  // Envío del formulario principal con validación previa y reinicio de errores.
  const submit = () =>
    action.run(async () => {
      form.assertValid();

      if (mode === "login") {
        await auth.login(email.trim(), password);
        router.replace("/cartelera");
        return;
      }

      if (mode === "register") {
        const body = {
          first_name: first.trim(),
          last_name: last.trim(),
          email: email.trim(),
          password,
          role,
          phone: phone.trim() ? phone.trim() : null,
        };
        const { data } = await api.request<{ message?: string }>(
          "/auth/register",
          { method: "POST", body, auth: false },
        );
        // Reiniciamos el formulario y ocultamos errores previos.
        form.reset();
        setPassword("");
        setRegisteredSuccess(true);
        action.setMessage(
          data.message ?? "Cuenta creada exitosamente. Revisá tu casilla de correo para validarla.",
        );
        return;
      }

      if (mode === "reset-password") {
        if (password !== confirmPassword) {
          throw new Error("Las contraseñas no coinciden.");
        }
        if (!token.trim()) {
          throw new Error("Enlace de recuperación inválido o vencido. Solicitá uno nuevo.");
        }
        const body = { token: token.trim(), password };
        const { data } = await api.request<{ message?: string }>(
          "/auth/reset-password",
          { method: "POST", body, auth: false },
        );
        form.reset();
        setPassword("");
        setConfirmPassword("");
        action.setMessage(data.message ?? "Contraseña actualizada exitosamente. Ya podés iniciar sesión.");
        return;
      }

      if (mode === "forgot-password") {
        const body = { email: email.trim() };
        const { data } = await api.request<{ message?: string }>(
          "/auth/forgot-password",
          { method: "POST", body, auth: false },
        );
        form.reset();
        action.setMessage(data.message ?? "Enlace de recuperación enviado. Revisá tu correo.");
        return;
      }
    });

  // Reenvío del correo de validación con retroalimentación completa de carga, éxito y error.
  const handleResendVerification = () => {
    void resendAction.run(async () => {
      if (!email.trim()) {
        throw new Error("Ingresá tu correo electrónico para reenviar la validación.");
      }
      const { data } = await api.request<{ message?: string }>("/auth/resend-verification", {
        method: "POST",
        body: { email: email.trim() },
        auth: false,
      });
      resendAction.setMessage(
        data.message ?? `Se ha reenviado el correo de validación a ${email.trim()}. Revisá tu casilla.`,
      );
    });
  };

  // Tarjeta informativa de perfiles para el ingreso en Venti.
  const roleInfo = (
    <View
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
        flexBasis: desktop ? 520 : "auto",
        width: desktop ? undefined : "100%",
        gap: 16,
      }}
    >
      <Card variant="featured" style={{ gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Text style={[styles.label, { color: colors.accent }]}>Venti para cada perfil</Text>
          <Text style={styles.heading}>Ingresá a tu acceso</Text>
        </View>
        <Copy muted>
          Descubrí conciertos, gestioná eventos, contratá artistas, reservá espacios y pedí servicios desde una sola plataforma.
        </Copy>
        <View style={{ gap: 8 }}>
          {PUBLIC_REGISTRATION_ROLES.map((item) => (
            <View
              key={item}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 2,
              }}
            >
              <Copy weight="700" size="small">{ROLE_GUIDES[item].title}</Copy>
              <Copy muted size="small">{ROLE_GUIDES[item].subtitle}</Copy>
              <Copy muted size="small">{ROLE_GUIDES[item].allows}</Copy>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );

  return (
    <Page title="VENTI" subtitle="Tu próxima noche inolvidable empieza acá.">
      <BentoGrid style={{ alignItems: "stretch" }}>
        {mode === "login" ? (
          <>
            {desktop && roleInfo}
            <View
              style={{
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                flexBasis: desktop ? 420 : "auto",
                maxWidth: desktop ? 500 : 520,
                alignSelf: "center",
                width: "100%",
                gap: 16,
              }}
            >
              <Card variant="featured">
                <FormScope form={form}>
                  <Text style={styles.heading}>{titles[mode]}</Text>
                  <Field
                    label="Email"
                    required
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                  <Field
                    label="Contraseña"
                    required
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="current-password"
                  />
                  <ActionFeedback action={action} />
                  <Notice message={auth.error} error />
                </FormScope>
                <Button title="Ingresar" disabled={action.busy} onPress={() => void submit()} />
                <View style={{ gap: 10, paddingTop: 6, borderTopWidth: 1, borderColor: colors.border }}>
                  <Copy muted>O continuá con</Copy>
                  <View style={styles.row}>
                    {(["google", "github", "facebook"] as const).map((provider) => (
                      <Button
                        key={provider}
                        title={provider}
                        secondary
                        disabled={action.busy}
                        onPress={() => void action.run(() => startOAuth(provider))}
                      />
                    ))}
                  </View>
                </View>
              </Card>
              <Card variant="subtle" style={{ paddingVertical: 14 }}>
                <View style={styles.row}>
                  <Link href="/register" style={{ color: colors.accent, paddingVertical: 6, paddingHorizontal: 8, fontWeight: "600", fontSize: 14 }}>
                    Registrarse
                  </Link>
                  <Link href="/forgot-password" style={{ color: colors.accent, paddingVertical: 6, paddingHorizontal: 8, fontWeight: "600", fontSize: 14 }}>
                    Olvidé mi contraseña
                  </Link>
                </View>
              </Card>
            </View>
            {!desktop && roleInfo}
          </>
        ) : mode === "verify-email" ? (
          // Vista especializada para validación de correo sin entrada manual de token
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              maxWidth: 540,
              alignSelf: "center",
              width: "100%",
              gap: 16,
            }}
          >
            <Card variant="featured" style={{ gap: 16 }}>
              <View style={{ gap: 6 }}>
                <Text style={styles.heading}>Validación de correo electrónico</Text>
                <Copy muted>
                  {verifiedSuccess
                    ? "Tu dirección de correo fue confirmada correctamente."
                    : "Confirmá tu dirección de email para activar tu cuenta de Venti."}
                </Copy>
              </View>

              {/* Indicador de estado */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 12,
                  borderRadius: radius.md,
                  backgroundColor: verifiedSuccess ? colors.successSoft : colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: verifiedSuccess ? colors.successBorder : colors.border,
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
                    Estado de validación
                  </Text>
                  <Text style={{ color: verifiedSuccess ? colors.successText : colors.text, fontSize: 14, fontWeight: "700" }}>
                    {verifiedSuccess ? "✓ Correo validado" : "⏳ Pendiente de validación"}
                  </Text>
                </View>
              </View>

              {/* Información sobre el correo destinatario */}
              <View style={{ gap: 10 }}>
                <Field
                  label="Correo electrónico"
                  required
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!verifiedSuccess && !resendAction.busy}
                />
                <Copy muted size="small">
                  {verifiedSuccess
                    ? "Tu cuenta ya se encuentra activa. Podés iniciar sesión con normalidad."
                    : "Te enviamos un enlace de validación a esta casilla. Hacé clic en el enlace para activar tu cuenta."}
                </Copy>
              </View>

              {/* Mensajes de retroalimentación de la acción */}
              <ActionFeedback action={action} />
              <ActionFeedback action={resendAction} />

              {/* Acciones principales */}
              {verifiedSuccess ? (
                <Button
                  title="Iniciar sesión"
                  onPress={() => router.replace("/login")}
                />
              ) : (
                <Button
                  title="Reenviar correo de validación"
                  disabled={resendAction.busy}
                  onPress={handleResendVerification}
                />
              )}
            </Card>

            <Card variant="subtle" style={{ paddingVertical: 14 }}>
              <View style={styles.row}>
                <Link
                  href="/login"
                  style={{ color: colors.accent, paddingVertical: 6, paddingHorizontal: 8, fontWeight: "600", fontSize: 14 }}
                >
                  Volver al inicio de sesión
                </Link>
                <Link
                  href="/register"
                  style={{ color: colors.accent, paddingVertical: 6, paddingHorizontal: 8, fontWeight: "600", fontSize: 14 }}
                >
                  Crear otra cuenta
                </Link>
              </View>
            </Card>
          </View>
        ) : (
          <>
            {desktop && (
              <View
                aria-hidden
                style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: 520, gap: 16 }}
              >
                <Card variant="featured">
                  <MusicalCover
                    alt="Escenario principal de Venti"
                    kind="concert"
                    height={200}
                    badge="ECOSISTEMA MUSICAL"
                    subBadge="EN VIVO"
                  />
                  <Text style={styles.heading}>
                    Conciertos, artistas, espacios y servicios en una sola plataforma modular.
                  </Text>
                  <Copy muted>
                    Descubrí shows en vivo, adquirí entradas con validación QR instantánea, reservá salas de ensayo o contratá equipamiento profesional para tu próximo evento.
                  </Copy>
                </Card>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Card variant="subtle">
                      <Text style={[styles.label, { color: colors.accent }]}>TICKETS QR</Text>
                      <Copy strong>Acceso directo</Copy>
                      <Copy muted>Entradas digitales con código único y control de puerta en tiempo real.</Copy>
                    </Card>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Card variant="subtle">
                      <Text style={[styles.label, { color: colors.accent }]}>MARKETPLACE</Text>
                      <Copy strong>Salas y técnica</Copy>
                      <Copy muted>Estudios, escenarios, sonido e iluminación verificados.</Copy>
                    </Card>
                  </View>
                </View>
              </View>
            )}
            <View
              style={{
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                flexBasis: desktop ? 420 : "auto",
                maxWidth: desktop ? 500 : 520,
                alignSelf: "center",
                width: "100%",
                gap: 16,
              }}
            >
              {/* Si el registro fue exitoso, se muestra exclusivamente la pantalla limpia de confirmación */}
              {registeredSuccess ? (
                <Card variant="featured" style={{ gap: 16 }}>
                  <View style={{ gap: 6 }}>
                    <Text style={styles.heading}>¡Revisá tu correo!</Text>
                    <Copy muted>
                      Enviamos un correo de validación a <Text style={{ color: colors.text, fontWeight: "700" }}>{email}</Text>.
                    </Copy>
                  </View>

                  <View
                    style={{
                      padding: 14,
                      borderRadius: radius.md,
                      backgroundColor: colors.successSoft,
                      borderWidth: 1,
                      borderColor: colors.successBorder,
                      gap: 6,
                    }}
                  >
                    <Text style={{ color: colors.successText, fontSize: 14, fontWeight: "700" }}>
                      ✓ Registro completado
                    </Text>
                    <Copy size="small" color={colors.successText}>
                      Hacé clic en el enlace seguro enviado a tu casilla para activar tu cuenta antes de iniciar sesión. Si no lo encontrás, revisá la carpeta de correo no deseado o spam.
                    </Copy>
                  </View>

                  <ActionFeedback action={resendAction} />

                  <View style={{ gap: 10 }}>
                    <Button
                      title="Ir a Iniciar Sesión"
                      onPress={() => router.replace("/login")}
                    />
                    <Button
                      title="Reenviar correo de validación"
                      secondary
                      disabled={resendAction.busy}
                      onPress={handleResendVerification}
                    />
                  </View>
                </Card>
              ) : (
                <Card variant="featured">
                  <FormScope form={form}>
                    <Text style={styles.heading}>{titles[mode]}</Text>
                    {mode === "register" && (
                      <View style={{ gap: 10 }}>
                        <Text style={styles.label}>ELEGÍ EL PERFIL DE TU CUENTA</Text>
                        <Copy muted size="small">
                          Elegí el tipo de actividad principal que querés desarrollar dentro de Venti.
                        </Copy>
                        <View style={{ gap: 8 }}>
                          {PUBLIC_REGISTRATION_ROLES.map((item) => {
                            const selected = role === item;
                            const guide = ROLE_GUIDES[item];
                            return (
                              <Pressable
                                key={item}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: selected }}
                                accessibilityLabel={`${guide.title}: ${guide.subtitle}`}
                                onPress={() => setRole(item)}
                                style={{
                                  paddingVertical: 10,
                                  paddingHorizontal: 14,
                                  borderRadius: radius.md,
                                  borderWidth: 1,
                                  borderColor: selected ? colors.primary : colors.border,
                                  backgroundColor: selected ? colors.primarySoft : colors.surfaceAlt,
                                  gap: 2,
                                }}
                              >
                                <View style={styles.between}>
                                  <Copy weight="700" color={selected ? colors.accent : colors.text}>
                                    {guide.title}
                                  </Copy>
                                  <Text style={{ color: selected ? colors.accent : colors.muted, fontSize: 12, fontWeight: "700" }}>
                                    {selected ? "● Seleccionado" : "○ Elegir"}
                                  </Text>
                                </View>
                                <Copy muted size="small">{guide.subtitle}</Copy>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View
                          style={{
                            padding: 12,
                            borderRadius: radius.md,
                            backgroundColor: colors.surfaceAlt,
                            borderWidth: 1,
                            borderColor: colors.borderStrong,
                            gap: 4,
                          }}
                        >
                          <Copy size="label" color={colors.accent}>
                            {ROLE_GUIDES[role].title.toUpperCase()}
                          </Copy>
                          <Copy size="small">{ROLE_GUIDES[role].allows}</Copy>
                        </View>
                        <View style={styles.row}>
                          <Field label="Nombre" required value={first} onChangeText={setFirst} autoComplete="given-name" />
                          <Field label="Apellido" required value={last} onChangeText={setLast} autoComplete="family-name" />
                        </View>
                        <Field
                          label="Teléfono de contacto"
                          required={requiresPhone}
                          placeholder="+54 223 555-0100"
                          value={phone}
                          onChangeText={setPhone}
                          keyboardType="phone-pad"
                          autoComplete="tel"
                        />
                      </View>
                    )}
                    {["register", "forgot-password"].includes(mode) && (
                      <Field
                        label="Email"
                        required
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoComplete="email"
                      />
                    )}
                    {mode === "reset-password" && (
                      <>
                        <Field
                          label="Nueva contraseña"
                          required
                          rules={[
                            (value) => (value.length >= 12 ? null : "La contraseña debe tener al menos 12 caracteres."),
                          ]}
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry
                          autoComplete="new-password"
                        />
                        <Field
                          label="Confirmar nueva contraseña"
                          required
                          rules={[
                            (value) => (value.length >= 12 ? null : "La confirmación debe tener al menos 12 caracteres."),
                            (value) => (value === password ? null : "Las contraseñas no coinciden."),
                          ]}
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          secureTextEntry
                          autoComplete="new-password"
                        />
                      </>
                    )}
                    {mode === "register" && (
                      <Field
                        label="Contraseña (mínimo 12 caracteres)"
                        required
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoComplete="new-password"
                      />
                    )}
                    <ActionFeedback action={action} />
                  </FormScope>
                  {mode !== "oauth-callback" && (
                    <Button
                      title={mode === "register" ? "Registrarme" : mode === "reset-password" ? "Cambiar contraseña" : "Continuar"}
                      disabled={action.busy}
                      onPress={() => void submit()}
                    />
                  )}
                </Card>
              )}
              <Card variant="subtle" style={{ paddingVertical: 14 }}>
                <View style={styles.row}>
                  {(["login", "register", "forgot-password", "verify-email"] as const)
                    .filter((item) => item !== mode)
                    .map((item) => (
                      <Link
                        key={item}
                        href={`/${item}`}
                        style={{ color: colors.accent, paddingVertical: 6, paddingHorizontal: 8, fontWeight: "600", fontSize: 14 }}
                      >
                        {
                          {
                            login: "Ingresar",
                            register: "Registrarse",
                            "forgot-password": "Olvidé mi contraseña",
                            "verify-email": "Validar correo",
                          }[item]
                        }
                      </Link>
                    ))}
                </View>
              </Card>
            </View>
          </>
        )}
      </BentoGrid>
    </Page>
  );
}
