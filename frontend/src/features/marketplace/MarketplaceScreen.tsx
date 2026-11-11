import { memo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { query } from "../../services/http";
import type { MarketplaceCatalogs, Named, OccupancyMode, Venue } from "../../types/api";
import {
  BentoGrid,
  Button,
  Card,
  Copy,
  DateTimeField,
  Field,
  MusicalCover,
  Notice,
  Page,
  Pager,
  ResourceState,
  colors,
  money,
  statusLabel,
  styles,
  useBento,
} from "../../components/ui";
import { at, isDate } from "./time";

export const capacityLabel = (venue: Pick<Venue, "capacity_standing" | "capacity_seated">) =>
  [venue.capacity_standing ? `${venue.capacity_standing} de pie` : "", venue.capacity_seated ? `${venue.capacity_seated} sentados` : ""]
    .filter(Boolean).join(" · ") || "Capacidad a consultar";

export const VenueCard = memo(function VenueCard({
  venue,
  manage = false,
  featured = false,
  footerActions,
}: {
  venue: Venue;
  manage?: boolean;
  featured?: boolean;
  footerActions?: ReactNode;
}) {
  const { desktop, mobile } = useBento();
  const isHero = featured && desktop;
  return (
    <View
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
        flexBasis: mobile ? "auto" : isHero ? 560 : 320,
        width: mobile ? "100%" : undefined,
        maxWidth: "100%",
      }}
    >
      <Card variant={isHero ? "featured" : "default"} style={{ flexGrow: 1, justifyContent: "space-between" }}>
        <View style={{ gap: 10 }}>
          <MusicalCover
            uri={venue.cover_url}
            alt={venue.name}
            kind="venue"
            height={isHero ? 200 : 165}
            badge={venue.venue_type_name}
            subBadge={venue.city_name}
          />
          <Copy muted>{venue.venue_type_name}{manage ? ` · ${statusLabel(venue.status)}` : ""}</Copy>
          <Copy strong>{venue.name}</Copy>
          <Copy muted>{venue.establishment_name} · {venue.address_line} · {venue.city_name}</Copy>
          <Copy muted>{capacityLabel(venue)} · {money(venue.price_per_hour)} por hora</Copy>
        </View>
        <View style={[styles.row, { paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }]}>
          <Button title={`Ver ${venue.name}`} secondary onPress={() => router.push(`/marketplace/venues/${venue.id}`)} />
          {footerActions}
        </View>
      </Card>
    </View>
  );
});

// Toggle buttons for a catalog; multiple keeps every selected code.
export function Codes({ items, values, onChange, multiple = false, label, allLabel = "Todas" }: {
  items: Named[] | undefined; values: string[]; onChange(values: string[]): void; multiple?: boolean; label: string; allLabel?: string;
}) {
  if (!items || items.length === 0) return null;
  const isAll = values.length === 0;

  return (
    <View style={{ gap: 8, minWidth: 0, maxWidth: "100%" }}>
      <Copy muted>{label}</Copy>
      <View style={[styles.row, { flexWrap: "wrap" }]}>
        <Button
          title={`${isAll ? "✓ " : ""}${allLabel}`}
          secondary={!isAll}
          onPress={() => onChange([])}
        />
        {items.map((item) => {
          const code = item.code ?? item.id;
          const on = values.includes(code);
          return (
            <Button
              key={code}
              title={`${on ? "✓ " : ""}${item.name}`}
              secondary={!on}
              onPress={() => {
                if (multiple) {
                  const next = on ? values.filter((v) => v !== code) : [...values, code];
                  onChange(next);
                } else {
                  onChange(on ? [] : [code]);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function MarketplaceScreen() {
  const { can } = useAuth();
  const catalogs = useResource<MarketplaceCatalogs>("/marketplace/catalogs");
  const cities = useResource<Named[]>("/marketplace/cities");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const [invalid, setInvalid] = useState("");
  const [page, setPage] = useState(1);
  const resource = useResource<Venue[]>(`/marketplace/venues${query({ ...filters, page, limit: 12 })}`);
  const set = (key: string, value: string) => setDraft({ ...draft, [key]: value });
  const apply = () => {
    try {
      const slot = draft.date || draft.from || draft.to;
      if (slot && !(isDate(draft.date ?? "") && draft.from && draft.to)) throw new Error("Para buscar por franja completá fecha, desde y hasta.");
      const from = slot ? at(draft.date, draft.from) : undefined;
      const to = slot ? at(draft.date, draft.to) : undefined;
      if (from && to && to <= from) to.setTime(to.getTime() + 86400000);
      setFilters({
        q: draft.q?.trim(), city_id: draft.city_id, venue_type: types[0], amenities: amenities.join(",") || undefined,
        min_capacity: draft.min_capacity?.trim(), max_price: draft.max_price?.trim(),
        ...(from && to ? { available_from: from.toISOString(), available_to: to.toISOString(), mode: (draft.mode as OccupancyMode) || "VENUE" } : {}),
      });
      setInvalid(""); setPage(1);
    } catch (e) {
      setInvalid(e instanceof Error ? e.message : "Filtros inválidos.");
    }
  };
  const requester = can("marketplace.quotes.request", "marketplace.reservations.create", "marketplace.admin");
  const quotes = can("marketplace.quotes.request", "marketplace.quotes.respond", "marketplace.admin");
  const reservations = can("marketplace.reservations.create", "marketplace.reservations.manage", "marketplace.admin");
  return (
    <Page
      eyebrow="VENTI · MARKETPLACE DE ESPACIOS"
      title="Espacios para tu evento"
      subtitle="Salas de ensayo, estudios y escenarios. Reservá o pedí presupuesto."
      actions={
        <>
          {quotes && <Button title={requester ? "Mis presupuestos" : "Presupuestos recibidos"} secondary onPress={() => router.push("/marketplace/quotes")} />}
          {reservations && <Button title={requester ? "Mis reservas de espacios" : "Reservas recibidas"} secondary onPress={() => router.push("/marketplace/reservations")} />}
          {can("marketplace.establishments.manage", "marketplace.admin") && (
            <Button title="Gestionar establecimientos" secondary onPress={() => router.push("/marketplace/manage")} />
          )}
          <Button title="Servicios para eventos" secondary onPress={() => router.push("/services")} />
        </>
      }
    >
      <Card>
        <Field label="Buscar espacios" value={draft.q ?? ""} onChangeText={(v) => set("q", v)} onSubmitEditing={apply} />
        <Codes label="Ciudad" items={cities.result?.data} values={draft.city_id ? [draft.city_id] : []} onChange={(v) => set("city_id", v[0] ?? "")} />
        <Codes label="Tipo de espacio" items={catalogs.result?.data.venue_types} values={types} onChange={setTypes} />
        <Codes label="Comodidades (todas)" multiple items={catalogs.result?.data.amenities} values={amenities} onChange={setAmenities} />
        <View style={styles.row}>
          <Field label="Capacidad mínima" keyboardType="number-pad" value={draft.min_capacity ?? ""} onChangeText={(v) => set("min_capacity", v)} />
          <Field label="Precio máximo por hora" keyboardType="decimal-pad" value={draft.max_price ?? ""} onChangeText={(v) => set("max_price", v)} />
        </View>
        <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }}>
          <Copy muted>Libre en una franja (hora de Argentina, opcional)</Copy>
          <View style={[styles.row, { flexWrap: "wrap", alignItems: "stretch" }]}>
            <DateTimeField label="Fecha" mode="date" value={draft.date ?? ""} onChange={(v) => set("date", v)} />
            <DateTimeField label="Desde" mode="time" defaultTime="18:00" value={draft.from ?? ""} onChange={(v) => set("from", v)} />
            <DateTimeField label="Hasta" mode="time" defaultTime="20:00" value={draft.to ?? ""} onChange={(v) => set("to", v)} />
          </View>
          <Codes label="Modalidad" items={catalogs.result?.data.occupancy_modes.map((m) => ({ id: m.code, code: m.code, name: m.name }))}
            values={draft.mode ? [draft.mode] : []} onChange={(v) => set("mode", v[0] ?? "")} />
        </View>
        <Notice message={invalid} error />
        <View style={styles.row}>
          <Button title="Aplicar búsqueda" onPress={apply} />
          <Button title="Limpiar filtros" secondary onPress={() => { setDraft({}); setTypes([]); setAmenities([]); setFilters({}); setInvalid(""); setPage(1); }} />
        </View>
      </Card>
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} skeleton="card" />
      <BentoGrid>
        {resource.result?.data.map((venue, index) => (
          <VenueCard
            key={venue.id}
            venue={venue}
            featured={index === 0 && (resource.result?.data.length ?? 0) > 1}
          />
        ))}
      </BentoGrid>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
