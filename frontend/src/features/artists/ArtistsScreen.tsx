import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type {
  Artist,
  ArtistConcerts,
  ArtistDetail,
  ArtistMember,
  MemberRole,
} from "../../types/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Field,
  FormScope,
  Page,
  ResourceState,
  dateLabel,
  styles,
  useAction,
  useForm,
} from "../../components/ui";
import { Select } from "../../components/ui/Select";
import { ConcertCard } from "../concerts/ConcertList";
const STATUS: Record<Artist["status"], string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};
const memberName = (member: ArtistMember) =>
  [member.first_name, member.last_name].filter(Boolean).join(" ") ||
  member.email ||
  `Cuenta #${member.user_id}`;
// GET /artists/mine returns every profile the account belongs to, in any state, without pagination.
export default function ArtistsScreen() {
  const resource = useResource<Artist[]>("/artists/mine");
  const [creating, setCreating] = useState(false);
  return (
    <Page
      title="Mis perfiles de artista"
      subtitle="Tu perfil o el de tu banda. Con él pedís presupuestos y reservás espacios."
    >
      <Button
        title={creating ? "Cancelar creación" : "Crear perfil de artista"}
        onPress={() => setCreating(!creating)}
      />
      {creating && (
        <ArtistEditor
          done={async (id) => {
            setCreating(false);
            await resource.reload();
            if (id) router.push(`/artists/${id}`);
          }}
        />
      )}
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
      />
      {resource.result?.data.map((artist) => (
        <Card key={artist.id}>
          <Copy>
            {artist.stage_name} · {STATUS[artist.status]}
          </Copy>
          <Copy muted>
            {[artist.city_name, artist.genres.map((genre) => genre.name).join(", ")]
              .filter(Boolean)
              .join(" · ") || "Sin ciudad ni géneros"}
          </Copy>
          <Button
            title={`Gestionar ${artist.stage_name}`}
            onPress={() => router.push(`/artists/${artist.id}`)}
          />
        </Card>
      ))}
    </Page>
  );
}
// POST /artists (the creator becomes OWNER) and PATCH /artists/:id. An archived profile
// is not editable until it is published again.
function ArtistEditor({
  artist,
  done,
}: {
  artist?: ArtistDetail;
  done(id?: string): Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [city, setCity] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const action = useAction();
  const validation = useForm();
  useEffect(() => {
    setForm({
      stage_name: artist?.stage_name ?? "",
      bio: artist?.bio ?? "",
      image_url: artist?.image_url ?? "",
      website: artist?.website ?? "",
    });
    setCity(artist?.city_id ? [artist.city_id] : []);
    setGenres(artist?.genres.map((genre) => genre.id) ?? []);
  }, [artist]);
  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = () =>
    action.run(async () => {
      validation.assertValid();
      if (!form.stage_name?.trim())
        throw new Error("Poné el nombre artístico.");
      const body = {
        stage_name: form.stage_name.trim(),
        bio: form.bio?.trim() || null,
        city_id: city[0] ?? null,
        image_url: form.image_url?.trim() || null,
        website: form.website?.trim() || null,
        genre_ids: genres,
      };
      const { data } = await api.request<ArtistDetail>(
        artist ? `/artists/${artist.id}` : "/artists",
        { method: artist ? "PATCH" : "POST", body },
      );
      await done(data.id);
    });
  return (
    <Card>
      <FormScope form={validation}>
      <Copy>{artist ? `Editar ${artist.stage_name}` : "Nuevo perfil de artista"}</Copy>
      <Field
        label="Nombre artístico"
        required
        value={form.stage_name ?? ""}
        autoCapitalize="words"
        onChangeText={(value) => set("stage_name", value)}
      />
      <Field
        label="Biografía (opcional)"
        value={form.bio ?? ""}
        multiline
        autoCapitalize="sentences"
        onChangeText={(value) => set("bio", value)}
      />
      <Select
        label="Ciudad"
        path="/cities"
        values={city}
        onChange={setCity}
      />
      <Select
        label="Géneros"
        path="/genres"
        multiple
        values={genres}
        onChange={setGenres}
      />
      <Field
        label="Imagen (URL, opcional)"
        value={form.image_url ?? ""}
        onChangeText={(value) => set("image_url", value)}
      />
      <Field
        label="Sitio web (http o https, opcional)"
        value={form.website ?? ""}
        onChangeText={(value) => set("website", value)}
      />
      <ActionFeedback action={action} />
      <Button
        title={artist ? "Guardar cambios" : "Crear perfil"}
        disabled={action.busy}
        onPress={() => void save()}
      />
      <Button title="Cerrar edición" secondary onPress={() => void done()} />
      </FormScope>
    </Card>
  );
}
export function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, can } = useAuth();
  const resource = useResource<ArtistDetail>(`/artists/${id}`);
  const artist = resource.result?.data;
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("MEMBER");
  const [confirm, setConfirm] = useState<string | null>(null);
  // Status and membership are for an OWNER, and artists.admin overrides membership.
  // The API decides either way; this only chooses what is worth showing.
  const owner =
    can("artists.admin") ||
    artist?.members.find((member) => member.user_id === user?.id)?.member_role ===
      "OWNER";
  const status = (next: "publish" | "archive") =>
    action.run(async () => {
      await api.request(`/artists/${id}/${next}`, { method: "POST", body: {} });
      await resource.reload();
      action.setMessage(
        next === "publish" ? "Perfil publicado." : "Perfil archivado.",
      );
    });
  const addMember = () =>
    action.run(async () => {
      if (!email.trim()) throw new Error("Poné el email de la cuenta.");
      await api.request(`/artists/${id}/members`, {
        method: "POST",
        body: { email: email.trim(), member_role: role },
      });
      setEmail("");
      await resource.reload();
      action.setMessage("Integrante agregado.");
    });
  const setMemberRole = (member: ArtistMember, next: MemberRole) =>
    action.run(async () => {
      await api.request(`/artists/${id}/members/${member.user_id}`, {
        method: "PATCH",
        body: { member_role: next },
      });
      await resource.reload();
      action.setMessage("Rol del integrante actualizado.");
    });
  const removeMember = (member: ArtistMember) =>
    action.run(async () => {
      await api.request(`/artists/${id}/members/${member.user_id}`, {
        method: "DELETE",
      });
      setConfirm(null);
      await resource.reload();
      action.setMessage(
        member.user_id === user?.id
          ? "Saliste del perfil."
          : "Integrante quitado.",
      );
    });
  return (
    <Page title={artist ? artist.stage_name : "Perfil de artista"}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {artist && (
        <>
          <Card>
            <Copy>
              {artist.stage_name} · {STATUS[artist.status]}
            </Copy>
            <Copy muted>
              {[artist.city_name, artist.genres.map((genre) => genre.name).join(", ")]
                .filter(Boolean)
                .join(" · ") || "Sin ciudad ni géneros"}
            </Copy>
            {artist.bio && <Copy>{artist.bio}</Copy>}
            {artist.website && <Copy muted>{artist.website}</Copy>}
            <Copy muted>
              {artist.published_at
                ? `Publicado ${dateLabel(artist.published_at)}`
                : "Sin publicar"}
            </Copy>
          </Card>
          {artist.status === "ARCHIVED" && (
            <Card>
              <Copy muted>
                Un perfil archivado no se edita. Publicalo de nuevo para seguir
                cambiándolo.
              </Copy>
            </Card>
          )}
          <View style={styles.row}>
            {artist.status !== "ARCHIVED" && (
              <Button
                title={editing ? "Cancelar edición" : "Editar perfil"}
                secondary
                onPress={() => setEditing(!editing)}
              />
            )}
            {owner && artist.status !== "PUBLISHED" && (
              <Button
                title="Publicar perfil"
                disabled={action.busy}
                onPress={() => void status("publish")}
              />
            )}
            {owner && artist.status !== "ARCHIVED" && (
              <Button
                title="Archivar perfil"
                secondary
                disabled={action.busy}
                onPress={() => void status("archive")}
              />
            )}
          </View>
          {editing && artist.status !== "ARCHIVED" && (
            <ArtistEditor
              artist={artist}
              done={async () => {
                setEditing(false);
                await resource.reload();
              }}
            />
          )}
          <Card>
            <Copy>Integrantes</Copy>
            <Copy muted>
              Solo se suman cuentas con el perfil ARTISTA. El perfil conserva
              siempre un OWNER.
            </Copy>
            {artist.members.map((member) => (
              <View key={member.user_id} style={styles.row}>
                <Copy>
                  {memberName(member)} · {member.member_role}
                </Copy>
                {owner && member.member_role === "MEMBER" && (
                  <Button
                    title={`Hacer OWNER a ${memberName(member)}`}
                    secondary
                    disabled={action.busy}
                    onPress={() => void setMemberRole(member, "OWNER")}
                  />
                )}
                {owner && member.member_role === "OWNER" && member.user_id !== user?.id && (
                  <Button
                    title={`Pasar a MEMBER a ${memberName(member)}`}
                    secondary
                    disabled={action.busy}
                    onPress={() => void setMemberRole(member, "MEMBER")}
                  />
                )}
                {(owner || member.user_id === user?.id) && (
                  <Button
                    title={
                      confirm === member.user_id
                        ? "Confirmar"
                        : member.user_id === user?.id
                          ? "Salir del perfil"
                          : `Quitar a ${memberName(member)}`
                    }
                    secondary
                    danger
                    disabled={action.busy}
                    onPress={() =>
                      confirm === member.user_id
                        ? void removeMember(member)
                        : setConfirm(member.user_id)
                    }
                  />
                )}
              </View>
            ))}
            {owner && (
              <>
                <Field
                  label="Email de la cuenta a sumar"
                  value={email}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                />
                <View style={styles.row}>
                  {(["MEMBER", "OWNER"] as MemberRole[]).map((value) => (
                    <Button
                      key={value}
                      title={value}
                      secondary={role !== value}
                      onPress={() => setRole(value)}
                    />
                  ))}
                </View>
                <Button
                  title="Agregar integrante"
                  disabled={action.busy}
                  onPress={() => void addMember()}
                />
              </>
            )}
          </Card>
          {artist.status === "PUBLISHED" && (
            <Button
              title="Ver perfil público"
              secondary
              onPress={() => router.push(`/artist/${artist.id}`)}
            />
          )}
          <Performances id={artist.id} />
        </>
      )}
      <Button
        title="Volver a mis perfiles"
        secondary
        onPress={() => router.push("/artists")}
      />
    </Page>
  );
}
// GET /artists/:id/concerts: concerts that bill the profile (drafts excluded), upcoming first by date, past newest first.
function Performances({ id }: { id: string }) {
  const resource = useResource<ArtistConcerts>(`/artists/${id}/concerts`);
  const concerts = resource.result?.data;
  return (
    <>
      <Copy>Presentaciones</Copy>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {concerts && !concerts.upcoming.length && !concerts.past.length && (
        <Copy muted>
          Todavía no hay conciertos con este perfil en el cartel. El organizador
          lo vincula al cargar el concierto.
        </Copy>
      )}
      {([["Próximas", concerts?.upcoming], ["Anteriores", concerts?.past]] as const).map(([label, list]) =>
        list?.length ? (
          <View key={label} style={{ gap: 10 }}>
            <Copy muted>{label}</Copy>
            <View style={[styles.row, { alignItems: "stretch" }]}>
              {list.map((concert) => (
                <ConcertCard key={concert.id} concert={concert} />
              ))}
            </View>
          </View>
        ) : null,
      )}
    </>
  );
}
// Public profile (GET /artists/:id): only published profiles, unless the viewer is a member or artists.admin.
export function PublicArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<ArtistDetail>(`/artists/${id}`);
  const artist = resource.result?.data;
  return (
    <Page title={artist?.stage_name ?? "Artista"}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {artist && (
        <>
          {artist.image_url && (
            <Image
              source={{ uri: artist.image_url }}
              accessibilityLabel={artist.stage_name}
              style={{ width: "100%", height: 240, borderRadius: 18 }}
            />
          )}
          <Card>
            <Copy muted>
              {[artist.city_name, artist.genres.map((genre) => genre.name).join(", ")]
                .filter(Boolean)
                .join(" · ") || "Sin ciudad ni géneros"}
            </Copy>
            {artist.bio && <Copy>{artist.bio}</Copy>}
            {artist.website && <Copy muted>{artist.website}</Copy>}
            {/* Outsiders get no email, so only members with a name are listed. */}
            {artist.members.length > 1 && (
              <Copy muted>
                Integrantes:{" "}
                {artist.members
                  .map((member) => [member.first_name, member.last_name].filter(Boolean).join(" "))
                  .filter(Boolean)
                  .join(", ") || "sin nombres públicos"}
              </Copy>
            )}
          </Card>
          <Performances id={artist.id} />
        </>
      )}
      <Button title="Volver" secondary onPress={() => router.back()} />
    </Page>
  );
}
