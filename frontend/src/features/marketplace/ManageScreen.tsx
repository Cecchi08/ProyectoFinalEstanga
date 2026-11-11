import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type {
  Artist,
  ArtistProposal,
  Block,
  Establishment,
  MarketplaceCatalogs,
  Member,
  Named,
  Organization,
  Venue,
  VenueDetail,
  VenueHiringSummary,
} from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  DateTimeField,
  Field,
  FormScope,
  Notice,
  Page,
  ResourceState,
  SectionHeader,
  SegmentedTabs,
  colors,
  dateLabel,
  flowLabel,
  money,
  statusLabel,
  styles,
  useAction,
  useBento,
  useDebouncedValue,
  useForm,
} from "../../components/ui";
import { Codes, VenueCard } from "./MarketplaceScreen";
import { WEEKDAY_NAMES, at, fromArgDateTimeToUtcIso, isDate, range, validateOpeningHours } from "./time";

const text = (value?: string) => value?.trim() || null;
const number = (value?: string) => (value?.trim() ? Number(value) : null);
const roleNames = { OWNER: "Dueño", ADMIN: "Administrador", STAFF: "Staff" } as const;
const reasonLabel: Record<string, string> = {
  MAINTENANCE: "Mantenimiento",
  PRIVATE_USE: "Uso privado",
  HOLIDAY: "Feriado",
  OTHER: "Otro",
};

export default function ManageScreen() {
  const organizations = useResource<Organization[]>("/marketplace/organizations/mine");
  const establishments = useResource<Establishment[]>("/marketplace/establishments/mine");
  const [screenTab, setScreenTab] = useState<"all" | "establishments" | "organizations">("all");
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [establishment, setEstablishment] = useState<Establishment | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, string>>({});
  const action = useAction();
  const validation = useForm();
  const { mobile } = useBento();
  const createOrganization = () => action.run(async () => {
    validation.assertValid();
    await api.request("/marketplace/organizations/create", { method: "POST", body: { name: form.org_name ?? "", tax_id: text(form.tax_id) } });
    setForm({}); await organizations.reload(); action.setMessage("Organización creada.");
  });
  return (
    <Page
      eyebrow="VENTI · PANEL DE ESPACIO FÍSICO"
      title="Mis establecimientos y salas"
      subtitle="Administración del espacio, capacidades, presupuestos, artistas contratados y organizadores relacionados."
      actions={
        <>
          <Button title="Reservas recibidas" secondary onPress={() => router.push("/marketplace/reservations")} />
          <Button title="Presupuestos recibidos" secondary onPress={() => router.push("/marketplace/quotes")} />
          <Button title="Ver marketplace" secondary onPress={() => router.push("/marketplace")} />
        </>
      }
    >
      <SegmentedTabs
        value={screenTab}
        onChange={(v) => setScreenTab(v)}
        tabs={[
          { id: "all", label: "Todo el panel" },
          { id: "establishments", label: "Espacios y salas", badge: establishments.result?.data.length },
          { id: "organizations", label: "Organizaciones y miembros", badge: organizations.result?.data.length },
        ]}
      />

      {(screenTab === "all" || screenTab === "organizations") && (
        <BentoGrid style={{ alignItems: "flex-start" }}>
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 440,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
              gap: 14,
            }}
          >
            <Card>
              <SectionHeader title="Organizaciones" subtitle="Seleccioná una organización para administrar miembros" />
              <ResourceState {...organizations} empty={organizations.result?.data.length === 0} retry={() => void organizations.reload()} />
              <View style={styles.row}>
                {organizations.result?.data.map((org) => (
                  <Button
                    key={org.id}
                    title={`${organization?.id === org.id ? "✓ " : ""}${org.name} (${roleNames[org.member_role]})`}
                    secondary={organization?.id !== org.id}
                    onPress={() => setOrganization(organization?.id === org.id ? null : org)}
                  />
                ))}
              </View>
            </Card>
            {organization && <MembersPanel organization={organization} />}
          </View>

          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 420,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
            }}
          >
            <Card variant="subtle">
              <FormScope form={validation}>
                <SectionHeader title="Nueva organización" />
                <View style={styles.row}>
                  <Field label="Nombre de la organización" required value={form.org_name ?? ""} onChangeText={(v) => setForm({ ...form, org_name: v })} />
                  <Field label="CUIT (opcional)" value={form.tax_id ?? ""} onChangeText={(v) => setForm({ ...form, tax_id: v })} />
                </View>
                <ActionFeedback action={action} />
                <Button title="Crear organización" disabled={action.busy} onPress={() => void createOrganization()} />
              </FormScope>
            </Card>
          </View>
        </BentoGrid>
      )}

      {(screenTab === "all" || screenTab === "establishments") && (
        <>
          <SectionHeader
            title="A. Administración del Espacio y Contrataciones"
            subtitle="Gestioná tus complejos, salas, disponibilidad, artistas contratados y organizadores."
            action={<Button title="Nuevo establecimiento" onPress={() => setEstablishment(null)} />}
          />
          {establishment === null && (
            <EstablishmentForm organizations={organizations.result?.data ?? []} done={async () => { setEstablishment(undefined); await establishments.reload(); }} />
          )}
          <ResourceState {...establishments} empty={establishments.result?.data.length === 0} retry={() => void establishments.reload()} />
          {establishments.result?.data.map((item) => (
            <EstablishmentPanel key={`${item.id}-${item.status}`} establishment={item} organizations={organizations.result?.data ?? []}
              reload={establishments.reload} />
          ))}
        </>
      )}
    </Page>
  );
}

// Also used by service companies: same organization_members rules, another endpoint and another required profile.
export function MembersPanel({ organization, path = `/marketplace/organizations/${organization.id}/members`, profile = "VENUE", admin = false }: {
  organization: Pick<Organization, "id" | "name"> & { member_role?: Organization["member_role"] | null };
  path?: string; profile?: string; admin?: boolean;
}) {
  const { user } = useAuth();
  const members = useResource<Member[]>(path);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["member_role"]>("STAFF");
  const action = useAction();
  const validation = useForm();
  const run = (work: () => Promise<unknown>, message: string) => action.run(async () => { await work(); await members.reload(); action.setMessage(message); });
  const manage = admin || ["OWNER", "ADMIN"].includes(organization.member_role ?? "");
  return (
    <Card>
      <SectionHeader title={`Miembros de ${organization.name}`} />
      <ResourceState {...members} retry={() => void members.reload()} />
      {members.result?.data.map((member) => (
        <View
          key={member.user_id}
          style={{
            gap: 8,
            paddingTop: 10,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Copy muted>{[member.first_name, member.last_name].filter(Boolean).join(" ") || member.email} · {member.email} · {roleNames[member.member_role]}</Copy>
          {manage && (
            <View style={styles.row}>
              {(Object.keys(roleNames) as Member["member_role"][]).filter((r) => r !== member.member_role).map((next) => (
                <Button key={next} title={`Hacer ${roleNames[next]}: ${member.email}`} secondary disabled={action.busy}
                  onPress={() => void run(() => api.request(`${path}/${member.user_id}/update`, { method: "POST", body: { member_role: next } }), "Rol actualizado.")} />
              ))}
            </View>
          )}
          {(manage || member.user_id === user?.id) && (
            <Button title={member.user_id === user?.id ? "Salir de la organización" : `Quitar a ${member.email}`} secondary danger disabled={action.busy}
              onPress={() => void run(() => api.request(`${path}/${member.user_id}/delete`, { method: "POST" }), "Miembro quitado.")} />
          )}
        </View>
      ))}
      {manage && (
        <FormScope form={validation}>
          <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border }}>
            <Field required label={`Email del miembro (cuenta con rol ${profile === "VENUE" ? "Espacio Físico" : "Empresa de Servicios"})`} keyboardType="email-address" value={email} onChangeText={setEmail} />
            <View style={styles.row}>
              {(Object.keys(roleNames) as Member["member_role"][]).map((value) => (
                <Button key={value} title={`${role === value ? "✓ " : ""}${roleNames[value]}`} secondary={role !== value} onPress={() => setRole(value)} />
              ))}
            </View>
            <Button title="Agregar miembro" disabled={action.busy}
              onPress={() => void run(async () => { validation.assertValid(); await api.request(`${path}/add`, { method: "POST", body: { email, member_role: role } }); setEmail(""); }, "Miembro agregado.")} />
          </View>
        </FormScope>
      )}
      <ActionFeedback action={action} />
    </Card>
  );
}

function EstablishmentForm({ establishment, organizations, done }: { establishment?: Establishment; organizations: Organization[]; done(): Promise<void> }) {
  const cities = useResource<Named[]>("/marketplace/cities");
  const [form, setForm] = useState<Record<string, string>>({
    organization_id: establishment?.organization_id ?? "", city_id: establishment?.city_id ?? "", name: establishment?.name ?? "",
    address_line: establishment?.address_line ?? "", description: establishment?.description ?? "", postal_code: establishment?.postal_code ?? "",
    phone: establishment?.phone ?? "", email: establishment?.email ?? "", website: establishment?.website ?? "",
  });
  const action = useAction();
  const validation = useForm();
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  const save = () => action.run(async () => {
    validation.assertValid();
    const body = { city_id: form.city_id, name: form.name, address_line: form.address_line, description: text(form.description),
      postal_code: text(form.postal_code), phone: text(form.phone), email: text(form.email), website: text(form.website) };
    await api.request(establishment ? `/marketplace/establishments/${establishment.id}/update` : "/marketplace/establishments/create", {
      method: "POST", body: establishment ? body : { ...body, organization_id: form.organization_id },
    });
    await done();
  });
  return (
    <Card variant="featured">
      <FormScope form={validation}>
        <SectionHeader title={establishment ? `Editar ${establishment.name}` : "Nuevo establecimiento"} />
        {!establishment && (
          <Codes label="Organización" items={organizations.filter((o) => o.member_role !== "STAFF")}
            values={form.organization_id ? [form.organization_id] : []} onChange={(v) => set("organization_id", v[0] ?? "")} />
        )}
        <Codes label="Ciudad" items={cities.result?.data} values={form.city_id ? [form.city_id] : []} onChange={(v) => set("city_id", v[0] ?? "")} />
        <View style={styles.row}>
          <Field label="Nombre del establecimiento" required value={form.name ?? ""} onChangeText={(v) => set("name", v)} />
          <Field label="Dirección" required value={form.address_line ?? ""} onChangeText={(v) => set("address_line", v)} />
        </View>
        <Field label="Descripción (opcional)" value={form.description ?? ""} onChangeText={(v) => set("description", v)} />
        <View style={styles.row}>
          <Field label="Código postal (opcional)" value={form.postal_code ?? ""} onChangeText={(v) => set("postal_code", v)} />
          <Field label="Teléfono (opcional)" value={form.phone ?? ""} onChangeText={(v) => set("phone", v)} />
        </View>
        <View style={styles.row}>
          <Field label="Email de contacto (opcional)" value={form.email ?? ""} onChangeText={(v) => set("email", v)} />
          <Field label="Sitio web (opcional)" value={form.website ?? ""} onChangeText={(v) => set("website", v)} />
        </View>
        <ActionFeedback action={action} />
        <View style={styles.row}>
          <Button title="Guardar establecimiento" disabled={action.busy} onPress={() => void save()} />
          <Button title="Cerrar formulario" secondary onPress={() => void done()} />
        </View>
      </FormScope>
    </Card>
  );
}

// Publishing is a request: the owner sends the establishment to review and an ADMIN (marketplace.admin) publishes it.
function EstablishmentPanel({ establishment, organizations, reload }: { establishment: Establishment; organizations: Organization[]; reload(): Promise<void> }) {
  const [open, setOpen] = useState<"edit" | "venues" | "blocks" | "hirings" | "hire_artist">("venues");
  const reviewer = useAuth().can("marketplace.admin");
  const action = useAction();
  const status = (next: "publish" | "archive") => action.run(async () => {
    await api.request(`/marketplace/establishments/${establishment.id}/${next}`, { method: "POST", body: {} }); await reload();
  });
  return (
    <Card variant="featured">
      <Copy strong>{establishment.name} · {statusLabel(establishment.status)}</Copy>
      <Copy muted>{establishment.address_line} · {establishment.venues} espacio(s)</Copy>
      {(establishment.phone || establishment.email) && (
        <Copy muted>{[establishment.phone, establishment.email].filter(Boolean).join(" · ")}</Copy>
      )}
      {establishment.status === "PENDING_REVIEW" && (
        <Notice tone="info" message="En revisión: aparece en las búsquedas cuando un administrador de Venti lo aprueba." />
      )}
      {establishment.status === "DRAFT" && establishment.review_note && (
        <Notice tone="warning" message={`Revisión rechazada: ${establishment.review_note}`} />
      )}
      <SegmentedTabs
        value={open}
        onChange={(v) => setOpen(v)}
        tabs={[
          { id: "venues", label: "Salas y capacidades" },
          { id: "blocks", label: "Disponibilidad y bloqueos" },
          { id: "hirings", label: "Artistas y organizadores" },
          { id: "hire_artist", label: "Contratar artista" },
          { id: "edit", label: "Editar datos" },
        ]}
      />
      {(establishment.status !== "PUBLISHED" && (reviewer || establishment.status !== "PENDING_REVIEW") || ["PUBLISHED", "PENDING_REVIEW"].includes(establishment.status)) && (
        <View style={styles.row}>
          {establishment.status !== "PUBLISHED" && (reviewer || establishment.status !== "PENDING_REVIEW") && (
            <Button title={`${reviewer ? "Publicar" : "Enviar a revisión"} ${establishment.name}`} disabled={action.busy} onPress={() => void status("publish")} />
          )}
          {["PUBLISHED", "PENDING_REVIEW"].includes(establishment.status) && (
            <Button title={`Archivar ${establishment.name}`} secondary danger disabled={action.busy} onPress={() => void status("archive")} />
          )}
        </View>
      )}
      <ActionFeedback action={action} />
      {open === "edit" && <EstablishmentForm establishment={establishment} organizations={organizations} done={async () => { setOpen("venues"); await reload(); }} />}
      {open === "venues" && <VenuesPanel establishment={establishment} />}
      {open === "blocks" && <BlocksPanel establishment={establishment} />}
      {open === "hirings" && <VenueHiringsPanel establishment={establishment} />}
      {open === "hire_artist" && <HireArtistPanel establishment={establishment} onCreated={() => setOpen("hirings")} />}
    </Card>
  );
}

function VenueHiringsPanel({ establishment }: { establishment: Establishment }) {
  const summary = useResource<VenueHiringSummary>(`/proposals/venue-summary/${establishment.id}`);
  const action = useAction();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const data = summary.result?.data;
  const acceptedArtists = data?.proposals.filter((p) => p.status === "ACCEPTED") ?? [];

  const respond = (proposal: ArtistProposal, operation: "accept" | "reject" | "cancel", responseNote?: string) =>
    action.run(async () => {
      if (operation === "reject" && (!responseNote || responseNote.trim().length < 3)) {
        throw new Error("Indicá un motivo de al menos 3 caracteres para rechazar la solicitud.");
      }
      await api.request(`/proposals/${proposal.id}/${operation}`, {
        method: "POST",
        body: responseNote ? { reason: responseNote.trim() } : {},
      });
      setRejectingId(null);
      setRejectReason("");
      await summary.reload();
      action.setMessage(
        operation === "accept"
          ? "Solicitud aceptada."
          : operation === "reject"
            ? "Solicitud rechazada."
            : "Solicitud cancelada.",
      );
    });

  return (
    <View style={{ gap: 14, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border }}>
      <SectionHeader
        title="B. Artistas Contratados y Organizadores Relacionados"
        subtitle="Resumen operativo de artistas confirmados, productoras vinculadas, conciertos en agenda e historial de solicitudes."
      />
      <ResourceState {...summary} retry={() => void summary.reload()} />
      <ActionFeedback action={action} />
      {data && (
        <View style={{ gap: 14 }}>
          <Card variant="subtle">
            <SectionHeader
              title="Artistas confirmados en el establecimiento"
              subtitle="Contrataciones directas o vinculadas a eventos aceptados"
            />
            {!acceptedArtists.length ? (
              <Copy muted>Todavía no hay artistas confirmados para este establecimiento.</Copy>
            ) : (
              acceptedArtists.map((proposal) => (
                <View
                  key={proposal.id}
                  style={{
                    gap: 4,
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Copy strong>
                    {proposal.artist_name} · {proposal.event_title} ({statusLabel(proposal.status)})
                  </Copy>
                  <Copy muted>
                    {flowLabel(proposal.flow_type)}
                    {proposal.venue_name ? ` · Sala: ${proposal.venue_name}` : ""}
                    {proposal.proposed_date ? ` · Fecha: ${dateLabel(proposal.proposed_date)}` : ""}
                    {proposal.offered_amount != null ? ` · Presupuesto: ${money(proposal.offered_amount)}` : ""}
                  </Copy>
                  {(proposal.artist_contact_email || proposal.artist_phone) && (
                    <Copy muted>
                      Contacto del artista: {[proposal.artist_contact_email, proposal.artist_phone].filter(Boolean).join(" · ")}
                    </Copy>
                  )}
                </View>
              ))
            )}
          </Card>

          <Card variant="subtle">
            <SectionHeader
              title="Organizadores relacionados"
              subtitle="Productoras y organizadores con reservas o conciertos en este espacio"
            />
            {!data.related_organizers.length ? (
              <Copy muted>Todavía no hay organizadores con reservas o eventos en este espacio.</Copy>
            ) : (
              data.related_organizers.map((organizer) => (
                <View
                  key={`${organizer.reservation_code}-${organizer.organizer_email}`}
                  style={{
                    gap: 4,
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Copy strong>{organizer.organizer_name ?? organizer.organizer_email}</Copy>
                  <Copy muted>
                    {[organizer.organizer_email, organizer.organizer_phone, organizer.organization_name].filter(Boolean).join(" · ")}
                  </Copy>
                  <Copy muted>
                    Reserva: {organizer.event_name} ({organizer.venue_name}) · {statusLabel(organizer.reservation_status)} · Ref. {organizer.reservation_code}
                    {organizer.concert_name ? ` · Concierto: ${organizer.concert_name}` : ""}
                  </Copy>
                </View>
              ))
            )}
          </Card>

          <Card variant="subtle">
            <SectionHeader
              title="Eventos y conciertos programados"
              subtitle="Shows vinculados a las salas de este establecimiento"
            />
            {!data.concerts.length ? (
              <Copy muted>No hay conciertos programados actualmente.</Copy>
            ) : (
              data.concerts.map((concert) => (
                <View
                  key={concert.id}
                  style={{
                    gap: 4,
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Copy strong>
                    {concert.name} · {statusLabel(concert.status)}
                  </Copy>
                  <Copy muted>
                    Artista: {concert.artist_name} · Sala: {concert.venue_name} · {dateLabel(concert.start_datetime)}
                  </Copy>
                  <Copy muted>
                    Organizador: {concert.organizer_name} ({concert.organizer_email})
                  </Copy>
                </View>
              ))
            )}
          </Card>

          <Card variant="subtle">
            <SectionHeader
              title="Solicitudes e historial de contrataciones con artistas"
              subtitle="Propuestas enviadas por el espacio y solicitudes recibidas desde artistas"
            />
            {!data.proposals.length ? (
              <Copy muted>Sin solicitudes registradas para este establecimiento.</Copy>
            ) : (
              data.proposals.map((proposal) => (
                <View
                  key={proposal.id}
                  style={{
                    gap: 6,
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Copy strong>
                    {proposal.event_title} · {proposal.artist_name} · {statusLabel(proposal.status)}
                  </Copy>
                  <Copy muted>
                    {flowLabel(proposal.flow_type)}
                    {proposal.venue_name ? ` · Sala: ${proposal.venue_name}` : ""}
                    {proposal.proposed_date ? ` · Fecha propuesta: ${dateLabel(proposal.proposed_date)}` : ""}
                    {proposal.offered_amount != null ? ` · Monto: ${money(proposal.offered_amount)}` : ""}
                  </Copy>
                  {proposal.message ? <Copy>{proposal.message}</Copy> : null}
                  {proposal.rejection_reason ? (
                    <Copy muted>Respuesta: {proposal.rejection_reason}</Copy>
                  ) : null}
                  <View style={styles.row}>
                    <Button
                      title="Ver detalle completo"
                      secondary
                      onPress={() => router.push(`/proposals/${proposal.id}`)}
                    />
                    {proposal.status === "PENDING" && proposal.can_respond && (
                      <>
                        <Button
                          title="Aceptar solicitud del artista"
                          disabled={action.busy}
                          onPress={() => void respond(proposal, "accept")}
                        />
                        <Button
                          title={rejectingId === proposal.id ? "Cancelar rechazo" : "Rechazar solicitud"}
                          secondary
                          danger
                          disabled={action.busy}
                          onPress={() => {
                            setRejectingId(rejectingId === proposal.id ? null : proposal.id);
                            setRejectReason("");
                          }}
                        />
                      </>
                    )}
                    {proposal.status === "PENDING" && proposal.can_cancel && (
                      <Button
                        title="Cancelar propuesta enviada"
                        secondary
                        danger
                        disabled={action.busy}
                        onPress={() => void respond(proposal, "cancel")}
                      />
                    )}
                  </View>
                  {proposal.status === "PENDING" && proposal.can_respond && rejectingId === proposal.id && (
                    <View style={{ gap: 8, paddingTop: 6 }}>
                      <Field
                        label="Motivo del rechazo (mínimo 3 caracteres)"
                        required
                        multiline
                        value={rejectReason}
                        onChangeText={setRejectReason}
                      />
                      <Button
                        title="Confirmar rechazo"
                        danger
                        disabled={action.busy}
                        onPress={() => void respond(proposal, "reject", rejectReason)}
                      />
                    </View>
                  )}
                </View>
              ))
            )}
          </Card>
        </View>
      )}
    </View>
  );
}

function HireArtistPanel({
  establishment,
  onCreated,
}: {
  establishment: Establishment;
  onCreated(): void;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const artists = useResource<Artist[]>(`/artists${query({ q: debouncedSearch.trim(), limit: 12 })}`);
  const venues = useResource<Venue[]>(`/marketplace/establishments/${establishment.id}/venues`);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [venueId, setVenueId] = useState<string[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const action = useAction();
  const validation = useForm();

  const sendProposal = () =>
    action.run(async () => {
      validation.assertValid();
      if (!selectedArtist) throw new Error("Seleccioná un artista del catálogo.");
      if (!form.event_name?.trim()) throw new Error("Ingresá el nombre del show o propuesta.");
      const budget = form.offered_budget?.trim() ? Number(form.offered_budget.trim()) : null;
      if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
        throw new Error("El presupuesto ofrecido debe ser un monto válido.");
      }
      const proposedDate = form.event_date?.trim()
        ? fromArgDateTimeToUtcIso(form.event_date.trim(), "21:00")
        : new Date(Date.now() + 14 * 86400000).toISOString();
      await api.request("/proposals/create", {
        method: "POST",
        body: {
          flow_type: "VENUE_TO_ARTIST",
          artist_profile_id: selectedArtist.id,
          establishment_id: establishment.id,
          venue_id: venueId[0] ?? null,
          event_title: form.event_name.trim(),
          proposed_date: proposedDate,
          offered_amount: budget,
          message: form.message?.trim() || null,
        },
      });
      setForm({});
      setSelectedArtist(null);
      action.setMessage("Propuesta de contratación enviada al artista.");
      onCreated();
    });

  return (
    <View style={{ gap: 12, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border }}>
      <SectionHeader
        title="C. Contratar a un Artista"
        subtitle="Buscá un artista publicado en Venti y enviale una propuesta formal para presentarse en tu espacio."
      />
      <Field
        label="Buscar artista por nombre o género"
        value={search}
        onChangeText={setSearch}
        placeholder="Ej. Marea Suburbana, Atlántico..."
      />
      <ResourceState {...artists} empty={artists.result?.data.length === 0} retry={() => void artists.reload()} />
      <View style={styles.row}>
        {artists.result?.data.map((artist) => (
          <Button
            key={artist.id}
            title={`${selectedArtist?.id === artist.id ? "✓ " : ""}${artist.stage_name}${artist.city_name ? ` (${artist.city_name})` : ""}`}
            secondary={selectedArtist?.id !== artist.id}
            onPress={() => setSelectedArtist(artist)}
          />
        ))}
      </View>

      {selectedArtist && (
        <Card variant="subtle">
          <FormScope form={validation}>
            <Copy strong>Propuesta para {selectedArtist.stage_name}</Copy>
            <Codes
              label="Sala del establecimiento (opcional)"
              items={venues.result?.data}
              values={venueId}
              onChange={setVenueId}
            />
            <Field
              label="Nombre del evento / ciclo propuesto"
              required
              value={form.event_name ?? ""}
              onChangeText={(v) => setForm({ ...form, event_name: v })}
              placeholder="Ej. Ciclo Acústico de Primavera"
            />
            <View style={styles.row}>
              <DateTimeField
                label="Fecha propuesta (opcional)"
                mode="date"
                value={form.event_date ?? ""}
                onChange={(v) => setForm({ ...form, event_date: v })}
              />
              <Field
                label="Cachet / Presupuesto ofrecido (ARS, opcional)"
                keyboardType="decimal-pad"
                value={form.offered_budget ?? ""}
                onChangeText={(v) => setForm({ ...form, offered_budget: v })}
                placeholder="850000"
              />
            </View>
            <Field
              label="Condiciones técnicas y mensaje para el artista"
              multiline
              value={form.message ?? ""}
              onChangeText={(v) => setForm({ ...form, message: v })}
              placeholder="Detallá horarios de prueba de sonido, backline incluido y modalidad..."
            />
            <ActionFeedback action={action} />
            <Button
              title={`Enviar propuesta a ${selectedArtist.stage_name}`}
              disabled={action.busy}
              onPress={() => void sendProposal()}
            />
          </FormScope>
        </Card>
      )}
    </View>
  );
}

function VenuesPanel({ establishment }: { establishment: Establishment }) {
  const venues = useResource<Venue[]>(`/marketplace/establishments/${establishment.id}/venues`);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const action = useAction();
  const status = (venue: Venue, next: "publish" | "archive") => action.run(async () => {
    await api.request(`/marketplace/venues/${venue.id}/${next}`, { method: "POST", body: {} }); await venues.reload();
  });
  return (
    <View style={{ gap: 12, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border }}>
      <Button title={`Nuevo espacio en ${establishment.name}`} onPress={() => setEditing(null)} />
      {editing !== undefined && (
        <VenueForm key={editing ?? "new"} establishmentId={establishment.id} venueId={editing} done={async () => { setEditing(undefined); await venues.reload(); }} />
      )}
      <ActionFeedback action={action} />
      <ResourceState {...venues} empty={venues.result?.data.length === 0} retry={() => void venues.reload()} />
      <BentoGrid>
        {venues.result?.data.map((venue) => (
          <VenueCard
            key={venue.id}
            venue={venue}
            manage
            footerActions={
              <>
                <Button title={`Editar espacio ${venue.name}`} secondary onPress={() => setEditing(venue.id)} />
                {venue.status !== "PUBLISHED"
                  ? <Button title={`Publicar espacio ${venue.name}`} disabled={action.busy} onPress={() => void status(venue, "publish")} />
                  : <Button title={`Archivar espacio ${venue.name}`} secondary danger disabled={action.busy} onPress={() => void status(venue, "archive")} />}
              </>
            }
          />
        ))}
      </BentoGrid>
    </View>
  );
}

type OpeningHourSlot = { day_of_week: number; opens_at: string; closes_at: string };

function OpeningHoursEditor({
  slots,
  onChange,
}: {
  slots: OpeningHourSlot[];
  onChange(next: OpeningHourSlot[]): void;
}) {
  const [dayOfWeek, setDayOfWeek] = useState<number>(5);
  const [opensAt, setOpensAt] = useState("18:00");
  const [closesAt, setClosesAt] = useState("23:55");
  const [slotError, setSlotError] = useState("");

  function addSlot() {
    const candidate: OpeningHourSlot = {
      day_of_week: dayOfWeek,
      opens_at: opensAt,
      closes_at: closesAt,
    };
    const err = validateOpeningHours([...slots, candidate]);
    if (err) {
      setSlotError(err);
      return;
    }
    setSlotError("");
    onChange([...slots, candidate]);
  }

  return (
    <Card variant="default">
      <SectionHeader
        title="Horarios de atención por día"
        subtitle="Elegí el día de la semana y la franja horaria de apertura y cierre."
      />
      <View style={styles.row}>
        {([1, 2, 3, 4, 5, 6, 7] as const).map((dayNum) => (
          <Button
            key={dayNum}
            title={`${dayOfWeek === dayNum ? "✓ " : ""}${WEEKDAY_NAMES[dayNum]}`}
            secondary={dayOfWeek !== dayNum}
            onPress={() => setDayOfWeek(dayNum)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <DateTimeField
          label="Apertura"
          mode="time"
          defaultTime="18:00"
          value={opensAt}
          onChange={setOpensAt}
        />
        <DateTimeField
          label="Cierre"
          mode="time"
          defaultTime="23:55"
          value={closesAt}
          onChange={setClosesAt}
        />
        <Button title="Agregar franja horaria" secondary onPress={addSlot} />
      </View>
      <Notice message={slotError} error />
      {slots.length === 0 ? (
        <Copy muted>Sin franjas horarias cargadas (opcional).</Copy>
      ) : (
        <View style={{ gap: 8 }}>
          {slots.map((slot, index) => (
            <View
              key={`${slot.day_of_week}-${slot.opens_at}-${slot.closes_at}-${index}`}
              style={[
                styles.between,
                {
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
            >
              <Copy strong>
                {WEEKDAY_NAMES[slot.day_of_week]} · {slot.opens_at} a {slot.closes_at} hs
              </Copy>
              <Button
                title={`Quitar franja ${index + 1}`}
                secondary
                danger
                onPress={() => onChange(slots.filter((_, i) => i !== index))}
              />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function VenueForm({ establishmentId, venueId, done }: { establishmentId: string; venueId: string | null; done(): Promise<void> }) {
  const catalogs = useResource<MarketplaceCatalogs>("/marketplace/catalogs");
  const current = useResource<VenueDetail>(venueId ? `/marketplace/venues/${venueId}` : null);
  const [form, setForm] = useState<Record<string, string>>({ min_booking_minutes: "60" });
  const [type, setType] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [openingHours, setOpeningHours] = useState<OpeningHourSlot[]>([]);
  const action = useAction();
  const validation = useForm();
  const venue = current.result?.data;
  useEffect(() => {
    if (!venue) return;
    setForm({
      name: venue.name, description: venue.description ?? "", capacity_standing: String(venue.capacity_standing ?? ""),
      capacity_seated: String(venue.capacity_seated ?? ""), area_m2: venue.area_m2 ?? "", price_per_hour: venue.price_per_hour,
      min_booking_minutes: String(venue.min_booking_minutes),
      photos: venue.photos.map((photo) => photo.url).join("\n"),
    });
    setType([venue.venue_type]);
    setAmenities(venue.amenities.map((a) => a.code));
    setOpeningHours(
      venue.opening_hours.map((h) => ({
        day_of_week: h.day_of_week,
        opens_at: h.opens_at,
        closes_at: h.closes_at,
      })),
    );
  }, [venue]);
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  const save = () => action.run(async () => {
    validation.assertValid();
    if (!type[0]) throw new Error("Elegí el tipo de espacio.");
    const hoursError = validateOpeningHours(openingHours);
    if (hoursError) throw new Error(hoursError);
    const photos = (form.photos ?? "").split("\n").map((url) => url.trim()).filter(Boolean).map((url, index) => ({ url, is_cover: index === 0 }));
    const body = {
      venue_type_code: type[0], name: form.name ?? "", description: text(form.description),
      capacity_standing: number(form.capacity_standing), capacity_seated: number(form.capacity_seated), area_m2: number(form.area_m2),
      price_per_hour: Number(form.price_per_hour || 0), min_booking_minutes: Number(form.min_booking_minutes || 60),
      amenities, photos, opening_hours: openingHours,
    };
    await api.request(venueId ? `/marketplace/venues/${venueId}/update` : `/marketplace/establishments/${establishmentId}/venues/create`, {
      method: "POST", body,
    });
    await done();
  });
  return (
    <Card variant="subtle">
      <FormScope form={validation}>
        <SectionHeader title={venueId ? `Editar ${venue?.name ?? "espacio"}` : "Nuevo espacio"} />
        <ResourceState {...current} retry={() => void current.reload()} />
        <Codes label="Tipo de espacio" items={catalogs.result?.data.venue_types} values={type} onChange={setType} />
        <View style={styles.row}>
          <Field label="Nombre del espacio" required value={form.name ?? ""} onChangeText={(v) => set("name", v)} />
          <Field label="Precio por hora" required value={form.price_per_hour ?? ""} onChangeText={(v) => set("price_per_hour", v)} />
        </View>
        <Field label="Descripción (opcional)" value={form.description ?? ""} onChangeText={(v) => set("description", v)} />
        <View style={styles.row}>
          <Field label="Capacidad de pie (opcional)" value={form.capacity_standing ?? ""} onChangeText={(v) => set("capacity_standing", v)} />
          <Field label="Capacidad sentados (opcional)" value={form.capacity_seated ?? ""} onChangeText={(v) => set("capacity_seated", v)} />
        </View>
        <View style={styles.row}>
          <Field label="Superficie m² (opcional)" value={form.area_m2 ?? ""} onChangeText={(v) => set("area_m2", v)} />
          <Field label="Reserva mínima (minutos)" required value={form.min_booking_minutes ?? ""} onChangeText={(v) => set("min_booking_minutes", v)} />
        </View>
        <Copy muted>La reserva temporal dura 15 minutos hasta el pago, igual para todos los espacios.</Copy>
        <Codes label="Comodidades" multiple items={catalogs.result?.data.amenities} values={amenities} onChange={setAmenities} />
        <Field label="Fotos (una URL por línea, la primera es la portada)" multiline value={form.photos ?? ""} onChangeText={(v) => set("photos", v)} />
        <OpeningHoursEditor slots={openingHours} onChange={setOpeningHours} />
        <ActionFeedback action={action} />
        <View style={styles.row}>
          <Button title="Guardar espacio" disabled={action.busy} onPress={() => void save()} />
          <Button title="Cerrar formulario de espacio" secondary onPress={() => void done()} />
        </View>
      </FormScope>
    </Card>
  );
}

const reasons = [["MAINTENANCE", "Mantenimiento"], ["PRIVATE_USE", "Uso privado"], ["HOLIDAY", "Feriado"], ["OTHER", "Otro"]] as const;
function BlocksPanel({ establishment }: { establishment: Establishment }) {
  const blocks = useResource<Block[]>(`/marketplace/establishments/${establishment.id}/blocks`);
  const venues = useResource<Venue[]>(`/marketplace/establishments/${establishment.id}/venues`);
  const [form, setForm] = useState<Record<string, string>>({});
  const [venue, setVenue] = useState<string[]>([]);
  const [reason, setReason] = useState<string[]>(["MAINTENANCE"]);
  const action = useAction();
  const validation = useForm();
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  const create = () => action.run(async () => {
    validation.assertValid();
    if (!isDate(form.date ?? "")) throw new Error("Elegí la fecha del bloqueo.");
    const starts = at(form.date, form.from ?? ""), ends = at(form.date, form.to ?? "");
    if (ends <= starts) ends.setTime(ends.getTime() + 86400000);
    await api.request(`/marketplace/establishments/${establishment.id}/blocks/create`, { method: "POST", body: {
      venue_id: venue[0] ?? null, reason: reason[0] ?? "OTHER", description: text(form.description), starts_at: starts.toISOString(), ends_at: ends.toISOString(),
    } });
    setForm({}); await blocks.reload(); action.setMessage("Bloqueo creado.");
  });
  const name = (id: string | null) => (id ? venues.result?.data.find((v) => v.id === id)?.name ?? "Sala del establecimiento" : "Todo el establecimiento");
  return (
    <FormScope form={validation}>
      <View style={{ gap: 12, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border }}>
        <ResourceState {...blocks} empty={blocks.result?.data.length === 0} retry={() => void blocks.reload()} />
        {blocks.result?.data.map((block) => (
          <View key={block.id} style={styles.row}>
            <Copy muted>{range(block.starts_at, block.ends_at)} · {name(block.venue_id)} · {reasonLabel[block.reason] ?? statusLabel(block.reason)}{block.description ? ` · ${block.description}` : ""}</Copy>
            <Button title="Quitar bloqueo" secondary danger disabled={action.busy}
              onPress={() => void action.run(async () => { await api.request(`/marketplace/blocks/${block.id}/delete`, { method: "POST" }); await blocks.reload(); })} />
          </View>
        ))}
        <Codes label="Espacio bloqueado (sin elegir: todo el establecimiento)" items={venues.result?.data} values={venue} onChange={setVenue} />
        <Codes label="Motivo" items={reasons.map(([code, label]) => ({ id: code, code, name: label }))} values={reason} onChange={setReason} />
        <View style={styles.row}>
          <DateTimeField label="Fecha del bloqueo" mode="date" required value={form.date ?? ""} onChange={(v) => set("date", v)} />
          <DateTimeField label="Bloqueo desde" mode="time" required defaultTime="10:00" value={form.from ?? ""} onChange={(v) => set("from", v)} />
          <DateTimeField label="Bloqueo hasta" mode="time" required defaultTime="18:00" value={form.to ?? ""} onChange={(v) => set("to", v)} />
        </View>
        <Field label="Detalle del bloqueo (opcional)" value={form.description ?? ""} onChangeText={(v) => set("description", v)} />
        <ActionFeedback action={action} />
        <Button title="Crear bloqueo" disabled={action.busy} onPress={() => void create()} />
      </View>
    </FormScope>
  );
}
