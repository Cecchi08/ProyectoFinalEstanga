import { useState } from "react";
import { Image, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { query } from "../../services/http";
import { hasRoles, type MarketplaceCatalogs, type Named, type OccupancyMode, type Venue } from "../../types/api";
import { Button, Card, Copy, Field, Notice, Page, Pager, ResourceState, money, styles } from "../../components/ui";
import { at, isDate } from "./time";

export const capacityLabel = (venue: Pick<Venue, "capacity_standing" | "capacity_seated">) =>
  [venue.capacity_standing ? `${venue.capacity_standing} de pie` : "", venue.capacity_seated ? `${venue.capacity_seated} sentados` : ""]
    .filter(Boolean).join(" · ") || "Capacidad a consultar";
export function VenueCard({ venue, manage = false }: { venue: Venue; manage?: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 300, maxWidth: 560 }}>
      <Card>
        {venue.cover_url && (
          <Image source={{ uri: venue.cover_url }} accessibilityLabel={venue.name} style={{ height: 160, borderRadius: 12 }} />
        )}
        <Copy muted>{venue.venue_type_name}{manage ? ` · ${venue.status}` : ""}</Copy>
        <Copy>{venue.name}</Copy>
        <Copy muted>{venue.establishment_name} · {venue.address_line} · {venue.city_name}</Copy>
        <Copy muted>{capacityLabel(venue)} · {money(venue.price_per_hour)} por hora</Copy>
        <Button title={`Ver ${venue.name}`} onPress={() => router.push(`/marketplace/venues/${venue.id}`)} />
      </Card>
    </View>
  );
}
// Toggle buttons for a catalog; multiple keeps every selected code.
export function Codes({ items, values, onChange, multiple = false, label }: {
  items: Named[] | undefined; values: string[]; onChange(values: string[]): void; multiple?: boolean; label: string;
}) {
  if (!items) return null;
  return (
    <View style={{ gap: 8 }}>
      <Copy muted>{label}</Copy>
      <View style={styles.row}>
        {items.map((item) => {
          const code = item.code ?? item.id, on = values.includes(code);
          return (
            <Button key={code} title={`${on ? "✓ " : ""}${item.name}`} secondary={!on}
              onPress={() => onChange(multiple ? (on ? values.filter((v) => v !== code) : [...values, code]) : on ? [] : [code])} />
          );
        })}
      </View>
    </View>
  );
}

export default function MarketplaceScreen() {
  const { roles } = useAuth();
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
  const requester = hasRoles(roles, ["CUSTOMER", "ORGANIZER", "ADMIN"]);
  return (
    <Page title="Espacios para tu evento" subtitle="Salas de ensayo, estudios y escenarios. Reservá o pedí presupuesto.">
      <View style={styles.row}>
        {requester && <Button title="Mis presupuestos" secondary onPress={() => router.push("/marketplace/quotes")} />}
        {requester && <Button title="Mis reservas de espacios" secondary onPress={() => router.push("/marketplace/reservations")} />}
        {hasRoles(roles, ["ORGANIZER", "ADMIN"]) && (
          <Button title="Gestionar establecimientos" secondary onPress={() => router.push("/marketplace/manage")} />
        )}
      </View>
      <Card>
        <Field label="Buscar espacios" value={draft.q ?? ""} onChangeText={(v) => set("q", v)} onSubmitEditing={apply} />
        <Codes label="Ciudad" items={cities.result?.data} values={draft.city_id ? [draft.city_id] : []} onChange={(v) => set("city_id", v[0] ?? "")} />
        <Codes label="Tipo de espacio" items={catalogs.result?.data.venue_types} values={types} onChange={setTypes} />
        <Codes label="Comodidades (todas)" multiple items={catalogs.result?.data.amenities} values={amenities} onChange={setAmenities} />
        <View style={styles.row}>
          <Field label="Capacidad mínima" keyboardType="number-pad" value={draft.min_capacity ?? ""} onChangeText={(v) => set("min_capacity", v)} />
          <Field label="Precio máximo por hora" keyboardType="decimal-pad" value={draft.max_price ?? ""} onChangeText={(v) => set("max_price", v)} />
        </View>
        <Copy muted>Libre en una franja (hora de Argentina, opcional)</Copy>
        <View style={styles.row}>
          <Field label="Fecha (AAAA-MM-DD)" value={draft.date ?? ""} onChangeText={(v) => set("date", v)} />
          <Field label="Desde (HH:MM)" value={draft.from ?? ""} onChangeText={(v) => set("from", v)} />
          <Field label="Hasta (HH:MM)" value={draft.to ?? ""} onChangeText={(v) => set("to", v)} />
        </View>
        <Codes label="Modalidad" items={catalogs.result?.data.occupancy_modes.map((m) => ({ id: m.code, code: m.code, name: m.name }))}
          values={draft.mode ? [draft.mode] : []} onChange={(v) => set("mode", v[0] ?? "")} />
        <Notice message={invalid} error />
        <View style={styles.row}>
          <Button title="Aplicar búsqueda" onPress={apply} />
          <Button title="Limpiar filtros" secondary onPress={() => { setDraft({}); setTypes([]); setAmenities([]); setFilters({}); setInvalid(""); setPage(1); }} />
        </View>
      </Card>
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      <View style={[styles.row, { alignItems: "stretch" }]}>
        {resource.result?.data.map((venue) => <VenueCard key={venue.id} venue={venue} />)}
      </View>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
