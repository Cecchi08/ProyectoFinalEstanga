import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { PricingUnit, PublicationStatus, ServiceAvailability, ServiceCategory, ServiceOffering, ServiceProvider, ServiceQuote } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, Notice, Page, Pager, ResourceState, money, styles, useAction } from "../../components/ui";
import { Select } from "../../components/ui/Select";
import { Codes } from "../marketplace/MarketplaceScreen";
import { isDate, range, slot } from "../marketplace/time";

export const PRICING: Record<PricingUnit, string> = { HOUR: "por hora", DAY: "por día", EVENT: "por evento", UNIT: "por unidad", QUOTE: "a cotizar" };
export const PUBLICATION: Record<PublicationStatus, string> = { DRAFT: "Borrador", PUBLISHED: "Publicado", ARCHIVED: "Archivado" };
// A QUOTE offering may still show a reference price.
export const priceLabel = (offering: Pick<ServiceOffering, "pricing_unit" | "base_price">) =>
  offering.base_price == null ? "Precio a cotizar"
    : offering.pricing_unit === "QUOTE" ? `Desde ${money(offering.base_price)}, a cotizar` : `${money(offering.base_price)} ${PRICING[offering.pricing_unit]}`;
const PRICE = /^\d+(\.\d{1,2})?$/;

export function OfferingCard({ offering, manage = false }: { offering: ServiceOffering; manage?: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 300, maxWidth: 560 }}>
      <Card>
        <Copy muted>{offering.category_name}{manage ? ` · ${PUBLICATION[offering.status]}` : ""}</Copy>
        <Copy>{offering.name}</Copy>
        <Copy muted>
          {offering.provider_name}{offering.provider_verified ? " · ✓ verificada" : ""}
          {offering.city_name ? ` · ${offering.city_name}` : ""}
        </Copy>
        <Copy muted>{priceLabel(offering)}</Copy>
        <Button title={`Ver servicio ${offering.name}`} onPress={() => router.push(`/services/offerings/${offering.id}`)} />
      </Card>
    </View>
  );
}
export function ProviderCard({ provider }: { provider: ServiceProvider }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 300, maxWidth: 560 }}>
      <Card>
        <Copy>{provider.name}{provider.is_verified ? " · ✓ verificada" : ""}</Copy>
        <Copy muted>{[provider.city_name, provider.coverage_area].filter(Boolean).join(" · ") || "Zona a consultar"}</Copy>
        <Copy muted>
          {provider.published_offerings} {provider.published_offerings === 1 ? "servicio publicado" : "servicios publicados"}
          {provider.member_role ? ` · ${PUBLICATION[provider.status]} · sos ${provider.member_role}` : ""}
        </Copy>
        <Button title={`Ver empresa ${provider.name}`} onPress={() => router.push(`/services/providers/${provider.id}`)} />
      </Card>
    </View>
  );
}

// Public catalog: GET /services/offerings and /services/providers (published companies of active organizations).
export default function ServicesScreen() {
  const { can } = useAuth();
  const categories = useResource<ServiceCategory[]>("/services/categories");
  const [tab, setTab] = useState<"offerings" | "providers">("offerings");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState("");
  const [page, setPage] = useState(1);
  const params = query({ ...filters, ...(tab === "providers" ? { max_price: undefined } : { verified: undefined }), page, limit: 12 });
  const offerings = useResource<ServiceOffering[]>(tab === "offerings" ? `/services/offerings${params}` : null);
  const providers = useResource<ServiceProvider[]>(tab === "providers" ? `/services/providers${params}` : null);
  const resource = tab === "offerings" ? offerings : providers;
  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const apply = () => {
    const max = draft.max_price?.trim() ?? "";
    if (max && !PRICE.test(max)) return setInvalid("El precio máximo es un número con hasta dos decimales.");
    setInvalid(""); setFilters({ ...draft, q: draft.q?.trim() ?? "", max_price: max }); setPage(1);
  };
  return (
    <Page title="Servicios para eventos" subtitle="Sonido, iluminación, seguridad, limpieza y más. Pedí cotización a empresas de servicios.">
      <View style={styles.row}>
        {can("services.quotes.request", "services.quotes.respond", "services.admin") && (
          <Button title="Cotizaciones de servicios" secondary onPress={() => router.push("/services/quotes")} />
        )}
        {can("services.manage", "services.admin") && (
          <Button title="Mis empresas de servicios" secondary onPress={() => router.push("/services/mine")} />
        )}
      </View>
      <View style={styles.row}>
        {(["offerings", "providers"] as const).map((value) => (
          <Button key={value} title={value === "offerings" ? "Servicios" : "Empresas"} secondary={tab !== value}
            onPress={() => { setTab(value); setPage(1); }} />
        ))}
      </View>
      <Card>
        <Field label="Buscar" value={draft.q ?? ""} onChangeText={(v) => set("q", v)} onSubmitEditing={apply} />
        <Codes label="Categoría" items={categories.result?.data} values={draft.category ? [draft.category] : []}
          onChange={(v) => set("category", v[0] ?? "")} />
        <Select label="Ciudad" path="/cities" values={draft.city_id ? [draft.city_id] : []} onChange={(v) => set("city_id", v[0] ?? "")} />
        {tab === "offerings" ? (
          <Field label="Precio máximo (opcional)" keyboardType="decimal-pad" value={draft.max_price ?? ""} onChangeText={(v) => set("max_price", v)} />
        ) : (
          <Button title={`${draft.verified === "true" ? "✓ " : ""}Solo empresas verificadas`} secondary={draft.verified !== "true"}
            onPress={() => set("verified", draft.verified === "true" ? "" : "true")} />
        )}
        <Notice message={invalid} error />
        <View style={styles.row}>
          <Button title="Buscar servicios" onPress={apply} />
          <Button title="Limpiar filtros" secondary onPress={() => { setDraft({}); setFilters({}); setInvalid(""); setPage(1); }} />
        </View>
      </Card>
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      <View style={[styles.row, { alignItems: "stretch" }]}>
        {tab === "offerings"
          ? offerings.result?.data.map((offering) => <OfferingCard key={offering.id} offering={offering} />)
          : providers.result?.data.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
      </View>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}

// GET /services/offerings/:id; availability is informational (contracted windows) and the quote request is
// POST /services/quotes (services.quotes.request). A company cannot ask itself for a quote (422 OWN_PROVIDER).
export function OfferingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const resource = useResource<ServiceOffering>(`/services/offerings/${id}`);
  const offering = resource.result?.data;
  const [date, setDate] = useState("");
  const [availability, setAvailability] = useState<ServiceAvailability | null>(null);
  const check = useAction();
  const lookup = () => check.run(async () => {
    if (!isDate(date)) throw new Error("Ingresá la fecha como AAAA-MM-DD.");
    const { data } = await api.request<ServiceAvailability>(`/services/offerings/${id}/availability${query({ date: date.trim() })}`);
    setAvailability(data);
  });
  return (
    <Page title={offering?.name ?? "Servicio"}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {offering && (
        <>
          <Card>
            <Copy muted>{offering.category_name}{offering.status !== "PUBLISHED" ? ` · ${PUBLICATION[offering.status]}` : ""}</Copy>
            <Copy>{priceLabel(offering)}</Copy>
            {offering.description && <Copy>{offering.description}</Copy>}
            {offering.equipment && <Copy muted>Equipamiento: {offering.equipment}</Copy>}
            {offering.conditions && <Copy muted>Condiciones: {offering.conditions}</Copy>}
            <Copy muted>
              {offering.provider_name}{offering.provider_verified ? " · ✓ verificada" : ""}
              {[offering.city_name, offering.coverage_area].filter(Boolean).map((part) => ` · ${part}`).join("")}
            </Copy>
            <Button title={`Ver empresa ${offering.provider_name}`} secondary onPress={() => router.push(`/services/providers/${offering.provider_id}`)} />
          </Card>
          <Card>
            <Copy>Disponibilidad</Copy>
            <Copy muted>Muestra las fechas ya contratadas. La empresa confirma si puede tomar tu evento al cotizar.</Copy>
            <View style={styles.row}>
              <Field label="Fecha (AAAA-MM-DD)" value={date} onChangeText={setDate} onSubmitEditing={() => void lookup()} />
              <Button title="Consultar disponibilidad" secondary disabled={check.busy} onPress={() => void lookup()} />
            </View>
            <ActionFeedback action={check} />
            {availability && (availability.busy.length ? availability.busy.map((slot) => (
              <Copy key={`${slot.starts_at}-${slot.quote_id ?? ""}`} muted>
                Contratado: {range(slot.starts_at, slot.ends_at)}{slot.event_name ? ` · ${slot.event_name}` : ""}
              </Copy>
            )) : <Copy muted>Sin contrataciones ese día.</Copy>)}
          </Card>
          {offering.status === "PUBLISHED" && can("services.quotes.request") && <QuoteRequest offering={offering} />}
        </>
      )}
      <Button title="Volver a servicios" secondary onPress={() => router.push("/services")} />
    </Page>
  );
}

function QuoteRequest({ offering }: { offering: ServiceOffering }) {
  const { can } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({});
  const [concert, setConcert] = useState<string[]>([]);
  const [reservation, setReservation] = useState<string[]>([]);
  const action = useAction();
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  // Times are local to Argentina, like the marketplace; an end earlier than the start belongs to the next day.
  const send = () => action.run(async () => {
    if (!form.event_name?.trim()) throw new Error("Poné el nombre del evento.");
    if (!isDate(form.date ?? "")) throw new Error("Ingresá la fecha como AAAA-MM-DD.");
    const times = slot(form.date ?? "", { start: form.start ?? "", end: form.end ?? "" });
    const { data } = await api.request<ServiceQuote>("/services/quotes", {
      method: "POST",
      body: {
        offering_id: offering.id, event_name: form.event_name.trim(), event_start_at: times.event_start_at, event_end_at: times.event_end_at,
        location_text: form.location_text?.trim() || null, requester_notes: form.requester_notes?.trim() || null,
        concert_id: concert[0] ?? null, reservation_id: reservation[0] ?? null,
      },
    });
    router.push(`/services/quotes/${data.id}`);
  });
  return (
    <Card>
      <Copy>Pedir cotización</Copy>
      <Field label="Nombre del evento" value={form.event_name ?? ""} onChangeText={(v) => set("event_name", v)} />
      <View style={styles.row}>
        <Field label="Fecha (AAAA-MM-DD)" value={form.date ?? ""} onChangeText={(v) => set("date", v)} />
        <Field label="Desde (HH:MM)" value={form.start ?? ""} onChangeText={(v) => set("start", v)} />
        <Field label="Hasta (HH:MM)" value={form.end ?? ""} onChangeText={(v) => set("end", v)} />
      </View>
      <Field label="Lugar (opcional)" value={form.location_text ?? ""} onChangeText={(v) => set("location_text", v)} />
      <Field label="Detalles para la empresa (opcional)" multiline value={form.requester_notes ?? ""} onChangeText={(v) => set("requester_notes", v)} />
      {can("concerts.manage", "concerts.manage_all") && (
        <Select label="Concierto propio (opcional)" path="/concerts?mine=true" values={concert} onChange={setConcert} />
      )}
      {can("marketplace.reservations.create", "marketplace.reservations.manage") && (
        <Select label="Reserva de espacio confirmada (opcional)" path="/marketplace/reservations?status=CONFIRMED" searchable={false}
          itemLabel={(item) => `${String(item.event_name)} · ${String(item.venue_name)} · ${String(item.public_code)}`}
          values={reservation} onChange={setReservation} />
      )}
      <ActionFeedback action={action} />
      <Button title="Enviar pedido de cotización" disabled={action.busy} onPress={() => void send()} />
    </Card>
  );
}
