// Pantalla de configuración, datos de cuenta, seguridad y preferencias del usuario.
import { router } from "expo-router";
import { Switch, Text, View } from "react-native";
import { usePreferences } from "../../contexts/PreferencesContext";
import NotificationPreference from "../notifications/NotificationPreference";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { ROLE_GUIDES, ROLE_LABELS, type Me } from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Page,
  ResourceState,
  SectionHeader,
  colors,
  radius,
  styles,
  switchColors,
  useAction,
  useBento,
} from "../../components/ui";
import { LockIcon, SettingsIcon, TargetIcon, UserIcon } from "../../components/ui/icons";

export default function ProfileScreen() {
  const auth = useAuth();
  const preferences = usePreferences();
  const logoutAction = useAction();
  const resource = useResource<Me>("/auth/me");
  const profile = resource.result?.data;
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;

  const userRoles = profile?.roles ?? auth.roles;
  const assignableRoles = userRoles.filter((role) => role !== "GUEST");
  const activeRole = auth.activeRole;
  const guide = activeRole !== "GUEST" ? ROLE_GUIDES[activeRole] : null;

  return (
    <Page
      eyebrow="VENTI · AJUSTES Y PERFIL"
      title="Configuración"
      subtitle="Administrá tus preferencias, datos personales, perfiles activos y seguridad."
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />

      <BentoGrid>
        {/* SECCIÓN 1: DATOS DE LA CUENTA */}
        <View style={[bento.cell(1, cols), { gap: 16 }]}>
          <SectionHeader
            title="Datos de la cuenta"
            icon={<UserIcon size={18} color={colors.text} />}
            subtitle="Información de contacto, perfiles asignados y acceso a edición."
          />

          {profile && (
            <Card variant="featured">
              <View style={styles.between}>
                <View style={styles.badge}>
                  <Copy size="label" color={colors.accentText}>CUENTA REGISTRADA</Copy>
                </View>
                <Copy size="small" color={colors.accentText} weight="700">
                  Contexto: {ROLE_LABELS[activeRole]}
                </Copy>
              </View>

              <View style={{ gap: 4 }}>
                <Text style={styles.heading}>
                  {profile.user.first_name} {profile.user.last_name}
                </Text>
                <Copy muted>{profile.user.email}</Copy>
                {profile.user.phone ? (
                  <Copy muted size="small">Teléfono: {profile.user.phone}</Copy>
                ) : (
                  <Copy muted size="small">Sin teléfono de contacto configurado</Copy>
                )}
              </View>

              <View
                style={{
                  padding: 10,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 4,
                }}
              >
                <Copy size="label" muted>ROLES ASOCIADOS</Copy>
                <Copy size="small" strong>
                  {userRoles.map((role) => ROLE_LABELS[role]).join(" · ")}
                </Copy>
              </View>

              {guide && (
                <Card variant="subtle" style={{ padding: 12, gap: 4 }}>
                  <Copy weight="700" size="small">{guide.title} — {guide.subtitle}</Copy>
                  <Copy muted size="small">{guide.allows}</Copy>
                </Card>
              )}

              {assignableRoles.length > 1 && (
                <View style={{ gap: 6 }}>
                  <Copy size="label" muted>CAMBIAR PERFIL ACTIVO</Copy>
                  <View style={styles.row}>
                    {assignableRoles.map((role) => (
                      <Button
                        key={role}
                        title={`${role === activeRole ? "✓ " : ""}${ROLE_LABELS[role]}`}
                        secondary={role !== activeRole}
                        onPress={() => auth.setActiveRole(role)}
                      />
                    ))}
                  </View>
                </View>
              )}

              <View style={[styles.row, { paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }]}>
                <Button
                  title="Editar datos personales"
                  onPress={() => router.push("/account-details")}
                />
                <Button
                  title="Mis perfiles"
                  secondary
                  onPress={() => router.push("/profiles")}
                />
              </View>

              <View style={styles.row}>
                {userRoles.includes("ARTISTA") && (
                  <Button
                    title="Panel de Artista"
                    secondary
                    onPress={() => router.push("/artists")}
                  />
                )}
                {userRoles.includes("ORGANIZADOR") && (
                  <Button
                    title="Mis conciertos"
                    secondary
                    onPress={() => router.push("/organizer")}
                  />
                )}
                {userRoles.includes("VENUE") && (
                  <Button
                    title="Mi Espacio Físico"
                    secondary
                    onPress={() => router.push("/marketplace/manage")}
                  />
                )}
                {userRoles.includes("EMPRESA_SERVICIOS") && (
                  <Button
                    title="Mi Empresa y Servicios"
                    secondary
                    onPress={() => router.push("/services/mine")}
                  />
                )}
                {userRoles.includes("ADMIN") && (
                  <Button
                    title="Panel Admin"
                    secondary
                    onPress={() => router.push("/admin")}
                  />
                )}
              </View>
            </Card>
          )}

          {/* SECCIÓN 3: CONFIGURACIÓN SENSIBLE */}
          <SectionHeader
            title="Configuración sensible"
            icon={<LockIcon size={18} color={colors.text} />}
            subtitle="Acciones de seguridad, cambio de clave y cierre de sesión."
          />
          <Card>
            <Copy size="subheading" weight="700">Seguridad de la sesión</Copy>
            <Copy muted size="small">
              Para proteger tu cuenta, cerrá la sesión cuando no utilices este dispositivo.
            </Copy>
            <View style={styles.row}>
              <Button
                title="Restablecer contraseña"
                secondary
                onPress={() => router.push("/forgot-password")}
              />
            </View>
            <ActionFeedback action={logoutAction} />
            <Button
              title="Cerrar sesión"
              danger
              disabled={logoutAction.busy}
              onPress={() => void logoutAction.run(() => auth.logout())}
            />
          </Card>
        </View>

        {/* SECCIÓN 2: CONFIGURACIÓN GENERAL */}
        <View style={[bento.cell(1, cols), { gap: 16 }]}>
          <SectionHeader
            title="Configuración general"
            icon={<SettingsIcon size={18} color={colors.text} />}
            subtitle="Control de notificaciones automáticas y recomendaciones personalizadas."
          />

          <Card>
            <View style={styles.between}>
              <View style={{ gap: 2, flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TargetIcon size={18} color={colors.text} />
                  <Copy size="subheading" weight="700">Recomendaciones personalizadas</Copy>
                </View>
                <Copy muted size="small">
                  Sugerencias inteligentes basadas en tus entradas adquiridas.
                </Copy>
              </View>
              {preferences.enabled !== null && (
                <Switch
                  {...switchColors}
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
              <View
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: radius.sm,
                  backgroundColor: preferences.enabled ? colors.accentSoft : colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: preferences.enabled ? colors.accentBorder : colors.border,
                }}
              >
                <Copy size="small" weight={preferences.enabled ? "700" : "500"} color={preferences.enabled ? colors.accentText : colors.muted}>
                  {preferences.enabled
                    ? "✓ ACTIVADO · Usamos tus entradas para sugerirte conciertos afines."
                    : "✕ DESACTIVADO · No se generan recomendaciones personalizadas."}
                </Copy>
              </View>
            )}
          </Card>

          <NotificationPreference />
        </View>
      </BentoGrid>
    </Page>
  );
}
