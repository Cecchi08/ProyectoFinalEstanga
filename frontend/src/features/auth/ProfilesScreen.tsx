import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import {
  ROLE_GUIDES,
  ROLE_LABELS,
  type Access,
  type ProfileRequestStatus,
  type Role,
  type SelfProfiles,
} from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  Notice,
  Page,
  ResourceState,
  SectionHeader,
  colors,
  dateLabel,
  styles,
  useAction,
  useBento,
} from "../../components/ui";

const REQUEST_STATUS: Record<ProfileRequestStatus, string> = {
  PENDING: "Pendiente de revisión",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};

export default function ProfilesScreen() {
  const auth = useAuth();
  const action = useAction();
  const resource = useResource<SelfProfiles>("/me/profiles");
  const profiles = resource.result?.data;
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;

  const isGuest = (profiles?.roles ?? auth.roles).includes("GUEST");

  const activate = (role: Role) =>
    action.run(async () => {
      const { data } = await api.request<Access & { changed: boolean }>(
        "/me/profiles",
        { method: "POST", body: { role } },
      );
      auth.applyAccess(data);
      auth.setActiveRole(role);
      await resource.reload();
      action.setMessage(
        data.changed
          ? `Perfil ${ROLE_LABELS[role]} activado.`
          : `Ya tenías el perfil ${ROLE_LABELS[role]}.`,
      );
    });

  const request = (role: Role) =>
    action.run(async () => {
      const reason = reasons[role]?.trim() || null;
      await api.request("/me/profile-requests", {
        method: "POST",
        body: reason ? { role, reason } : { role },
      });
      setReasons((current) => ({ ...current, [role]: "" }));
      await resource.reload();
      action.setMessage(
        `Solicitud de ${ROLE_LABELS[role]} enviada. Un administrador la revisará.`,
      );
    });

  return (
    <Page
      title="Mis perfiles"
      subtitle="Activá perfiles de autogestión al instante o solicitá perfiles profesionales sujetos a aprobación administrativa."
      actions={
        <Button
          title="Volver a mi cuenta"
          secondary
          onPress={() => router.push("/profile")}
        />
      }
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {isGuest && (
        <Notice
          tone="warning"
          message="Estás navegando como invitado. Registrá una cuenta con tu email para activar o solicitar perfiles."
        />
      )}
      {profiles && (
        <BentoGrid>
          <View style={[bento.cell(1, cols), { gap: 16 }]}>
            <Card variant="featured">
              <View style={styles.between}>
                <Copy size="subheading" weight="700">Perfiles activos</Copy>
                <View style={styles.badge}>
                  <Copy size="label" color={colors.accentText}>CUENTA</Copy>
                </View>
              </View>
              <Copy muted size="small">
                {profiles.roles.map((role) => ROLE_LABELS[role]).join(" · ")}
              </Copy>
              <View style={{ gap: 10 }}>
                {profiles.roles
                  .filter((role): role is Exclude<Role, "GUEST"> => role !== "GUEST")
                  .map((role) => {
                    const guide = ROLE_GUIDES[role];
                    const isCurrent = auth.activeRole === role;
                    return (
                      <Card key={role} variant="subtle" style={{ padding: 12, gap: 8 }}>
                        <View style={styles.between}>
                          <Copy weight="700">{ROLE_LABELS[role]}</Copy>
                          {isCurrent ? (
                            <View style={styles.badge}>
                              <Copy size="label" color={colors.accentText}>EN USO</Copy>
                            </View>
                          ) : (
                            <Button
                              title={`Usar perfil ${ROLE_LABELS[role]}`}
                              secondary
                              onPress={() => {
                                auth.setActiveRole(role);
                                action.setMessage(`Contexto activo cambiado a ${ROLE_LABELS[role]}.`);
                              }}
                            />
                          )}
                        </View>
                        {guide && (
                          <>
                            <Copy size="small" weight="600">{guide.subtitle}</Copy>
                            <Copy muted size="small">{guide.allows}</Copy>
                          </>
                        )}
                      </Card>
                    );
                  })}
              </View>
            </Card>

            <Card>
              <SectionHeader
                title="Activación inmediata (Autogestión)"
                subtitle="Habilitá estos perfiles directamente en tu cuenta sin esperar revisión administrativa."
              />
              <View style={{ gap: 12 }}>
                {profiles.self_service.map((profile) => {
                  const label = ROLE_LABELS[profile.code] ?? profile.name;
                  const guide = profile.code !== "GUEST" ? ROLE_GUIDES[profile.code] : null;
                  return (
                    <Card key={profile.code} variant="subtle" style={{ padding: 14, gap: 8 }}>
                      <View style={styles.between}>
                        <Copy weight="700">
                          {label} · {profile.active ? "Activo" : "Disponible"}
                        </Copy>
                        <View style={profile.active ? styles.badge : styles.badgeMuted}>
                          <Copy size="label" color={profile.active ? colors.accentText : colors.muted}>
                            {profile.active ? "ACTIVO" : "INMEDIATO"}
                          </Copy>
                        </View>
                      </View>
                      {guide ? (
                        <Copy muted size="small">{guide.allows}</Copy>
                      ) : profile.description ? (
                        <Copy muted size="small">{profile.description}</Copy>
                      ) : null}
                      {profile.active ? (
                        <Copy muted size="small">
                          Ya tenés este perfil activo. Para darlo de baja, contactá a administración.
                        </Copy>
                      ) : (
                        <Button
                          title={`Activar ${label}`}
                          disabled={action.busy || isGuest}
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
                  );
                })}
              </View>
            </Card>
          </View>

          <View style={[bento.cell(1, cols), { gap: 16 }]}>
            <Card>
              <SectionHeader
                title="Perfiles con aprobación administrativa"
                subtitle="Requieren validación de un administrador antes de habilitarse en tu cuenta."
              />
              <View style={{ gap: 12 }}>
                {profiles.requestable.map((profile) => {
                  const label = ROLE_LABELS[profile.code] ?? profile.name;
                  const guide = profile.code !== "GUEST" ? ROLE_GUIDES[profile.code] : null;
                  const stateText = profile.active
                    ? "Activo"
                    : profile.pending
                      ? "Pendiente"
                      : "Disponible con solicitud";
                  return (
                    <Card key={profile.code} variant="subtle" style={{ padding: 14, gap: 8 }}>
                      <View style={styles.between}>
                        <Copy weight="700">
                          {label} · {stateText}
                        </Copy>
                        <View style={profile.active ? styles.badge : styles.badgeMuted}>
                          <Copy size="label" color={profile.active ? colors.accentText : colors.muted}>
                            {profile.active ? "ACTIVO" : profile.pending ? "EN REVISIÓN" : "CON SOLICITUD"}
                          </Copy>
                        </View>
                      </View>
                      {guide ? (
                        <Copy muted size="small">{guide.allows}</Copy>
                      ) : profile.description ? (
                        <Copy muted size="small">{profile.description}</Copy>
                      ) : null}
                      {profile.active ? (
                        <Copy muted size="small">
                          Ya tenés este perfil activo. Para darlo de baja, contactá a administración.
                        </Copy>
                      ) : profile.pending ? (
                        <Copy muted size="small">
                          Tu solicitud está pendiente de revisión por un administrador.
                        </Copy>
                      ) : (
                        <>
                          <Field
                            label={`Motivo o actividad para ${label} (opcional)`}
                            placeholder="Describí tu productora, sala o empresa técnica"
                            value={reasons[profile.code] ?? ""}
                            onChangeText={(value) =>
                              setReasons((current) => ({ ...current, [profile.code]: value }))
                            }
                          />
                          <Button
                            title={`Solicitar ${label}`}
                            secondary
                            disabled={action.busy || isGuest}
                            onPress={() => void request(profile.code)}
                          />
                        </>
                      )}
                    </Card>
                  );
                })}
              </View>
            </Card>

            <Card>
              <SectionHeader
                title="Historial de solicitudes"
                subtitle="Estado de las solicitudes enviadas a administración."
              />
              {profiles.requests.length === 0 ? (
                <Copy muted size="small">
                  Todavía no enviaste solicitudes de perfiles con aprobación administrativa.
                </Copy>
              ) : (
                <View style={{ gap: 10 }}>
                  {profiles.requests.map((item, idx) => (
                    <Card
                      key={`${item.role}-${item.created_at}-${idx}`}
                      variant="subtle"
                      style={{ padding: 12, gap: 4 }}
                    >
                      <View style={styles.between}>
                        <Copy weight="700">{ROLE_LABELS[item.role]}</Copy>
                        <View style={item.status === "APPROVED" ? styles.badge : styles.badgeMuted}>
                          <Copy
                            size="label"
                            color={
                              item.status === "APPROVED"
                                ? colors.accentText
                                : item.status === "REJECTED"
                                  ? colors.dangerText
                                  : colors.muted
                            }
                          >
                            {REQUEST_STATUS[item.status]}
                          </Copy>
                        </View>
                      </View>
                      <Copy muted size="small">
                        Enviada el {dateLabel(item.created_at)}
                        {item.decided_at ? ` · Resuelta el ${dateLabel(item.decided_at)}` : ""}
                      </Copy>
                      {item.reason ? (
                        <Copy muted size="small">Motivo enviado: {item.reason}</Copy>
                      ) : null}
                      {item.decision_note ? (
                        <Copy muted size="small">Nota de administración: {item.decision_note}</Copy>
                      ) : null}
                    </Card>
                  ))}
                </View>
              )}
            </Card>
          </View>
        </BentoGrid>
      )}
    </Page>
  );
}
