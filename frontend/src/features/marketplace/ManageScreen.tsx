import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { Block, Establishment, MarketplaceCatalogs, Member, Named, Organization, Venue, VenueDetail } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, Notice, Page, ResourceState, styles, useAction } from "../../components/ui";
import { Codes, VenueCard } from "./MarketplaceScreen";
import { at, days, isDate, range } from "./time";

const text = (value?: string) => value?.trim() || null;
const number = (value?: string) => (value?.trim() ? Number(value) : null);
const roleNames = { OWNER: "Dueño", ADMIN: "Administrador", STAFF: "Staff" } as const;

export default function ManageScreen() {
  const organizations = useResource<Organization[]>("/marketplace/organizations/mine");
  const establishments = useResource<Establishment[]>("/marketplace/establishments/mine");
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [establishment, setEstablishment] = useState<Establishment | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, string>>({});
  const action = useAction();
  const createOrganization = () => action.run(async () => {
    await api.request("/marketplace/organizations", { method: "POST", body: { name: form.org_name ?? "", tax_id: text(form.tax_id) } });
    setForm({}); await organizations.reload(); action.setMessage("Organización creada.");
  });
  return (
    <Page title="Mis establecimientos" subtitle="Organizaciones, establecimientos, espacios y bloqueos de agenda.">
      <Button title="Volver al marketplace" secondary onPress={() => router.push("/marketplace")} />
      <Copy>Organizaciones</Copy>
      <ResourceState {...organizations} empty={organizations.result?.data.length === 0} retry={() => void organizations.reload()} />
      <View style={styles.row}>
        {organizations.result?.data.map((org) => (
          <Button key={org.id} title={`${organization?.id === org.id ? "✓ " : ""}${org.name} (${roleNames[org.member_role]})`}
            secondary={organization?.id !== org.id} onPress={() => setOrganization(organization?.id === org.id ? null : org)} />
        ))}
      </View>
      {organization && <MembersPanel organization={organization} />}
      <Card>
        <Copy>Nueva organización</Copy>
        <View style={styles.row}>
          <Field label="Nombre de la organización" value={form.org_name ?? ""} onChangeText={(v) => setForm({ ...form, org_name: v })} />
          <Field label="CUIT (opcional)" value={form.tax_id ?? ""} onChangeText={(v) => setForm({ ...form, tax_id: v })} />
        </View>
        <ActionFeedback action={action} />
        <Button title="Crear organización" disabled={action.busy} onPress={() => void createOrganization()} />
      </Card>
      <Copy>Establecimientos</Copy>
      <Button title="Nuevo establecimiento" onPress={() => setEstablishment(null)} />
      {establishment === null && (
        <EstablishmentForm organizations={organizations.result?.data ?? []} done={async () => { setEstablishment(undefined); await establishments.reload(); }} />
      )}
      <ResourceState {...establishments} empty={establishments.result?.data.length === 0} retry={() => void establishments.reload()} />
      {establishments.result?.data.map((item) => (
        <EstablishmentPanel key={`${item.id}-${item.status}`} establishment={item} organizations={organizations.result?.data ?? []}
          reload={establishments.reload} />
      ))}
    </Page>
  );
}

// Also used by service companies: same organization_members rules, another endpoint and another required profile.
// `admin` is the platform override (marketplace.admin / services.admin) for someone who is not a member.
export function MembersPanel({ organization, path = `/marketplace/organizations/${organization.id}/members`, profile = "VENUE", admin = false }: {
  organization: Pick<Organization, "id" | "name"> & { member_role?: Organization["member_role"] | null };
  path?: string; profile?: string; admin?: boolean;
}) {
  const { user } = useAuth();
  const members = useResource<Member[]>(path);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["member_role"]>("STAFF");
  const action = useAction();
  const run = (work: () => Promise<unknown>, message: string) => action.run(async () => { await work(); await members.reload(); action.setMessage(message); });
  const manage = admin || ["OWNER", "ADMIN"].includes(organization.member_role ?? "");
  return (
    <Card>
      <Copy>Miembros de {organization.name}</Copy>
      <ResourceState {...members} retry={() => void members.reload()} />
      {members.result?.data.map((member) => (
        <View key={member.user_id} style={{ gap: 6 }}>
          <Copy muted>{[member.first_name, member.last_name].filter(Boolean).join(" ") || member.email} · {member.email} · {roleNames[member.member_role]}</Copy>
          {manage && (
            <View style={styles.row}>
              {(Object.keys(roleNames) as Member["member_role"][]).filter((r) => r !== member.member_role).map((next) => (
                <Button key={next} title={`Hacer ${roleNames[next]}: ${member.email}`} secondary disabled={action.busy}
                  onPress={() => void run(() => api.request(`${path}/${member.user_id}`, { method: "PATCH", body: { member_role: next } }), "Rol actualizado.")} />
              ))}
            </View>
          )}
          {(manage || member.user_id === user?.id) && (
            <Button title={member.user_id === user?.id ? "Salir de la organización" : `Quitar a ${member.email}`} secondary danger disabled={action.busy}
              onPress={() => void run(() => api.request(`${path}/${member.user_id}`, { method: "DELETE" }), "Miembro quitado.")} />
          )}
        </View>
      ))}
      {manage && (
        <>
          <Field label={`Email del miembro (cuenta con perfil ${profile})`} keyboardType="email-address" value={email} onChangeText={setEmail} />
          <View style={styles.row}>
            {(Object.keys(roleNames) as Member["member_role"][]).map((value) => (
              <Button key={value} title={`${role === value ? "✓ " : ""}${roleNames[value]}`} secondary={role !== value} onPress={() => setRole(value)} />
            ))}
          </View>
          <Button title="Agregar miembro" disabled={action.busy}
            onPress={() => void run(async () => { await api.request(path, { method: "POST", body: { email, member_role: role } }); setEmail(""); }, "Miembro agregado.")} />
        </>
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
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  const save = () => action.run(async () => {
    const body = { city_id: form.city_id, name: form.name, address_line: form.address_line, description: text(form.description),
      postal_code: text(form.postal_code), phone: text(form.phone), email: text(form.email), website: text(form.website) };
    await api.request(establishment ? `/marketplace/establishments/${establishment.id}` : "/marketplace/establishments", {
      method: establishment ? "PATCH" : "POST", body: establishment ? body : { ...body, organization_id: form.organization_id },
    });
    await done();
  });
  return (
    <Card>
      <Copy>{establishment ? `Editar ${establishment.name}` : "Nuevo establecimiento"}</Copy>
      {!establishment && (
        <Codes label="Organización" items={organizations.filter((o) => o.member_role !== "STAFF")}
          values={form.organization_id ? [form.organization_id] : []} onChange={(v) => set("organization_id", v[0] ?? "")} />
      )}
      <Codes label="Ciudad" items={cities.result?.data} values={form.city_id ? [form.city_id] : []} onChange={(v) => set("city_id", v[0] ?? "")} />
      {([["name", "Nombre del establecimiento"], ["address_line", "Dirección"], ["description", "Descripción (opcional)"], ["postal_code", "Código postal (opcional)"],
        ["phone", "Teléfono (opcional)"], ["email", "Email de contacto (opcional)"], ["website", "Sitio web (opcional)"]] as const).map(([key, label]) => (
        <Field key={key} label={label} value={form[key] ?? ""} onChangeText={(v) => set(key, v)} />
      ))}
      <ActionFeedback action={action} />
      <View style={styles.row}>
        <Button title="Guardar establecimiento" disabled={action.busy} onPress={() => void save()} />
        <Button title="Cerrar formulario" secondary onPress={() => void done()} />
      </View>
    </Card>
  );
}

// Publishing is a request: the owner sends the establishment to review and an ADMIN (marketplace.admin) publishes it.
function EstablishmentPanel({ establishment, organizations, reload }: { establishment: Establishment; organizations: Organization[]; reload(): Promise<void> }) {
  const [open, setOpen] = useState<"" | "edit" | "venues" | "blocks">("");
  const reviewer = useAuth().can("marketplace.admin");
  const action = useAction();
  const status = (next: "publish" | "archive") => action.run(async () => {
    await api.request(`/marketplace/establishments/${establishment.id}/${next}`, { method: "POST", body: {} }); await reload();
  });
  return (
    <Card>
      <Copy>{establishment.name} · {establishment.status}</Copy>
      <Copy muted>{establishment.address_line} · {establishment.venues} espacio(s)</Copy>
      {establishment.status === "PENDING_REVIEW" && (
        <Notice tone="info" message="En revisión: aparece en las búsquedas cuando un administrador de Venti lo aprueba." />
      )}
      {establishment.status === "DRAFT" && establishment.review_note && (
        <Notice tone="warning" message={`Revisión rechazada: ${establishment.review_note}`} />
      )}
      <View style={styles.row}>
        {(["edit", "venues", "blocks"] as const).map((panel) => (
          <Button key={panel} title={`${{ edit: "Editar", venues: "Espacios", blocks: "Bloqueos" }[panel]} de ${establishment.name}`}
            secondary={open !== panel} onPress={() => setOpen(open === panel ? "" : panel)} />
        ))}
        {establishment.status !== "PUBLISHED" && (reviewer || establishment.status !== "PENDING_REVIEW") && (
          <Button title={`${reviewer ? "Publicar" : "Enviar a revisión"} ${establishment.name}`} disabled={action.busy} onPress={() => void status("publish")} />
        )}
        {["PUBLISHED", "PENDING_REVIEW"].includes(establishment.status) && (
          <Button title={`Archivar ${establishment.name}`} secondary danger disabled={action.busy} onPress={() => void status("archive")} />
        )}
      </View>
      <ActionFeedback action={action} />
      {open === "edit" && <EstablishmentForm establishment={establishment} organizations={organizations} done={async () => { setOpen(""); await reload(); }} />}
      {open === "venues" && <VenuesPanel establishment={establishment} />}
      {open === "blocks" && <BlocksPanel establishment={establishment} />}
    </Card>
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
    <View style={{ gap: 10 }}>
      <Button title={`Nuevo espacio en ${establishment.name}`} onPress={() => setEditing(null)} />
      {editing !== undefined && (
        <VenueForm key={editing ?? "new"} establishmentId={establishment.id} venueId={editing} done={async () => { setEditing(undefined); await venues.reload(); }} />
      )}
      <ActionFeedback action={action} />
      <ResourceState {...venues} empty={venues.result?.data.length === 0} retry={() => void venues.reload()} />
      {venues.result?.data.map((venue) => (
        <View key={venue.id} style={{ gap: 6 }}>
          <VenueCard venue={venue} manage />
          <View style={styles.row}>
            <Button title={`Editar espacio ${venue.name}`} secondary onPress={() => setEditing(venue.id)} />
            {venue.status !== "PUBLISHED"
              ? <Button title={`Publicar espacio ${venue.name}`} disabled={action.busy} onPress={() => void status(venue, "publish")} />
              : <Button title={`Archivar espacio ${venue.name}`} secondary danger disabled={action.busy} onPress={() => void status(venue, "archive")} />}
          </View>
        </View>
      ))}
    </View>
  );
}

// Opening hours as one line per range: "1 10:00-23:00" (1 = lunes ... 7 = domingo).
const parseHours = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
  const match = /^([1-7])\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(line);
  if (!match) throw new Error(`Horario inválido: "${line}". Usá "1 10:00-23:00".`);
  return { day_of_week: Number(match[1]), opens_at: match[2], closes_at: match[3] };
});
function VenueForm({ establishmentId, venueId, done }: { establishmentId: string; venueId: string | null; done(): Promise<void> }) {
  const catalogs = useResource<MarketplaceCatalogs>("/marketplace/catalogs");
  const current = useResource<VenueDetail>(venueId ? `/marketplace/venues/${venueId}` : null);
  const [form, setForm] = useState<Record<string, string>>({ min_booking_minutes: "60", hold_minutes: "30" });
  const [type, setType] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const action = useAction();
  const venue = current.result?.data;
  useEffect(() => {
    if (!venue) return;
    setForm({
      name: venue.name, description: venue.description ?? "", capacity_standing: String(venue.capacity_standing ?? ""),
      capacity_seated: String(venue.capacity_seated ?? ""), area_m2: venue.area_m2 ?? "", price_per_hour: venue.price_per_hour,
      min_booking_minutes: String(venue.min_booking_minutes), hold_minutes: String(venue.hold_minutes),
      photos: venue.photos.map((photo) => photo.url).join("\n"),
      hours: venue.opening_hours.map((h) => `${h.day_of_week} ${h.opens_at}-${h.closes_at}`).join("\n"),
    });
    setType([venue.venue_type]);
    setAmenities(venue.amenities.map((a) => a.code));
  }, [venue]);
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  const save = () => action.run(async () => {
    if (!type[0]) throw new Error("Elegí el tipo de espacio.");
    const photos = (form.photos ?? "").split("\n").map((url) => url.trim()).filter(Boolean).map((url, index) => ({ url, is_cover: index === 0 }));
    const body = {
      venue_type_code: type[0], name: form.name ?? "", description: text(form.description),
      capacity_standing: number(form.capacity_standing), capacity_seated: number(form.capacity_seated), area_m2: number(form.area_m2),
      price_per_hour: Number(form.price_per_hour || 0), min_booking_minutes: Number(form.min_booking_minutes || 60), hold_minutes: Number(form.hold_minutes || 30),
      amenities, photos, opening_hours: parseHours(form.hours ?? ""),
    };
    await api.request(venueId ? `/marketplace/venues/${venueId}` : `/marketplace/establishments/${establishmentId}/venues`, {
      method: venueId ? "PATCH" : "POST", body,
    });
    await done();
  });
  return (
    <Card>
      <Copy>{venueId ? `Editar ${venue?.name ?? "espacio"}` : "Nuevo espacio"}</Copy>
      <ResourceState {...current} retry={() => void current.reload()} />
      <Codes label="Tipo de espacio" items={catalogs.result?.data.venue_types} values={type} onChange={setType} />
      {([["name", "Nombre del espacio"], ["description", "Descripción (opcional)"], ["price_per_hour", "Precio por hora"],
        ["capacity_standing", "Capacidad de pie (opcional)"], ["capacity_seated", "Capacidad sentados (opcional)"], ["area_m2", "Superficie m² (opcional)"],
        ["min_booking_minutes", "Reserva mínima (minutos)"], ["hold_minutes", "Duración de la reserva temporal (minutos)"]] as const).map(([key, label]) => (
        <Field key={key} label={label} value={form[key] ?? ""} onChangeText={(v) => set(key, v)} />
      ))}
      <Codes label="Comodidades" multiple items={catalogs.result?.data.amenities} values={amenities} onChange={setAmenities} />
      <Field label="Fotos (una URL por línea, la primera es la portada)" multiline value={form.photos ?? ""} onChangeText={(v) => set("photos", v)} />
      <Field label={`Horarios (una línea por franja, ej. "1 10:00-23:00"; ${days.slice(1).map((d, i) => `${i + 1}=${d}`).join(", ")})`} multiline
        value={form.hours ?? ""} onChangeText={(v) => set("hours", v)} />
      <ActionFeedback action={action} />
      <View style={styles.row}>
        <Button title="Guardar espacio" disabled={action.busy} onPress={() => void save()} />
        <Button title="Cerrar formulario de espacio" secondary onPress={() => void done()} />
      </View>
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
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  const create = () => action.run(async () => {
    if (!isDate(form.date ?? "")) throw new Error("Ingresá la fecha como AAAA-MM-DD.");
    const starts = at(form.date, form.from ?? ""), ends = at(form.date, form.to ?? "");
    if (ends <= starts) ends.setTime(ends.getTime() + 86400000);
    await api.request(`/marketplace/establishments/${establishment.id}/blocks`, { method: "POST", body: {
      venue_id: venue[0] ?? null, reason: reason[0] ?? "OTHER", description: text(form.description), starts_at: starts.toISOString(), ends_at: ends.toISOString(),
    } });
    setForm({}); await blocks.reload(); action.setMessage("Bloqueo creado.");
  });
  const name = (id: string | null) => (id ? venues.result?.data.find((v) => v.id === id)?.name ?? `Espacio #${id}` : "Todo el establecimiento");
  return (
    <View style={{ gap: 10 }}>
      <ResourceState {...blocks} empty={blocks.result?.data.length === 0} retry={() => void blocks.reload()} />
      {blocks.result?.data.map((block) => (
        <View key={block.id} style={styles.row}>
          <Copy muted>{range(block.starts_at, block.ends_at)} · {name(block.venue_id)} · {block.reason}{block.description ? ` · ${block.description}` : ""}</Copy>
          <Button title={`Quitar bloqueo ${block.id}`} secondary danger disabled={action.busy}
            onPress={() => void action.run(async () => { await api.request(`/marketplace/blocks/${block.id}`, { method: "DELETE" }); await blocks.reload(); })} />
        </View>
      ))}
      <Codes label="Espacio bloqueado (sin elegir: todo el establecimiento)" items={venues.result?.data} values={venue} onChange={setVenue} />
      <Codes label="Motivo" items={reasons.map(([code, label]) => ({ id: code, code, name: label }))} values={reason} onChange={setReason} />
      <View style={styles.row}>
        <Field label="Fecha del bloqueo (AAAA-MM-DD)" value={form.date ?? ""} onChangeText={(v) => set("date", v)} />
        <Field label="Bloqueo desde (HH:MM)" value={form.from ?? ""} onChangeText={(v) => set("from", v)} />
        <Field label="Bloqueo hasta (HH:MM)" value={form.to ?? ""} onChangeText={(v) => set("to", v)} />
      </View>
      <Field label="Detalle del bloqueo (opcional)" value={form.description ?? ""} onChangeText={(v) => set("description", v)} />
      <ActionFeedback action={action} />
      <Button title="Crear bloqueo" disabled={action.busy} onPress={() => void create()} />
    </View>
  );
}
