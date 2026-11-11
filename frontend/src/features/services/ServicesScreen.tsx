import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { PricingUnit, PublicationStatus, ServiceAvailability, ServiceCategory, ServiceOffering, ServiceProvider, ServiceQuote } from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  DateTimeField,
  Field,
  FormScope,
  MusicalCover,
  Notice,
  Page,
  Pager,
  ResourceState,
  SectionHeader,
  colors,
  money,
  statusLabel,
  styles,
  useAction,
  useBento,
  useForm,
} from "../../components/ui";
import { Select } from "../../components/ui/Select";
import { Codes } from "../marketplace/MarketplaceScreen";
import { isDate, range, slot } from "../marketplace/time";

export const PRICING: Record<PricingUnit, string> = { HOUR: "por hora", DAY: "por día", EVENT: "por evento", UNIT: "por unidad", QUOTE: "a cotizar" };
export const PUBLICATION: Record<PublicationStatus, string> = { DRAFT: "Borrador", PUBLISHED: "Activo / Publicado", ARCHIVED: "Inactivo / Archivado" };

// A QUOTE offering may still show a reference price.
export const priceLabel = (offering: Pick<ServiceOffering, "pricing_unit" | "base_price">) =>
  offering.base_price == null ? "Precio a cotizar"
    : offering.pricing_unit === "QUOTE" ? `Desde ${money(offering.base_price)}, a cotizar` : `${money(offering.base_price)} ${PRICING[offering.pricing_unit]}`;

const PRICE = /^\d+(\.\d{1,2})?$/;

export function OfferingCard({
  offering,
  manage = false,
  footerActions,
}: {
  offering: ServiceOffering;
  manage?: boolean;
  footerActions?: ReactNode;
}) {
  const { mobile } = useBento();
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: mobile ? "auto" : 320, width: mobile ? "100%" : undefined, maxWidth: "100%" }}>
      <Card style={{ flexGrow: 1, justifyContent: "space-between" }}>
        <View style={{ gap: 8 }}>
          <MusicalCover
            uri={offering.image_url}
            alt={offering.name}
            kind="service"
            height={145}
            badge={offering.category_name}
            subBadge={manage ? PUBLICATION[offering.status] : offering.provider_verified ? "VERIFICADA" : undefined}
          />
          <Copy strong>{offering.name}</Copy>
          <Copy muted>
            {offering.provider_name}{offering.provider_verified ? " · ✓ Verificada" : ""}
            {offering.city_name ? ` · ${offering.city_name}` : ""}
          </Copy>
          <Copy muted>{priceLabel(offering)}</Copy>
        </View>
        <View style={[styles.row, { paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }]}>
          <Button title={`Ver servicio ${offering.name}`} secondary onPress={() => router.push(`/services/offerings/${offering.id}`)} />
          {footerActions}
        </View>
      </Card>
    </View>
  );
}

export function ProviderCard({ provider }: { provider: ServiceProvider }) {
  const { mobile } = useBento();
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: mobile ? "auto" : 320, width: mobile ? "100%" : undefined, maxWidth: "100%" }}>
      <Card style={{ flexGrow: 1, justifyContent: "space-between" }}>
        <View style={{ gap: 8 }}>
          <MusicalCover
            uri={provider.logo_url}
            alt={provider.name}
            kind="service"
            height={140}
            badge={provider.primary_category_name ?? "Empresa de servicios"}
            subBadge={provider.is_verified ? "VERIFICADA" : undefined}
          />
          <Copy strong>{provider.name}{provider.is_verified ? " · ✓ Verificada" : ""}</Copy>
          {provider.primary_category_name ? (
            <Copy muted>Categoría principal: {provider.primary_category_name}</Copy>
          ) : null}
          <Copy muted>{[provider.city_name, provider.coverage_area].filter(Boolean).join(" · ") || "Zona a consultar"}</Copy>
          <Copy muted>
            {provider.published_offerings} {provider.published_offerings === 1 ? "servicio activo" : "servicios activos"}
            {provider.member_role ? ` · ${PUBLICATION[provider.status]} · Rol: ${statusLabel(provider.member_role)}` : ""}
          </Copy>
        </View>
        <View style={{ paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }}>
          <Button title={`Administrar ${provider.name}`} secondary onPress={() => router.push(`/services/providers/${provider.id}`)} />
        </View>
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
    <Page
      eyebrow="VENTI · PRODUCCIÓN Y TÉCNICA"
      title="Servicios para eventos"
      subtitle="Sonido, iluminación, seguridad, limpieza y más. Pedí cotización a empresas de servicios."
      actions={
        <>
          {can("services.quotes.request", "services.quotes.respond", "services.admin") && (
            <Button title="Cotizaciones de servicios" secondary onPress={() => router.push("/services/quotes")} />
          )}
          {can("services.manage", "services.admin") && (
            <Button title="Mis empresas de servicios" secondary onPress={() => router.push("/services/mine")} />
          )}
        </>
      }
    >
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
        <View style={styles.row}>
          <Select label="Ciudad" path="/cities" values={draft.city_id ? [draft.city_id] : []} onChange={(v) => set("city_id", v[0] ?? "")} />
          {tab === "offerings" ? (
            <Field label="Precio máximo (opcional)" keyboardType="decimal-pad" value={draft.max_price ?? ""} onChangeText={(v) => set("max_price", v)} />
          ) : (
            <Button title={`${draft.verified === "true" ? "✓ " : ""}Solo empresas verificadas`} secondary={draft.verified !== "true"}
              onPress={() => set("verified", draft.verified === "true" ? "" : "true")} />
          )}
        </View>
        <Notice message={invalid} error />
        <View style={styles.row}>
          <Button title="Buscar servicios" onPress={apply} />
          <Button title="Limpiar filtros" secondary onPress={() => { setDraft({}); setFilters({}); setInvalid(""); setPage(1); }} />
        </View>
      </Card>
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      <BentoGrid>
        {tab === "offerings"
          ? offerings.result?.data.map((offering) => <OfferingCard key={offering.id} offering={offering} />)
          : providers.result?.data.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
      </BentoGrid>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}

// GET /services/offerings/:id; availability is informational (contracted windows) and the quote request is
// POST /services/quotes (services.quotes.request). A company cannot ask itself for a quote (422 OWN_PROVIDER).
export function OfferingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const { mobile } = useBento();
  const resource = useResource<ServiceOffering>(`/services/offerings/${id}`);
  const offering = resource.result?.data;
  const [date, setDate] = useState("");
  const [availability, setAvailability] = useState<ServiceAvailability | null>(null);
  const check = useAction();
  const lookup = () => check.run(async () => {
    if (!isDate(date)) throw new Error("Elegí una fecha para consultar disponibilidad.");
    const { data } = await api.request<ServiceAvailability>(`/services/offerings/${id}/availability${query({ date: date.trim() })}`);
    setAvailability(data);
  });
  return (
    <Page
      eyebrow="VENTI · FICHA DE SERVICIO"
      title={offering?.name ?? "Servicio"}
      actions={<Button title="Volver a servicios" secondary onPress={() => router.push("/services")} />}
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {offering && (
        <BentoGrid style={{ alignItems: "flex-start" }}>
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 480,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
              gap: 16,
            }}
          >
            <Card variant="featured">
              <MusicalCover
                uri={offering.image_url}
                alt={offering.name}
                kind="service"
                height={190}
                badge={offering.category_name}
                subBadge={offering.provider_verified ? "VERIFICADA" : undefined}
              />
              <Copy muted>{offering.category_name}{offering.status !== "PUBLISHED" ? ` · ${PUBLICATION[offering.status]}` : ""}</Copy>
              <Copy strong>{priceLabel(offering)}</Copy>
              {offering.description && <Copy>{offering.description}</Copy>}
              {offering.equipment && <Copy muted>Equipamiento: {offering.equipment}</Copy>}
              {offering.conditions && <Copy muted>Condiciones: {offering.conditions}</Copy>}
              <Copy muted>
                {offering.provider_name}{offering.provider_verified ? " · ✓ Verificada" : ""}
                {[offering.city_name, offering.coverage_area].filter(Boolean).map((part) => ` · ${part}`).join("")}
              </Copy>
              <Button title={`Ver empresa ${offering.provider_name}`} secondary onPress={() => router.push(`/services/providers/${offering.provider_id}`)} />
            </Card>

            <Card>
              <SectionHeader title="Disponibilidad" />
              <Copy muted>Muestra las fechas ya contratadas. La empresa confirma si puede tomar tu evento al cotizar.</Copy>
              <View style={styles.row}>
                <DateTimeField label="Fecha de consulta" mode="date" value={date} onChange={setDate} />
                <Button title="Consultar disponibilidad" secondary disabled={check.busy} onPress={() => void lookup()} />
              </View>
              <ActionFeedback action={check} />
              {availability && (availability.busy.length ? availability.busy.map((slot) => (
                <Copy key={`${slot.starts_at}-${slot.quote_id ?? ""}`} muted>
                  Contratado: {range(slot.starts_at, slot.ends_at)}{slot.event_name ? ` · ${slot.event_name}` : ""}
                </Copy>
              )) : <Copy muted>Sin contrataciones ese día.</Copy>)}
            </Card>
          </View>

          {offering.status === "PUBLISHED" && can("services.quotes.request") && (
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
              <QuoteRequest offering={offering} />
            </View>
          )}
        </BentoGrid>
      )}
    </Page>
  );
}

function QuoteRequest({ offering }: { offering: ServiceOffering }) {
  const { can } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({});
  const [concert, setConcert] = useState<string[]>([]);
  const [reservation, setReservation] = useState<string[]>([]);
  const action = useAction();
  const validation = useForm();
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const send = () => action.run(async () => {
    validation.assertValid();
    if (!form.event_name?.trim()) throw new Error("Poné el nombre del evento.");
    if (!isDate(form.date ?? "")) throw new Error("Elegí la fecha del evento.");
    const times = slot(form.date ?? "", { start: form.start ?? "", end: form.end ?? "" });
    const attendeesCount = form.expected_attendance?.trim() ? Number(form.expected_attendance.trim()) : null;
    const { data } = await api.request<ServiceQuote>("/services/quotes/create", {
      method: "POST",
      body: {
        offering_id: offering.id, event_name: form.event_name.trim(), event_start_at: times.event_start_at, event_end_at: times.event_end_at,
        location_text: form.location_text?.trim() || null, requester_notes: form.requester_notes?.trim() || null,
        attendees: attendeesCount, expected_attendance: attendeesCount,
        concert_id: concert[0] ?? null, reservation_id: reservation[0] ?? null,
      },
    });
    router.push(`/services/quotes/${data.id}`);
  });
  return (
    <Card variant="featured">
      <FormScope form={validation}>
        <SectionHeader title="Pedir cotización" subtitle="Enviá los requerimientos de tu evento a la empresa" />
        <Field label="Nombre del evento" required value={form.event_name ?? ""} onChangeText={(v) => set("event_name", v)} />
        <View style={styles.row}>
          <DateTimeField label="Fecha del evento" mode="date" required value={form.date ?? ""} onChange={(v) => set("date", v)} />
          <DateTimeField label="Horario de inicio" mode="time" required defaultTime="20:00" value={form.start ?? ""} onChange={(v) => set("start", v)} />
          <DateTimeField label="Horario de fin" mode="time" required defaultTime="23:00" value={form.end ?? ""} onChange={(v) => set("end", v)} />
        </View>
        <Field label="Lugar (opcional)" value={form.location_text ?? ""} onChangeText={(v) => set("location_text", v)} />
        <Field label="Cantidad de asistentes (opcional)" keyboardType="number-pad" value={form.expected_attendance ?? ""} onChangeText={(v) => set("expected_attendance", v)} />
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
      </FormScope>
    </Card>
  );
}
