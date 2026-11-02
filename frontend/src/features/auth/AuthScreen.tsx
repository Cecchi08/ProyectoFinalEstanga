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
  "verify-email": "Verificá tu email",
  "forgot-password": "Recuperá tu cuenta",
  "reset-password": "Nueva contraseña",
  "oauth-callback": "Conectando tu cuenta",
};

export default function AuthScreen({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const action = useAction();
  const form = useForm();
  const { desktop } = useBento();
  const params = useLocalSearchParams<{ code?: string; token?: string }>();
  const url = Linking.useURL();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<PublicRegistrationRole>("COMPRADOR");
  const [token, setToken] = useState("");
  const requiresPhone = role === "ORGANIZADOR" || role === "VENUE" || role === "EMPRESA_SERVICIOS";
  useEffect(() => {
    const raw =
      Platform.OS === "web" ? window.location.hash : (url?.split("#")[1] ?? "");
    const value =
      new URLSearchParams(raw.replace(/^#/, "")).get("token") ?? params.token;
    if (value) {
      setToken(value);
      if (Platform.OS === "web")
        window.history.replaceState(null, "", window.location.pathname);
    }
  }, [url, params.token]);
  useEffect(() => {
    if (mode === "oauth-callback" && params.code)
      void action.run(async () => {
        await finishOAuth(params.code!);
        router.replace("/discover");
      });
  }, [mode, params.code]);
  if (
    auth.user &&
    (mode === "login" || mode === "register" || mode === "oauth-callback")
  )
    return <Redirect href="/discover" />;
  const submit = () =>
    action.run(async () => {
      form.assertValid();
      if (mode === "login") {
        await auth.login(email.trim(), password);
        router.replace("/discover");
        return;
      }
      const body =
        mode === "register"
          ? {
              first_name: first.trim(),
              last_name: last.trim(),
              email: email.trim(),
              password,
              role,
              phone: phone.trim() ? phone.trim() : null,
            }
          : mode === "verify-email"
            ? { token: token.trim() }
            : mode === "reset-password"
              ? { token: token.trim(), password }
              : { email: email.trim() };
      const { data } = await api.request<{ message?: string }>(
        `/auth/${mode}`,
        { method: "POST", body, auth: false },
      );
      action.setMessage(
        data.message ??
          (mode === "register"
            ? "Cuenta creada. Revisá tu email para verificarla."
            : "Operación completada. Ya podés volver al ingreso."),
      );
      setPassword("");
    });
  return (
    <Page title="VENTI" subtitle="Tu próxima noche inolvidable empieza acá.">
      <BentoGrid style={{ alignItems: "stretch" }}>
        {mode === "login" ? (
          <>
            <View
              style={{
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                flexBasis: desktop ? 520 : "100%",
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
            <View
              style={{
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                flexBasis: desktop ? 420 : "100%",
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
          </>
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
                flexBasis: desktop ? 420 : "100%",
                maxWidth: desktop ? 500 : 520,
                alignSelf: "center",
                width: "100%",
                gap: 16,
              }}
            >
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
                  {["login", "register", "forgot-password"].includes(mode) && (
                    <Field
                      label="Email"
                      required
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                  )}
                  {["verify-email", "reset-password"].includes(mode) && (
                    <Field
                      label="Token del enlace de email"
                      required
                      rules={[(value) => (/^[a-f0-9]{64}$/.test(value.trim()) ? null : "El token del enlace tiene 64 caracteres hexadecimales.")]}
                      value={token}
                      onChangeText={setToken}
                    />
                  )}
                  {["login", "register", "reset-password"].includes(mode) && (
                    <Field
                      label={
                        mode === "login"
                          ? "Contraseña"
                          : "Contraseña (mínimo 12 caracteres)"
                      }
                      required
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                    />
                  )}
                  <ActionFeedback action={action} />
                  {mode === "login" && <Notice message={auth.error} error />}
                </FormScope>
                {mode !== "oauth-callback" && (
                  <Button
                    title={mode === "login" ? "Ingresar" : "Continuar"}
                    disabled={action.busy}
                    onPress={() => void submit()}
                  />
                )}
                {mode === "verify-email" && (
                  <>
                    <Field
                      label="Email para reenviar verificación"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                    />
                    <Button
                      title="Reenviar email"
                      secondary
                      disabled={action.busy}
                      onPress={() =>
                        void action.run(async () => {
                          await api.request("/auth/resend-verification", {
                            method: "POST",
                            body: { email },
                            auth: false,
                          });
                          action.setMessage("Revisá tu correo.");
                        })
                      }
                    />
                  </>
                )}
                {mode === "login" && (
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
                )}
              </Card>
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
                            "verify-email": "Verificar email",
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
