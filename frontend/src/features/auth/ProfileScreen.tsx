import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Switch, View } from "react-native";
import { usePreferences } from "../../contexts/PreferencesContext";
import NotificationPreference from '../notifications/NotificationPreference';
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { primaryRole, ROLE_GUIDES, type Me } from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  Page,
  ResourceState,
  colors,
  styles,
  switchColors,
  useAction,
  useBento,
} from "../../components/ui";
export default function ProfileScreen() {
  const auth = useAuth();
  const preferences = usePreferences();
  const action = useAction();
  const saveAction = useAction();
  // /auth/me also carries the permissions; the context keeps them for the whole app.
  const resource = useResource<Me>("/auth/me");
  const profile = resource.result?.data;
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (profile?.user) {
      setFirstName(profile.user.first_name ?? "");
      setLastName(profile.user.last_name ?? "");
      setPhone(profile.user.phone ?? "");
    }
  }, [profile]);

  const activeRole = primaryRole(profile?.roles ?? auth.roles);
  const guide = activeRole !== "GUEST" ? ROLE_GUIDES[activeRole] : null;

  return (
    <Page title="Mi cuenta" subtitle="Gestioná tus datos personales, preferencias y seguridad.">
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <BentoGrid>
        <View style={[bento.cell(1, cols), { gap: 16 }]}>
          {profile && (
            <Card variant="featured">
              <View style={styles.between}>
                <View style={styles.badge}>
                  <Copy size="label" color={colors.accentText}>CUENTA</Copy>
                </View>
              </View>
              <Copy size="heading" weight="700">
                {profile.user.first_name} {profile.user.last_name}
              </Copy>
              <Copy muted>{profile.user.email}</Copy>
              {profile.user.phone ? <Copy muted size="small">Teléfono: {profile.user.phone}</Copy> : null}
              {guide && (
                <Card variant="subtle" style={{ padding: 12, gap: 4 }}>
                  <Copy weight="700" size="small">{guide.title} — {guide.subtitle}</Copy>
                  <Copy muted size="small">{guide.allows}</Copy>
                </Card>
              )}
              <View style={styles.row}>
                {activeRole === "ARTISTA" && (
                  <Button
                    title="Panel de Artista"
                    secondary
                    onPress={() => router.push("/artists")}
                  />
                )}
                {activeRole === "ORGANIZADOR" && (
                  <Button
                    title="Mis conciertos"
                    secondary
                    onPress={() => router.push("/organizer")}
                  />
                )}
                {activeRole === "VENUE" && (
                  <Button
                    title="Mi Espacio Físico"
                    secondary
                    onPress={() => router.push("/marketplace/manage")}
                  />
                )}
                {activeRole === "EMPRESA_SERVICIOS" && (
                  <Button
                    title="Mi Empresa y Servicios"
                    secondary
                    onPress={() => router.push("/services/mine")}
                  />
                )}
                {activeRole === "ADMIN" && (
                  <Button
                    title="Panel Admin"
                    secondary
                    onPress={() => router.push("/admin")}
                  />
                )}
              </View>
            </Card>
          )}

          {profile && (
            <Card>
              <Copy size="subheading" weight="700">Datos de contacto</Copy>
              <View style={styles.row}>
                <Field label="Nombre" value={firstName} onChangeText={setFirstName} />
                <Field label="Apellido" value={lastName} onChangeText={setLastName} />
              </View>
              <Field
                label="Teléfono"
                placeholder="+54 223 555-0100"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              <ActionFeedback action={saveAction} />
              <Button
                title="Guardar datos"
                disabled={saveAction.busy}
                onPress={() =>
                  void saveAction.run(async () => {
                    await api.request("/auth/me", {
                      method: "PATCH",
                      body: {
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        phone: phone.trim() ? phone.trim() : null,
                      },
                    });
                    await resource.reload();
                    saveAction.setMessage("Datos personales actualizados.");
                  })
                }
              />
            </Card>
          )}

          <Card>
            <Copy size="subheading" weight="700">Accesos directos y seguridad</Copy>
            <View style={styles.row}>
              <Button
                title="Mis entradas"
                secondary
                onPress={() => router.push("/tickets")}
              />
              <Button
                title="Historial de compras"
                onPress={() => router.push("/purchases")}
              />
              <Button
                title="Restablecer contraseña"
                secondary
                onPress={() => router.push("/forgot-password")}
              />
            </View>
            <ActionFeedback action={action} />
            <Button
              title="Cerrar sesión"
              secondary
              disabled={action.busy}
              onPress={() => void action.run(() => auth.logout())}
            />
          </Card>
        </View>

        <View style={[bento.cell(1, cols), { gap: 16 }]}>
          <Card>
            <View style={styles.between}>
              <Copy size="subheading" weight="700">Recomendaciones personalizadas</Copy>
              {preferences.enabled !== null && (
                <Switch {...switchColors}
                  accessibilityLabel="Recomendaciones personalizadas"
                  value={preferences.enabled}
                  disabled={preferences.loading || preferences.saving}
                  onValueChange={(value) => void preferences.setEnabled(value)}
                />
              )}
            </View>
            <ResourceState
              loading={preferences.loading || preferences.saving}
              error={preferences.error}
              retry={() => void preferences.reload()}
            />
            {preferences.enabled !== null && (
              <Copy muted size="small">
                {preferences.enabled
                  ? "ON · Usamos tus entradas para sugerirte conciertos."
                  : "OFF · No se solicitan recomendaciones personalizadas."}
              </Copy>
            )}
          </Card>

          <NotificationPreference />
        </View>
      </BentoGrid>
    </Page>
  );
}
