import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { P, can } from "../../constants/access";
import type { ArtistMember, ArtistProfile } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, Page, ResourceState, styles, useAction } from "../../components/ui";
import { Select } from "../../components/ui/Select";

const statusLabel = { DRAFT: "Borrador", PUBLISHED: "Publicado", ARCHIVED: "Archivado" } as const;
const memberLabel = { OWNER: "Responsable", MEMBER: "Integrante" } as const;
const text = (value?: string) => value?.trim() || null;
const name = (member: ArtistMember) => [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email || `#${member.user_id}`;

// Shared create/edit form for /artists (POST) and /artists/:id (PATCH).
function ProfileForm({ profile, done }: { profile?: ArtistProfile; done(saved: ArtistProfile): Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [city, setCity] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const action = useAction();
  useEffect(() => {
    setForm({ stage_name: profile?.stage_name ?? "", bio: profile?.bio ?? "", image_url: profile?.image_url ?? "", website: profile?.website ?? "" });
    setCity(profile?.city_id ? [profile.city_id] : []);
    setGenres(profile?.genres.map((genre) => genre.id) ?? []);
  }, [profile]);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () =>
    action.run(async () => {
      const body = { stage_name: form.stage_name ?? "", bio: text(form.bio), image_url: text(form.image_url), website: text(form.website),
        city_id: city[0] ?? null, genre_ids: genres };
      const { data } = await api.request<ArtistProfile>(profile ? `/artists/${profile.id}` : "/artists", { method: profile ? "PATCH" : "POST", body });
      await done(data);
      action.setMessage("Perfil guardado.");
    });
  return (
    <Card>
      <Copy>{profile ? "Datos del perfil" : "Nuevo perfil de artista"}</Copy>
      <Field label="Nombre artístico" value={form.stage_name ?? ""} onChangeText={(v) => set("stage_name", v)} />
      <Field label="Biografía (opcional)" multiline value={form.bio ?? ""} onChangeText={(v) => set("bio", v)} />
      <Field label="URL de imagen (opcional)" value={form.image_url ?? ""} onChangeText={(v) => set("image_url", v)} />
      <Field label="Sitio web (opcional)" value={form.website ?? ""} onChangeText={(v) => set("website", v)} />
      <Select label="Ciudad (opcional)" path="/cities" values={city} onChange={setCity} />
      <Select label="Géneros del artista" path="/genres" multiple values={genres} onChange={setGenres} />
      <ActionFeedback action={action} />
      <Button title={profile ? "Guardar perfil de artista" : "Crear perfil de artista"} disabled={action.busy} onPress={() => void save()} />
    </Card>
  );
}

export default function ArtistsScreen() {
  const mine = useResource<ArtistProfile[]>("/artists/mine");
  const [creating, setCreating] = useState(false);
  return (
    <Page title="Mis perfiles de artista" subtitle="Solista o banda: los integrantes comparten el perfil y el responsable lo publica.">
      <Button title={creating ? "Cerrar formulario" : "Nuevo perfil de artista"} onPress={() => setCreating(!creating)} />
      {creating && <ProfileForm done={async (saved) => { setCreating(false); router.push(`/artists/${saved.id}`); }} />}
      <ResourceState {...mine} empty={mine.result?.data.length === 0} retry={() => void mine.reload()} />
      {mine.result?.data.map((profile) => (
        <Card key={profile.id}>
          <Copy>{profile.stage_name} · {statusLabel[profile.status]}</Copy>
          <Copy muted>{[profile.city_name, profile.genres.map((genre) => genre.name).join(", ")].filter(Boolean).join(" · ") || "Sin ciudad ni géneros"}</Copy>
          <Button title={`Gestionar ${profile.stage_name}`} secondary onPress={() => router.push(`/artists/${profile.id}`)} />
        </Card>
      ))}
    </Page>
  );
}

export function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const resource = useResource<ArtistProfile>(`/artists/${id}`);
  const profile = resource.result?.data;
  const action = useAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ArtistMember["member_role"]>("MEMBER");
  const me = profile?.members?.find((member) => member.user_id === auth.user?.id);
  // OWNER (or artists.admin) publishes, archives and manages members; any member edits the content.
  const owner = me?.member_role === "OWNER" || can(auth.permissions, P.artistsAdmin);
  const run = (work: () => Promise<unknown>, message: string) =>
    action.run(async () => { await work(); await resource.reload(); action.setMessage(message); });
  const members = `/artists/${id}/members`;
  return (
    <Page title={profile?.stage_name ?? "Perfil de artista"} subtitle={profile ? `${statusLabel[profile.status]} · /${profile.slug}` : undefined}>
      <Button title="Volver a mis perfiles de artista" secondary onPress={() => router.push("/artists")} />
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {profile && (
        <>
          {profile.image_url && (
            <Image source={{ uri: profile.image_url }} accessibilityLabel={profile.stage_name} style={{ width: "100%", height: 220, borderRadius: 16 }} />
          )}
          {owner && (
            <View style={styles.row}>
              {profile.status !== "PUBLISHED" ? (
                <Button title="Publicar perfil" disabled={action.busy}
                  onPress={() => void run(() => api.request(`/artists/${id}/publish`, { method: "POST", body: {} }), "Perfil publicado.")} />
              ) : (
                <Button title="Archivar perfil" secondary danger disabled={action.busy}
                  onPress={() => void run(() => api.request(`/artists/${id}/archive`, { method: "POST", body: {} }), "Perfil archivado.")} />
              )}
            </View>
          )}
          {profile.status === "ARCHIVED" ? (
            <Copy muted>Un perfil archivado no se edita: publicalo de nuevo para cambiarlo.</Copy>
          ) : (
            <ProfileForm profile={profile} done={async () => { await resource.reload(); }} />
          )}
          <Card>
            <Copy>Integrantes</Copy>
            {profile.members?.map((member) => (
              <View key={member.user_id} style={{ gap: 6 }}>
                <Copy muted>{name(member)}{member.email ? ` · ${member.email}` : ""} · {memberLabel[member.member_role]}</Copy>
                <View style={styles.row}>
                  {owner && (
                    <Button title={`Hacer ${memberLabel[member.member_role === "OWNER" ? "MEMBER" : "OWNER"]}: ${name(member)}`} secondary disabled={action.busy}
                      onPress={() => void run(() => api.request(`${members}/${member.user_id}`, { method: "PATCH",
                        body: { member_role: member.member_role === "OWNER" ? "MEMBER" : "OWNER" } }), "Rol actualizado.")} />
                  )}
                  {(owner || member.user_id === auth.user?.id) && (
                    <Button title={member.user_id === auth.user?.id ? "Salir del perfil" : `Quitar a ${name(member)}`} secondary danger disabled={action.busy}
                      onPress={() => void action.run(async () => {
                        await api.request(`${members}/${member.user_id}`, { method: "DELETE" });
                        if (member.user_id === auth.user?.id) router.replace("/artists");
                        else { await resource.reload(); action.setMessage("Integrante quitado."); }
                      })} />
                  )}
                </View>
              </View>
            ))}
            {owner && (
              <>
                <Field label="Email del integrante (cuenta con perfil Artista)" keyboardType="email-address" value={email} onChangeText={setEmail} />
                <View style={styles.row}>
                  {(["MEMBER", "OWNER"] as const).map((value) => (
                    <Button key={value} title={`${role === value ? "✓ " : ""}${memberLabel[value]}`} secondary={role !== value} onPress={() => setRole(value)} />
                  ))}
                </View>
                <Button title="Agregar integrante" disabled={action.busy}
                  onPress={() => void run(async () => { await api.request(members, { method: "POST", body: { email, member_role: role } }); setEmail(""); }, "Integrante agregado.")} />
              </>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}
