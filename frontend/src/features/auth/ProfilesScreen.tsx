import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { roleLabel } from "../../constants/access";
import type { SelfProfiles } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Page, ResourceState, useAction } from "../../components/ui";

// Self-service (POST /me/profiles): COMPRADOR and ARTISTA. ORGANIZADOR, VENUE and EMPRESA_SERVICIOS are granted by an ADMIN.
export default function ProfilesScreen() {
  const auth = useAuth();
  const resource = useResource<SelfProfiles>("/me/profiles");
  const profiles = resource.result?.data;
  const action = useAction();
  const activate = (role: string) =>
    action.run(async () => {
      const { data } = await api.request<{ changed: boolean }>("/me/profiles", { method: "POST", body: { role } });
      // Permissions changed: reload them so navigation and guards reflect the new profile right away.
      auth.refreshAccess();
      await resource.reload();
      action.setMessage(data.changed ? `Perfil ${roleLabel(role)} activado.` : `El perfil ${roleLabel(role)} ya estaba activo.`);
    });
  return (
    <Page title="Mis perfiles" subtitle="Una cuenta puede tener varios perfiles. Algunos los activás vos y otros los aprueba un administrador.">
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {profiles && (
        <>
          <Card>
            <Copy>Perfiles activos</Copy>
            <Copy muted>{profiles.roles.map(roleLabel).join(" · ") || "Sin perfiles"}</Copy>
          </Card>
          {profiles.self_service.map((profile) => (
            <Card key={profile.code}>
              <Copy>{roleLabel(profile.code)}</Copy>
              {profile.description && <Copy muted>{profile.description}</Copy>}
              {profile.active ? (
                <Copy muted>Activo.</Copy>
              ) : (
                <Button title={`Activar perfil ${roleLabel(profile.code)}`} disabled={action.busy} onPress={() => void activate(profile.code)} />
              )}
              {profile.code === "ARTISTA" && profile.active && (
                <Button title="Ir a mis perfiles de artista" secondary onPress={() => router.push("/artists")} />
              )}
            </Card>
          ))}
          <Card>
            <Copy>Organizador, Venue y Empresa de servicios</Copy>
            <Copy muted>Implican una organización o un negocio, así que los activa un administrador después de revisarlos.</Copy>
          </Card>
        </>
      )}
    </Page>
  );
}
