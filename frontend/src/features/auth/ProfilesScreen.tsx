import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { ROLE_LABELS, type Access, type Role, type SelfProfiles } from "../../types/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Page,
  ResourceState,
  useAction,
} from "../../components/ui";
// GET /me/profiles lists the profiles the account holds and which ones it can activate alone.
// ORGANIZADOR, VENUE and EMPRESA_SERVICIOS involve a business, so an ADMIN grants them
// (POST /me/profiles answers 403 ADMIN_APPROVAL_REQUIRED for those).
const BY_ADMIN: Role[] = ["ORGANIZADOR", "VENUE", "EMPRESA_SERVICIOS"];
export default function ProfilesScreen() {
  const auth = useAuth();
  const action = useAction();
  const resource = useResource<SelfProfiles>("/me/profiles");
  const profiles = resource.result?.data;
  const activate = (role: Role) =>
    action.run(async () => {
      const { data } = await api.request<Access & { changed: boolean }>(
        "/me/profiles",
        { method: "POST", body: { role } },
      );
      // The response already carries the rebuilt profiles and permissions.
      auth.applyAccess(data);
      await resource.reload();
      action.setMessage(
        data.changed
          ? `Perfil ${ROLE_LABELS[role]} activado.`
          : `Ya tenías el perfil ${ROLE_LABELS[role]}.`,
      );
    });
  return (
    <Page
      title="Mis perfiles"
      subtitle="Un perfil define qué podés hacer en Venti. Podés tener varios a la vez."
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {profiles && (
        <>
          <Card>
            <Copy>Perfiles activos</Copy>
            <Copy muted>
              {profiles.roles.map((role) => ROLE_LABELS[role]).join(" · ")}
            </Copy>
          </Card>
          {profiles.self_service.map((profile) => (
            <Card key={profile.code}>
              <Copy>
                {profile.name} · {profile.active ? "Activo" : "Disponible"}
              </Copy>
              {profile.description && <Copy muted>{profile.description}</Copy>}
              {profile.active ? (
                <Copy muted>
                  Ya lo tenés. Para darlo de baja escribile a un administrador.
                </Copy>
              ) : (
                <Button
                  title={`Activar ${profile.name}`}
                  disabled={action.busy}
                  onPress={() => void activate(profile.code)}
                />
              )}
              {profile.code === "ARTISTA" && profile.active && (
                <Button
                  title="Gestionar mis perfiles de artista"
                  secondary
                  onPress={() => router.push("/artists")}
                />
              )}
            </Card>
          ))}
          <Card>
            <Copy>Perfiles que asigna un administrador</Copy>
            <Copy muted>
              {BY_ADMIN.map((role) => ROLE_LABELS[role]).join(" · ")}
            </Copy>
            <Copy muted>
              Implican una organización o un negocio que hay que revisar. Pedilos
              por los canales de contacto de Venti.
            </Copy>
          </Card>
          <Card>
            <Copy>Permisos de tu cuenta</Copy>
            <Copy muted>
              {profiles.permissions.length
                ? profiles.permissions.join(" · ")
                : "Sin permisos."}
            </Copy>
          </Card>
        </>
      )}
      <Button title="Volver a mi cuenta" secondary onPress={() => router.back()} />
    </Page>
  );
}
