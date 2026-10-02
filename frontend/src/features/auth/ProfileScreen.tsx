import { router } from "expo-router";
import { Switch } from "react-native";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import type { Role, User } from "../../types/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Page,
  ResourceState,
  useAction,
} from "../../components/ui";
export default function ProfileScreen() {
  const auth = useAuth();
  const preferences = usePreferences();
  const action = useAction();
  const resource = useResource<{ user: User; roles: Role[] }>("/auth/me");
  const profile = resource.result?.data;
  return (
    <Page title="Mi cuenta">
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {profile && (
        <Card>
          <Copy>
            {profile.user.first_name} {profile.user.last_name}
          </Copy>
          <Copy>{profile.user.email}</Copy>
          <Copy muted>{profile.roles.join(" · ")}</Copy>
        </Card>
      )}
      <Card>
        <Copy>Recomendaciones personalizadas</Copy>
        <ResourceState
          loading={preferences.loading || preferences.saving}
          error={preferences.error}
          retry={() => void preferences.reload()}
        />
        {preferences.enabled !== null && (
          <>
            <Switch
              accessibilityLabel="Recomendaciones personalizadas"
              value={preferences.enabled}
              disabled={preferences.loading || preferences.saving}
              onValueChange={(value) => void preferences.setEnabled(value)}
            />
            <Copy muted>
              {preferences.enabled
                ? "ON · Usamos tus entradas y favoritos para sugerirte conciertos."
                : "OFF · No se solicitan recomendaciones personalizadas."}
            </Copy>
          </>
        )}
      </Card>
      <Button
        title="Historial de compras"
        onPress={() => router.push("/purchases")}
      />
      <Button
        title="Restablecer contraseña"
        secondary
        onPress={() => router.push("/forgot-password")}
      />
      <ActionFeedback action={action} />
      <Button
        title="Cerrar sesión"
        secondary
        disabled={action.busy}
        onPress={() => void action.run(() => auth.logout())}
      />
    </Page>
  );
}
