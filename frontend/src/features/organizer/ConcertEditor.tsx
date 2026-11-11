import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { Artist, ArtistProposal, Concert, StaffMember, TicketType } from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  DateTimeField,
  Field,
  FormScope,
  Page,
  ResourceState,
  SectionHeader,
  SegmentedTabs,
  colors,
  dateLabel,
  money,
  statusLabel,
  styles,
  useAction,
  useBento,
  useDebouncedValue,
  useForm,
} from "../../components/ui";
import { Select } from "../../components/ui/Select";

const iso = (value: string) => {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error(
      "Elegí una fecha y un horario válidos desde el calendario.",
    );
  return date.toISOString();
};

const location = (form: Record<string, string>) => {
  const linked = Boolean(form.venue_id || form.reservation_id);
  const value = (key: string) => form[key]?.trim() || (linked ? undefined : null);
  return { venue_name: value("venue_name"), address_line: value("address_line"), city_id: value("city_id") };
};

type Billed = { id: string; name: string };

// Published artist profiles performing (GET /artists lists only published ones), in billing order: the first is the headliner.
function ArtistPicker({ values, onChange }: { values: Billed[]; onChange(values: Billed[]): void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const results = useResource<Artist[]>(open ? `/artists${query({ q: debouncedSearch.trim(), limit: 10 })}` : null);
  const up = (index: number) => {
    const next = [...values];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };
  return (
    <Card variant="subtle">
      <Copy strong>Perfiles de artista en el cartel</Copy>
      <Copy muted>
        {values.length
          ? "El primero es el artista principal. Solo se vinculan perfiles publicados (máximo 20)."
          : "Sin perfiles vinculados: el concierto muestra el texto de Artista."}
      </Copy>
      {values.map((artist, index) => (
        <View key={artist.id} style={styles.row}>
          <Copy strong>{index + 1}. {artist.name}</Copy>
          {index > 0 && <Button title={`Subir ${artist.name}`} secondary onPress={() => up(index)} />}
          <Button title={`Quitar ${artist.name}`} secondary danger onPress={() => onChange(values.filter((a) => a.id !== artist.id))} />
        </View>
      ))}
      <Button title={open ? "Cerrar búsqueda de artistas" : "Agregar perfil de artista"} secondary onPress={() => setOpen(!open)} />
      {open && (
        <View style={{ gap: 10 }}>
          <Field label="Buscar perfil de artista" value={search} onChangeText={setSearch} />
          <ResourceState {...results} empty={results.result?.data.length === 0} retry={() => void results.reload()} />
          <View style={styles.row}>
            {results.result?.data.filter((artist) => !values.some((value) => value.id === artist.id)).map((artist) => (
              <Button key={artist.id} title={`Agregar ${artist.stage_name}${artist.city_name ? ` (${artist.city_name})` : ""}`} secondary
                disabled={values.length >= 20} onPress={() => onChange([...values, { id: artist.id, name: artist.stage_name }])} />
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

export default function ConcertEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id && id !== "new");
  const { mobile } = useBento();
  const resource = useResource<Concert>(editing ? `/concerts/${id}` : null);
  const action = useAction();
  const validation = useForm();
  const [tab, setTab] = useState<"all" | "details" | "tickets" | "staff" | "artists">("all");
  const [form, setForm] = useState<Record<string, string>>({});
  const [genres, setGenres] = useState<string[]>([]);
  const [artists, setArtists] = useState<Billed[]>([]);
  const [artistsChanged, setArtistsChanged] = useState(false);
  const [confirm, setConfirm] = useState("");
  const concert = resource.result?.data;
  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (concert) {
      setForm({
        name: concert.name,
        description: concert.description ?? "",
        image_url: concert.image_url ?? "",
        start_datetime: concert.start_datetime,
        end_datetime: concert.end_datetime ?? "",
        artist_name: concert.artist_name,
        venue_id: concert.venue_id ?? "",
        reservation_id: concert.reservation_id ?? "",
        venue_name: concert.venue_name ?? "",
        address_line: concert.address_line ?? "",
        city_id: concert.city_id ?? "",
      });
      setGenres(concert.genres.map((g) => g.id));
      setArtists(concert.artists.flatMap((a) => (a.id ? [{ id: a.id, name: a.name }] : [])));
      setArtistsChanged(false);
    }
  }, [concert]);
  const save = () =>
    action.run(async () => {
      validation.assertValid();
      const startIso = iso(form.start_datetime ?? "");
      const endIso = iso(form.end_datetime ?? "");
      if (startIso && endIso && Date.parse(endIso) <= Date.parse(startIso)) {
        throw new Error("La fecha y hora de finalización debe ser posterior al inicio del concierto.");
      }
      const body = {
        name: form.name ?? "",
        description: form.description || null,
        image_url: form.image_url || null,
        start_datetime: startIso,
        end_datetime: endIso,
        artist_name: form.artist_name ?? "",
        venue_id: form.reservation_id ? undefined : form.venue_id || null,
        reservation_id: form.reservation_id || null,
        ...location(form),
        genre_ids: genres,
        ...(artistsChanged ? { artist_profile_ids: artists.map((a) => a.id) } : {}),
      };
      const { data } = await api.request<Concert>(
        editing ? `/concerts/${id}/update` : "/concerts/create",
        { method: "POST", body },
      );
      if (!editing) router.replace(`/organizer/${data.id}`);
      else {
        await resource.reload();
        action.setMessage("Concierto guardado.");
      }
    });
  const transition = (operation: string) =>
    action.run(async () => {
      await api.request(
        operation === "delete" ? `/concerts/${id}/delete` : `/concerts/${id}/${operation}`,
        {
          method: "POST",
          body: {},
        },
      );
      setConfirm("");
      if (operation === "delete") router.replace("/organizer");
      else {
        await resource.reload();
        action.setMessage("Estado actualizado.");
      }
    });
  const mutable = !concert || ["DRAFT", "PUBLISHED"].includes(concert.status);

  const statusCard = concert ? (
    <Card variant="subtle">
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <Copy strong>
          {concert.name} · Estado: {statusLabel(concert.status)}
        </Copy>
        {concert.status === "DRAFT" && (
          <View style={{ width: "100%", paddingVertical: 4 }}>
            <Copy muted size="small">
              {concert.reservation_id
                ? "✓ Reserva vinculada. Podés publicar el concierto cuando la reserva esté confirmada y cuentes con al menos un tipo de entrada configurado."
                : "💡 Podés guardar y gestionar este concierto como borrador sin reserva. Para publicarlo se requiere una reserva confirmada."}
            </Copy>
          </View>
        )}
        <View style={styles.row}>
          {concert.status === "DRAFT" && (
            <Button
              title="Publicar concierto"
              disabled={action.busy}
              onPress={() => void transition("publish")}
            />
          )}
          {mutable && (
            <Button
              title={
                confirm === "cancel"
                  ? "Confirmar cancelación"
                  : "Cancelar concierto"
              }
              secondary
              danger
              disabled={action.busy}
              onPress={() =>
                confirm === "cancel"
                  ? void transition("cancel")
                  : setConfirm("cancel")
              }
            />
          )}
          {concert.status === "DRAFT" && (
            <Button
              title={
                confirm === "delete"
                  ? "Confirmar eliminación"
                  : "Eliminar borrador"
              }
              secondary
              danger
              disabled={action.busy}
              onPress={() =>
                confirm === "delete"
                  ? void transition("delete")
                  : setConfirm("delete")
              }
            />
          )}
        </View>
      </View>
    </Card>
  ) : null;

  const detailsCard = mutable ? (
    <Card variant="featured">
      <FormScope form={validation}>
        <SectionHeader title="Datos principales del show" />
        <Field
          label="Nombre del concierto"
          required
          value={form.name ?? ""}
          onChangeText={(v) => set("name", v)}
        />
        <Field
          label="Descripción"
          multiline
          value={form.description ?? ""}
          onChangeText={(v) => set("description", v)}
        />
        <Field
          label="URL de imagen"
          value={form.image_url ?? ""}
          onChangeText={(v) => set("image_url", v)}
        />
        <View style={[styles.row, { flexWrap: "wrap", alignItems: "stretch" }]}>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: mobile ? "100%" : 260 }}>
            <DateTimeField
              label="Fecha y hora de inicio"
              mode="datetime"
              required
              value={form.start_datetime ?? ""}
              onChange={(v) => set("start_datetime", v)}
            />
          </View>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: mobile ? "100%" : 260 }}>
            <DateTimeField
              label="Fecha y hora de fin (opcional)"
              mode="datetime"
              value={form.end_datetime ?? ""}
              onChange={(v) => set("end_datetime", v)}
            />
          </View>
        </View>
        <Field
          label="Artista (texto del cartel)"
          required
          value={form.artist_name ?? ""}
          onChangeText={(v) => set("artist_name", v)}
        />
        <ArtistPicker values={artists} onChange={(next) => { setArtists(next); setArtistsChanged(true); }} />
        <Select
          label="Reserva confirmada (opcional)"
          path="/marketplace/reservations?status=CONFIRMED"
          searchable={false}
          itemLabel={(item) => `${String(item.event_name)} · ${String(item.venue_name)} · ${String(item.public_code)}`}
          values={form.reservation_id ? [form.reservation_id] : []}
          onChange={(v) => setForm((current) => ({ ...current, reservation_id: v[0] ?? "", venue_id: "", venue_name: "", address_line: "", city_id: "" }))}
        />
        {!form.reservation_id && (
          <Select
            label="Espacio del marketplace (opcional)"
            path="/venues"
            values={form.venue_id ? [form.venue_id] : []}
            onChange={(v) => setForm((current) => ({ ...current, venue_id: v[0] ?? "", venue_name: "", address_line: "", city_id: "" }))}
          />
        )}
        {form.venue_id && !form.reservation_id && (
          <Copy muted>Para publicar en un espacio del marketplace hace falta una reserva confirmada que cubra la fecha: elegila arriba.</Copy>
        )}
        <View style={styles.row}>
          <Field
            label="Lugar"
            placeholder={form.venue_id || form.reservation_id ? "Se toma del espacio si lo dejás vacío" : "Nombre de la sala o predio"}
            value={form.venue_name ?? ""}
            onChangeText={(v) => set("venue_name", v)}
          />
          <Field
            label="Dirección (opcional)"
            value={form.address_line ?? ""}
            onChangeText={(v) => set("address_line", v)}
          />
        </View>
        <View style={styles.row}>
          <Select
            label="Ciudad"
            path="/cities"
            values={form.city_id ? [form.city_id] : []}
            onChange={(v) => set("city_id", v[0] ?? "")}
          />
          <Select
            label="Géneros"
            path="/genres"
            multiple
            values={genres}
            onChange={setGenres}
          />
        </View>
        <Button
          title="Guardar concierto"
          disabled={action.busy}
          onPress={() => void save()}
        />
      </FormScope>
    </Card>
  ) : null;

  const ticketsSection = concert ? (
    <View style={{ gap: 14 }}>
      <SectionHeader title="Tipos de entrada" subtitle="Cupos, precios y ventanas de venta" />
      {concert.ticket_types.map((type) => (
        <TicketEditor
          key={type.id}
          concertId={concert.id}
          ticket={type}
          mutable={mutable}
          reload={resource.reload}
        />
      ))}
      {mutable && (
        <TicketEditor concertId={concert.id} reload={resource.reload} />
      )}
    </View>
  ) : null;

  const staffSection = concert ? (
    <StaffPanel concertId={concert.id} mutable={mutable} />
  ) : null;

  const hiringSection = concert ? (
    <OrganizerArtistHiringPanel concert={concert} />
  ) : null;

  return (
    <Page
      eyebrow="VENTI · PRODUCCIÓN DE CONCIERTO"
      title={editing ? "Gestionar concierto" : "Nuevo concierto"}
      subtitle="Guardá el borrador, contratá artistas, vinculá el espacio y publicá las entradas."
      actions={
        <>
          <Button title="Presupuestos de espacios" secondary onPress={() => router.push("/marketplace/quotes")} />
          <Button title="Cotizaciones técnicas" secondary onPress={() => router.push("/services/quotes")} />
          <Button title="Mis conciertos" secondary onPress={() => router.push("/organizer")} />
        </>
      }
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {concert && (
        <SegmentedTabs
          value={tab}
          onChange={(v) => setTab(v)}
          tabs={[
            { id: "all", label: "Todas las secciones" },
            { id: "details", label: "Detalles del show" },
            { id: "tickets", label: "Entradas y precios", badge: concert.ticket_types.length },
            { id: "staff", label: "Equipo de puerta" },
            { id: "artists", label: "Contratación de artistas" },
          ]}
        />
      )}
      {(!editing || concert) && (
        tab === "all" ? (
          <BentoGrid style={{ alignItems: "flex-start" }}>
            <View
              style={{
                flexGrow: 2,
                flexShrink: 1,
                minWidth: 0,
                flexBasis: mobile ? "auto" : 520,
                width: mobile ? "100%" : undefined,
                maxWidth: "100%",
                gap: 16,
              }}
            >
              {statusCard}
              {detailsCard}
              {hiringSection}
            </View>

            {concert && (
              <View
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  minWidth: 0,
                  flexBasis: mobile ? "auto" : 380,
                  width: mobile ? "100%" : undefined,
                  maxWidth: "100%",
                  gap: 14,
                }}
              >
                {ticketsSection}
                {staffSection}
              </View>
            )}
          </BentoGrid>
        ) : (
          <View style={{ gap: 16, width: "100%", maxWidth: 880 }}>
            {statusCard}
            {tab === "details" && detailsCard}
            {tab === "tickets" && ticketsSection}
            {tab === "staff" && staffSection}
            {tab === "artists" && hiringSection}
          </View>
        )
      )}
    </Page>
  );
}

function OrganizerArtistHiringPanel({ concert }: { concert: Concert }) {
  const proposals = useResource<ArtistProposal[]>(`/proposals${query({ flow_type: "ORGANIZER_TO_ARTIST" })}`);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const artists = useResource<Artist[]>(open ? `/artists${query({ q: debouncedSearch.trim(), limit: 10 })}` : null);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");
  const action = useAction();
  const validation = useForm();

  const concertProposals = (proposals.result?.data ?? []).filter(
    (p) => String(p.concert_id ?? "") === String(concert.id) || p.event_title === concert.name,
  );

  const sendHiring = () =>
    action.run(async () => {
      validation.assertValid();
      if (!selectedArtist) throw new Error("Elegí un artista del catálogo.");
      const numBudget = budget.trim() ? Number(budget.trim()) : null;
      if (numBudget !== null && (!Number.isFinite(numBudget) || numBudget < 0)) {
        throw new Error("El cachet ofrecido debe ser un monto válido.");
      }
      await api.request("/proposals/create", {
        method: "POST",
        body: {
          flow_type: "ORGANIZER_TO_ARTIST",
          artist_profile_id: selectedArtist.id,
          concert_id: concert.id,
          venue_id: concert.venue_id ?? null,
          event_title: concert.name,
          proposed_date: concert.start_datetime,
          offered_amount: numBudget,
          message: message.trim() || null,
        },
      });
      setSelectedArtist(null);
      setBudget("");
      setMessage("");
      setOpen(false);
      await proposals.reload();
      action.setMessage("Propuesta de contratación enviada al artista.");
    });

  return (
    <Card>
      <SectionHeader
        title="Contratación de Artistas"
        subtitle="Enviá propuestas formales a los artistas para integrar este show y seguí su estado."
        action={
          <Button
            title={open ? "Cerrar nueva propuesta" : "Contratar artista"}
            secondary
            onPress={() => setOpen(!open)}
          />
        }
      />
      <ActionFeedback action={action} />
      {open && (
        <View style={{ gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.border }}>
          <Field
            label="Buscar artista publicado"
            value={search}
            onChangeText={setSearch}
            placeholder="Ej. Marea Suburbana, Atlántico..."
          />
          <ResourceState {...artists} empty={artists.result?.data.length === 0} retry={() => void artists.reload()} />
          <View style={styles.row}>
            {artists.result?.data.map((artist) => (
              <Button
                key={artist.id}
                title={`${selectedArtist?.id === artist.id ? "✓ " : ""}${artist.stage_name}`}
                secondary={selectedArtist?.id !== artist.id}
                onPress={() => setSelectedArtist(artist)}
              />
            ))}
          </View>
          {selectedArtist && (
            <FormScope form={validation}>
              <Copy strong>Propuesta para {selectedArtist.stage_name}</Copy>
              <Field
                label="Cachet / Presupuesto ofrecido (ARS, opcional)"
                keyboardType="decimal-pad"
                value={budget}
                onChangeText={setBudget}
                placeholder="1200000"
              />
              <Field
                label="Mensaje y condiciones para el artista"
                multiline
                value={message}
                onChangeText={setMessage}
                placeholder="Detallá horario de prueba de sonido, duración del set y condiciones..."
              />
              <Button
                title={`Enviar contratación a ${selectedArtist.stage_name}`}
                disabled={action.busy}
                onPress={() => void sendHiring()}
              />
            </FormScope>
          )}
        </View>
      )}

      {!concertProposals.length ? (
        <Copy muted>Todavía no enviaste propuestas formales de contratación para este concierto.</Copy>
      ) : (
        concertProposals.map((item) => (
          <View
            key={item.id}
            style={{
              gap: 4,
              paddingTop: 10,
              borderTopWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Copy strong>
              {item.artist_name} · {statusLabel(item.status)}
            </Copy>
            <Copy muted>
              {item.proposed_date ? `${dateLabel(item.proposed_date)} · ` : ""}
              {item.offered_amount != null ? `Cachet: ${money(item.offered_amount)}` : "Monto a convenir"}
            </Copy>
            {item.message && <Copy>{item.message}</Copy>}
            {item.rejection_reason && <Copy muted>Respuesta del artista: {item.rejection_reason}</Copy>}
          </View>
        ))
      )}
    </Card>
  );
}

function TicketEditor({
  concertId,
  ticket,
  mutable = true,
  reload,
}: {
  concertId: string;
  ticket?: TicketType;
  mutable?: boolean;
  reload(): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    name: ticket?.name ?? "",
    price: ticket?.price ?? "",
    stock_total: String(ticket?.stock_total ?? ""),
    sale_start: ticket?.sale_start ?? "",
    sale_end: ticket?.sale_end ?? "",
    max_per_purchase: String(ticket?.max_per_purchase ?? ""),
  });
  useEffect(() => {
    if (!ticket) return;
    setForm({
      name: ticket.name ?? "",
      price: ticket.price ?? "",
      stock_total: String(ticket.stock_total ?? ""),
      sale_start: ticket.sale_start ?? "",
      sale_end: ticket.sale_end ?? "",
      max_per_purchase: String(ticket.max_per_purchase ?? ""),
    });
  }, [ticket]);
  const action = useAction();
  const validation = useForm();
  const set = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <Card>
      <Copy strong>
        {ticket
          ? `${ticket.name} · $ ${ticket.price} · Cupo ${ticket.stock_total}`
          : "Nuevo tipo de entrada"}
      </Copy>
      {mutable && (
        <Button
          title={
            open
              ? "Cerrar formulario"
              : ticket
                ? `Editar ${ticket.name}`
                : "Agregar tipo de entrada"
          }
          secondary
          onPress={() => setOpen(!open)}
        />
      )}
      <ActionFeedback action={action} />
      {open && (
        <FormScope form={validation}>
          <View style={{ gap: 10, paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }}>
            {[
              ["name", "Nombre de entrada"],
              ["price", "Precio"],
              ["stock_total", "Cupo total"],
            ].map(([key, label]) => (
              <Field
                key={key}
                label={label}
                required
                value={form[key]}
                onChangeText={(v) => set(key, v)}
              />
            ))}
            <DateTimeField
              label="Venta desde (opcional)"
              mode="datetime"
              value={form.sale_start}
              onChange={(v) => set("sale_start", v)}
            />
            <DateTimeField
              label="Venta hasta (opcional)"
              mode="datetime"
              value={form.sale_end}
              onChange={(v) => set("sale_end", v)}
            />
            <Field
              label="Máximo por compra (opcional)"
              value={form.max_per_purchase}
              onChangeText={(v) => set("max_per_purchase", v)}
            />
            <View style={styles.row}>
              <Button
                title="Guardar tipo de entrada"
                disabled={action.busy}
                onPress={() =>
                  void action.run(async () => {
                    validation.assertValid();
                    if (form.price.trim() === "" || form.stock_total.trim() === "")
                      throw new Error("Completá precio y cupo.");
                    const saleStartIso = iso(form.sale_start);
                    const saleEndIso = iso(form.sale_end);
                    if (saleStartIso && saleEndIso && Date.parse(saleEndIso) <= Date.parse(saleStartIso)) {
                      throw new Error("El cierre de venta debe ser posterior al inicio de venta.");
                    }
                    await api.request(
                      ticket
                        ? `/ticket-types/${ticket.id}/update`
                        : `/concerts/${concertId}/ticket-types/create`,
                      {
                        method: "POST",
                        body: {
                          name: form.name,
                          price: Number(form.price),
                          stock_total: Number(form.stock_total),
                          sale_start: saleStartIso,
                          sale_end: saleEndIso,
                          max_per_purchase: form.max_per_purchase
                            ? Number(form.max_per_purchase)
                            : null,
                        },
                      },
                    );
                    setOpen(false);
                    await reload();
                    action.setMessage("Entrada guardada.");
                  })
                }
              />
              {ticket && (
                <Button
                  title={
                    confirm ? "Sí, eliminar entrada" : "Eliminar tipo de entrada"
                  }
                  danger
                  secondary
                  disabled={action.busy}
                  onPress={() =>
                    confirm
                      ? void action.run(async () => {
                          await api.request(`/ticket-types/${ticket.id}/delete`, {
                            method: "POST",
                          });
                          await reload();
                        })
                      : setConfirm(true)
                  }
                />
              )}
            </View>
          </View>
        </FormScope>
      )}
    </Card>
  );
}

// Staff validates tickets only for the concerts it is assigned to (concert_staff); assigning never grants a role.
function StaffPanel({ concertId, mutable }: { concertId: string; mutable: boolean }) {
  const staff = useResource<StaffMember[]>(`/concerts/${concertId}/staff`);
  const [email, setEmail] = useState("");
  const action = useAction();
  const validation = useForm();
  return (
    <Card>
      <SectionHeader title="Staff de control de acceso" />
      <ResourceState {...staff} retry={() => void staff.reload()} />
      {staff.result?.data.map((member) => (
        <View key={member.user_id} style={styles.row}>
          <Copy muted>
            {[member.first_name, member.last_name].filter(Boolean).join(" ") || member.email} · {member.email}
          </Copy>
          <Button
            title={`Quitar staff ${member.email}`}
            secondary
            danger
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                await api.request(`/concerts/${concertId}/staff/${member.user_id}/delete`, { method: "POST" });
                await staff.reload();
              })
            }
          />
        </View>
      ))}
      {staff.result?.data.length === 0 && <Copy muted>Sin staff asignado.</Copy>}
      {mutable && (
        <FormScope form={validation}>
          <Field label="Email del staff" required keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Button
            title="Asignar staff"
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                validation.assertValid();
                await api.request(`/concerts/${concertId}/staff/add`, { method: "POST", body: { email } });
                setEmail("");
                await staff.reload();
                action.setMessage("Staff asignado.");
              })
            }
          />
        </FormScope>
      )}
      <ActionFeedback action={action} />
    </Card>
  );
}
