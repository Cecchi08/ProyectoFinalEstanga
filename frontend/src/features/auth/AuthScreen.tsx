import { useEffect, useState } from "react";
import { Link, Redirect, router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { Platform, View } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../services/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Field,
  Notice,
  Page,
  styles,
  useAction,
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
  const params = useLocalSearchParams<{ code?: string; token?: string }>();
  const url = Linking.useURL();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [token, setToken] = useState("");
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
      <View
        style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: 20 }}
      >
        <Card>
          <Copy>{titles[mode]}</Copy>
          {mode === "register" && (
            <>
              <Field label="Nombre" value={first} onChangeText={setFirst} />
              <Field label="Apellido" value={last} onChangeText={setLast} />
            </>
          )}
          {["login", "register", "forgot-password"].includes(mode) && (
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
            />
          )}
          {["verify-email", "reset-password"].includes(mode) && (
            <Field
              label="Token del enlace de email"
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
            <>
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
            </>
          )}
        </Card>
        <View style={styles.row}>
          {(["login", "register", "forgot-password", "verify-email"] as const)
            .filter((item) => item !== mode)
            .map((item) => (
              <Link
                key={item}
                href={`/${item}`}
                style={{ color: "#ba9bff", padding: 8 }}
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
      </View>
    </Page>
  );
}
