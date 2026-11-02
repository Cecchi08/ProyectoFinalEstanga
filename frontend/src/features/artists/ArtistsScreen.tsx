import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type {
  Artist,
  ArtistConcerts,
  ArtistDetail,
  ArtistMember,
  ArtistProposal,
  MemberRole,
  Venue,
} from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  FormScope,
  MusicalCover,
  Page,
  ResourceState,
  SectionHeader,
  colors,
  dateLabel,
  flowLabel,
  money,
  statusLabel,
  styles,
  useAction,
  useBento,
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
  "Integrante";

// GET /artists/mine returns every profile the account belongs to, in any state, without pagination.
export default function ArtistsScreen() {
  const resource = useResource<Artist[]>("/artists/mine");
  const [creating, setCreating] = useState(false);
  const [pitching, setPitching] = useState(false);
  const { mobile } = useBento();
  const myArtists = resource.result?.data ?? [];

  return (
    <Page
      eyebrow="VENTI · PANEL DE ARTISTA"
      title="Mis perfiles y contrataciones"
      subtitle="Administrá tu perfil artístico, respondé propuestas de espacios y organizadores, y postulá shows."
      actions={
        <>
          <Button
            title={creating ? "Cancelar creación" : "Crear perfil de artista"}
            onPress={() => setCreating(!creating)}
          />
          {myArtists.some((a) => a.status === "PUBLISHED") && (
            <Button
              title={pitching ? "Cerrar solicitud a espacio" : "Solicitar fecha a un espacio"}
              secondary
              onPress={() => setPitching(!pitching)}
            />
          )}
          <Button
            title="Presupuestos de salas"
            secondary
            onPress={() => router.push("/marketplace/quotes")}
          />
        </>
      }
    >
      {creating && (
        <ArtistEditor
          done={async (id) => {
            setCreating(false);
            await resource.reload();
            if (id) router.push(`/artists/${id}`);
          }}
        />
      )}
      {pitching && myArtists.length > 0 && (
        <ArtistPitchToVenueForm
          artists={myArtists.filter((a) => a.status === "PUBLISHED")}
          done={() => setPitching(false)}
        />
      )}
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
      />
      <BentoGrid>
        {resource.result?.data.map((artist) => (
          <View
            key={artist.id}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "100%" : 340,
              maxWidth: "100%",
            }}
          >
            <Card style={{ height: "100%", justifyContent: "space-between" }}>
              <View style={{ gap: 10 }}>
                <MusicalCover
                  uri={artist.image_url}
                  alt={artist.stage_name}
                  kind="artist"
                  height={160}
                  badge={STATUS[artist.status]}
                />
                <Copy strong>
                  {artist.stage_name} · {STATUS[artist.status]}
                </Copy>
                <Copy muted>
                  {[artist.city_name, artist.genres.map((genre) => genre.name).join(", ")]
                    .filter(Boolean)
                    .join(" · ") || "Sin ciudad ni géneros"}
                </Copy>
                {(artist.contact_email || artist.phone) && (
                  <Copy muted>
                    Contacto: {[artist.contact_email, artist.phone].filter(Boolean).join(" · ")}
                  </Copy>
                )}
              </View>
              <Button
                title={`Gestionar ${artist.stage_name}`}
                onPress={() => router.push(`/artists/${artist.id}`)}
              />
            </Card>
          </View>
        ))}
      </BentoGrid>

      <ArtistProposalsPanel />
    </Page>
  );
}

export function ArtistProposalsPanel({ artistId }: { artistId?: string }) {
  const path = artistId ? `/proposals${query({ artist_profile_id: artistId })}` : "/proposals";
  const proposals = useResource<ArtistProposal[]>(path);
  const action = useAction();
  const { mobile } = useBento();

  const respond = (proposal: ArtistProposal, operation: "accept" | "reject" | "cancel", note?: string) =>
    action.run(async () => {
      await api.request(`/proposals/${proposal.id}/${operation}`, {
        method: "POST",
        body: note ? { reason: note } : {},
      });
      await proposals.reload();
      action.setMessage(
        operation === "accept"
          ? "Propuesta aceptada y confirmada."
          : operation === "reject"
            ? "Propuesta rechazada."
            : "Solicitud cancelada.",
      );
    });

  return (
    <View style={{ gap: 14 }}>
      <SectionHeader
        title="Contrataciones, Propuestas y Solicitudes"
        subtitle="Propuestas recibidas desde espacios físicos u organizadores y solicitudes enviadas para tocar."
      />
      <ResourceState
        {...proposals}
        empty={proposals.result?.data.length === 0}
        retry={() => void proposals.reload()}
      />
      <ActionFeedback action={action} />
      <BentoGrid>
        {proposals.result?.data.map((proposal) => (
          <View
            key={proposal.id}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "100%" : 380,
              maxWidth: "100%",
            }}
          >
            <Card style={{ height: "100%", justifyContent: "space-between", gap: 10 }}>
              <View style={{ gap: 6 }}>
                <Copy strong>
                  {proposal.event_title} · {statusLabel(proposal.status)}
                </Copy>
                <Copy muted>{flowLabel(proposal.flow_type)}</Copy>
                <Copy muted>Artista: {proposal.artist_name}</Copy>
                {(proposal.establishment_name || proposal.venue_name) && (
                  <Copy muted>
                    Espacio: {[proposal.establishment_name, proposal.venue_name].filter(Boolean).join(" · ")}
                    {proposal.city_name ? ` (${proposal.city_name})` : ""}
                  </Copy>
                )}
                {proposal.concert_name && (
                  <Copy muted>Concierto vinculado: {proposal.concert_name}</Copy>
                )}
                {proposal.sender_name && (
                  <Copy muted>
                    Enviada por: {proposal.sender_name}
                    {proposal.sender_email ? ` (${proposal.sender_email})` : ""}
                  </Copy>
                )}
                {proposal.proposed_date && (
                  <Copy muted>Fecha propuesta: {dateLabel(proposal.proposed_date)}</Copy>
                )}
                {proposal.offered_amount != null && (
                  <Copy strong>Presupuesto / Cachet: {money(proposal.offered_amount)}</Copy>
                )}
                {proposal.message && <Copy>{proposal.message}</Copy>}
                {proposal.rejection_reason && (
                  <Copy muted>Motivo / Respuesta: {proposal.rejection_reason}</Copy>
                )}
              </View>

              {proposal.status === "PENDING" && (
                <View style={styles.row}>
                  {proposal.can_respond && (
                    <>
                      <Button
                        title="Aceptar propuesta"
                        disabled={action.busy}
                        onPress={() =>
                          void respond(
                            proposal,
                            "accept",
                          )
                        }
                      />
                      <Button
                        title="Rechazar"
                        secondary
                        danger
                        disabled={action.busy}
                        onPress={() =>
                          void respond(
                            proposal,
                            "reject",
                            "No contamos con disponibilidad en esa fecha.",
                          )
                        }
                      />
                    </>
                  )}
                  {proposal.can_cancel && (
                    <Button
                      title="Cancelar solicitud"
                      secondary
                      danger
                      disabled={action.busy}
                      onPress={() => void respond(proposal, "cancel")}
                    />
                  )}
                </View>
              )}
            </Card>
          </View>
        ))}
      </BentoGrid>
    </View>
  );
}

function ArtistPitchToVenueForm({
  artists,
  done,
}: {
  artists: Artist[];
  done(): void;
}) {
  const [selectedArtistId, setSelectedArtistId] = useState<string>(artists[0]?.id ?? "");
  const [venueSearch, setVenueSearch] = useState("");
  const venues = useResource<Venue[]>(`/marketplace/venues${query({ q: venueSearch.trim(), limit: 12 })}`);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const action = useAction();
  const validation = useForm();

  const submit = () =>
    action.run(async () => {
      validation.assertValid();
      if (!selectedArtistId) throw new Error("Elegí tu perfil artístico.");
      if (!selectedVenue) throw new Error("Elegí un espacio físico donde quieras presentarte.");
      if (!form.event_name?.trim()) throw new Error("Ingresá el nombre del show o propuesta.");
      const budget = form.offered_budget?.trim() ? Number(form.offered_budget.trim()) : null;
      if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
        throw new Error("El presupuesto estimado debe ser un monto válido.");
      }

      const proposedDate = form.event_date?.trim()
        ? new Date(`${form.event_date.trim()}T21:00:00Z`).toISOString()
        : new Date(Date.now() + 14 * 86400000).toISOString();

      await api.request("/proposals", {
        method: "POST",
        body: {
          flow_type: "ARTIST_TO_VENUE",
          artist_profile_id: selectedArtistId,
          venue_id: selectedVenue.id,
          event_title: form.event_name.trim(),
          proposed_date: proposedDate,
          offered_amount: budget,
          message: form.message?.trim() || null,
        },
      });
      action.setMessage("Solicitud enviada al espacio físico.");
      done();
    });

  return (
    <Card variant="featured">
      <FormScope form={validation}>
        <SectionHeader
          title="Solicitar fecha a un Espacio Físico"
          subtitle="Proponé una presentación en vivo directamente al responsable de una sala o espacio."
        />
        {artists.length > 1 && (
          <View style={styles.row}>
            {artists.map((artist) => (
              <Button
                key={artist.id}
                title={`${selectedArtistId === artist.id ? "✓ " : ""}${artist.stage_name}`}
                secondary={selectedArtistId !== artist.id}
                onPress={() => setSelectedArtistId(artist.id)}
              />
            ))}
          </View>
        )}
        <Field
          label="Buscar espacio físico o sala"
          value={venueSearch}
          onChangeText={setVenueSearch}
          placeholder="Ej. Radio City, Faro, Puerto..."
        />
        <ResourceState {...venues} empty={venues.result?.data.length === 0} retry={() => void venues.reload()} />
        <View style={styles.row}>
          {venues.result?.data.map((venue) => (
            <Button
              key={venue.id}
              title={`${selectedVenue?.id === venue.id ? "✓ " : ""}${venue.name} · ${venue.establishment_name}`}
              secondary={selectedVenue?.id !== venue.id}
              onPress={() => setSelectedVenue(venue)}
            />
          ))}
        </View>
        <Field
          label="Título de la fecha o propuesta artística"
          required
          value={form.event_name ?? ""}
          onChangeText={(v) => setForm({ ...form, event_name: v })}
          placeholder="Ej. Presentación de álbum en Mar del Plata"
        />
        <View style={styles.row}>
          <Field
            label="Fecha tentativa (AAAA-MM-DD, opcional)"
            value={form.event_date ?? ""}
            onChangeText={(v) => setForm({ ...form, event_date: v })}
            placeholder="2026-12-05"
          />
          <Field
            label="Presupuesto / Borderaux estimado (ARS, opcional)"
            keyboardType="decimal-pad"
            value={form.offered_budget ?? ""}
            onChangeText={(v) => setForm({ ...form, offered_budget: v })}
            placeholder="900000"
          />
        </View>
        <Field
          label="Detalle de la propuesta, requerimiento técnico y formato"
          multiline
          value={form.message ?? ""}
          onChangeText={(v) => setForm({ ...form, message: v })}
          placeholder="Contale al espacio sobre el formato del show, convocatoria estimada y necesidades técnicas..."
        />
        <ActionFeedback action={action} />
        <View style={styles.row}>
          <Button title="Enviar solicitud al espacio" disabled={action.busy} onPress={() => void submit()} />
          <Button title="Cancelar" secondary onPress={done} />
        </View>
      </FormScope>
    </Card>
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
      phone: artist?.phone ?? "",
      contact_email: artist?.contact_email ?? "",
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
        phone: form.phone?.trim() || null,
        contact_email: form.contact_email?.trim() || null,
        genre_ids: genres,
      };
      const { data } = await api.request<ArtistDetail>(
        artist ? `/artists/${artist.id}` : "/artists",
        { method: artist ? "PATCH" : "POST", body },
      );
      await done(data.id);
    });
  return (
    <Card variant="featured">
      <FormScope form={validation}>
        <SectionHeader
          title={artist ? `Editar ${artist.stage_name}` : "Nuevo perfil de artista"}
          subtitle="Completá el nombre artístico, género musical, ciudad, biografía, imagen y canales de contacto."
        />
        <Field
          label="Nombre artístico"
          required
          value={form.stage_name ?? ""}
          autoCapitalize="words"
          onChangeText={(value) => set("stage_name", value)}
        />
        <Field
          label="Descripción / Biografía"
          value={form.bio ?? ""}
          multiline
          autoCapitalize="sentences"
          onChangeText={(value) => set("bio", value)}
        />
        <View style={styles.row}>
          <Select
            label="Ciudad"
            path="/cities"
            values={city}
            onChange={setCity}
          />
          <Select
            label="Género musical"
            path="/genres"
            multiple
            values={genres}
            onChange={setGenres}
          />
        </View>
        <View style={styles.row}>
          <Field
            label="Correo electrónico de contacto"
            keyboardType="email-address"
            value={form.contact_email ?? ""}
            onChangeText={(value) => set("contact_email", value)}
          />
          <Field
            label="Teléfono de contacto"
            keyboardType="phone-pad"
            value={form.phone ?? ""}
            onChangeText={(value) => set("phone", value)}
          />
        </View>
        <View style={styles.row}>
          <Field
            label="Imagen (URL, opcional)"
            value={form.image_url ?? ""}
            onChangeText={(value) => set("image_url", value)}
          />
          <Field
            label="Sitio web / Redes (http o https, opcional)"
            value={form.website ?? ""}
            onChangeText={(value) => set("website", value)}
          />
        </View>
        <ActionFeedback action={action} />
        <View style={styles.row}>
          <Button
            title={artist ? "Guardar cambios" : "Crear perfil"}
            disabled={action.busy}
            onPress={() => void save()}
          />
          <Button title="Cerrar edición" secondary onPress={() => void done()} />
        </View>
      </FormScope>
    </Card>
  );
}

export function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, can } = useAuth();
  const { mobile } = useBento();
  const resource = useResource<ArtistDetail>(`/artists/${id}`);
  const artist = resource.result?.data;
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("MEMBER");
  const [confirm, setConfirm] = useState<string | null>(null);
  // Status and membership are for an OWNER, and artists.admin overrides membership.
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
    <Page
      eyebrow="VENTI · PERFIL DE ARTISTA"
      title={artist ? artist.stage_name : "Perfil de artista"}
      actions={
        <Button
          title="Volver a mis perfiles"
          secondary
          onPress={() => router.push("/artists")}
        />
      }
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {artist && (
        <>
          <BentoGrid style={{ alignItems: "flex-start" }}>
            <View
              style={{
                flexGrow: 2,
                flexShrink: 1,
                minWidth: 0,
                flexBasis: mobile ? "100%" : 500,
                maxWidth: "100%",
                gap: 16,
              }}
            >
              <Card variant="featured">
                <MusicalCover
                  uri={artist.image_url}
                  alt={artist.stage_name}
                  kind="artist"
                  height={210}
                  badge={STATUS[artist.status]}
                />
                <Copy strong>
                  {artist.stage_name} · {STATUS[artist.status]}
                </Copy>
                <Copy muted>
                  {[artist.city_name, artist.genres.map((genre) => genre.name).join(", ")]
                    .filter(Boolean)
                    .join(" · ") || "Sin ciudad ni géneros"}
                </Copy>
                {artist.bio && <Copy>{artist.bio}</Copy>}
                {(artist.contact_email || artist.phone) && (
                  <Copy muted>
                    Contacto artístico: {[artist.contact_email, artist.phone].filter(Boolean).join(" · ")}
                  </Copy>
                )}
                {artist.website && <Copy muted>Sitio web / Redes: {artist.website}</Copy>}
                <Copy muted>
                  {artist.published_at
                    ? `Publicado ${dateLabel(artist.published_at)}`
                    : "Sin publicar"}
                </Copy>
                <View style={[styles.row, { paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }]}>
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
                  {artist.status === "PUBLISHED" && (
                    <Button
                      title="Ver perfil público"
                      secondary
                      onPress={() => router.push(`/artist/${artist.id}`)}
                    />
                  )}
                </View>
              </Card>
              {artist.status === "ARCHIVED" && (
                <Card variant="subtle">
                  <Copy muted>
                    Un perfil archivado no se edita. Publicalo de nuevo para seguir
                    cambiándolo.
                  </Copy>
                </Card>
              )}
              {editing && artist.status !== "ARCHIVED" && (
                <ArtistEditor
                  artist={artist}
                  done={async () => {
                    setEditing(false);
                    await resource.reload();
                  }}
                />
              )}
            </View>

            <View
              style={{
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                flexBasis: mobile ? "100%" : 380,
                maxWidth: "100%",
              }}
            >
              <Card>
                <Copy strong>Integrantes</Copy>
                <Copy muted>
                  Solo se suman cuentas con el rol Artista. El perfil conserva
                  siempre un Propietario.
                </Copy>
                {artist.members.map((member) => (
                  <View
                    key={member.user_id}
                    style={[
                      styles.row,
                      {
                        paddingVertical: 8,
                        borderTopWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Copy>
                      {memberName(member)} · {statusLabel(member.member_role)}
                    </Copy>
                    {owner && member.member_role === "MEMBER" && (
                      <Button
                        title={`Hacer Propietario a ${memberName(member)}`}
                        secondary
                        disabled={action.busy}
                        onPress={() => void setMemberRole(member, "OWNER")}
                      />
                    )}
                    {owner && member.member_role === "OWNER" && member.user_id !== user?.id && (
                      <Button
                        title={`Pasar a Integrante a ${memberName(member)}`}
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
                  <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border }}>
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
                          title={statusLabel(value)}
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
                  </View>
                )}
              </Card>
            </View>
          </BentoGrid>
          <ArtistProposalsPanel artistId={artist.id} />
          <Performances id={artist.id} />
        </>
      )}
    </Page>
  );
}

// GET /artists/:id/concerts: concerts that bill the profile (drafts excluded), upcoming first by date, past newest first.
function Performances({ id }: { id: string }) {
  const resource = useResource<ArtistConcerts>(`/artists/${id}/concerts`);
  const concerts = resource.result?.data;
  return (
    <View style={{ gap: 14 }}>
      <SectionHeader title="Presentaciones" subtitle="Fechas en vivo vinculadas a este perfil artístico" />
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {concerts && !concerts.upcoming.length && !concerts.past.length && (
        <Card variant="subtle">
          <Copy muted>
            Todavía no hay conciertos con este perfil en el cartel. El organizador
            lo vincula al cargar el concierto.
          </Copy>
        </Card>
      )}
      {([["Próximas", concerts?.upcoming], ["Anteriores", concerts?.past]] as const).map(([label, list]) =>
        list?.length ? (
          <View key={label} style={{ gap: 12 }}>
            <Copy muted>{label}</Copy>
            <BentoGrid>
              {list.map((concert) => (
                <ConcertCard key={concert.id} concert={concert} />
              ))}
            </BentoGrid>
          </View>
        ) : null,
      )}
    </View>
  );
}

// Public profile (GET /artists/:id): only published profiles, unless the viewer is a member or artists.admin.
export function PublicArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<ArtistDetail>(`/artists/${id}`);
  const artist = resource.result?.data;
  return (
    <Page
      eyebrow="VENTI · ARTISTA"
      title={artist?.stage_name ?? "Artista"}
      actions={<Button title="Volver" secondary onPress={() => router.back()} />}
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {artist && (
        <>
          <Card variant="featured">
            <MusicalCover
              uri={artist.image_url}
              alt={artist.stage_name}
              kind="artist"
              height={240}
              badge="PERFIL OFICIAL"
              subBadge={artist.city_name ?? undefined}
            />
            <Copy muted>
              {[artist.city_name, artist.genres.map((genre) => genre.name).join(", ")]
                .filter(Boolean)
                .join(" · ") || "Sin ciudad ni géneros"}
            </Copy>
            {artist.bio && <Copy>{artist.bio}</Copy>}
            {(artist.contact_email || artist.phone) && (
              <Copy muted>
                Contacto: {[artist.contact_email, artist.phone].filter(Boolean).join(" · ")}
              </Copy>
            )}
            {artist.website && <Copy muted>Sitio web / Redes: {artist.website}</Copy>}
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
    </Page>
  );
}
