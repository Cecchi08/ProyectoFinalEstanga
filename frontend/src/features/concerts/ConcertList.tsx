import { useState } from "react";
import { Image, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from '../../contexts/AuthContext';
import {
  Button,
  Card,
  Copy,
  Field,
  Notice,
  Page,
  Pager,
  ResourceState,
  dateLabel,
  money,
  styles,
} from "../../components/ui";
import { Select } from "../../components/ui/Select";
import { useResource } from "../../hooks/useResource";
import { query } from "../../services/http";
import type { Concert } from "../../types/api";
import { lineup, place } from "./ConcertDetail";
const PRICE = /^\d+(\.\d{1,2})?$/;
export function ConcertCard({
  concert,
  manage = false,
  reason,
}: {
  concert: Concert;
  manage?: boolean;
  reason?: string;
}) {
  const { can } = useAuth();
  return (
    <View style={{ flexGrow: 1, flexBasis: 300, maxWidth: 560 }}>
      <Card>
        {concert.image_url && (
          <Image
            source={{ uri: concert.image_url }}
            accessibilityLabel={concert.name}
            style={{ height: 170, borderRadius: 12 }}
          />
        )}
        <Copy muted>
          {dateLabel(concert.start_datetime)} · {concert.status}
        </Copy>
        <Copy>{concert.name}</Copy>
        <Copy muted>{lineup(concert)}</Copy>
        <Copy muted>{place(concert)}</Copy>
        {concert.price_from != null && <Copy muted>Desde {money(concert.price_from)}</Copy>}
        {reason && <Copy>{reason}</Copy>}
        <Button
          title={manage ? `Gestionar ${concert.name}` : `Ver ${concert.name}`}
          onPress={() =>
            router.push(
              manage ? `/organizer/${concert.id}` : `/concerts/${concert.id}`,
            )
          }
        />
        {manage && <Button title={`Estadísticas de ${concert.name}`} secondary onPress={() => router.push(`${can('statistics.global') ? '/admin' : '/organizer'}/statistics?concert_id=${concert.id}`)} />}
      </Card>
    </View>
  );
}
export default function ConcertList({
  mode = "discover",
}: {
  mode?: "discover" | "organizer" | "admin";
}) {
  const [page, setPage] = useState(1);
  const { can } = useAuth();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [invalid, setInvalid] = useState("");
  const resource = useResource<Concert[]>(
    "/concerts" +
      query({
        limit: 12,
        ...filters,
        page,
        ...(mode === "organizer"
          ? { mine: "true" }
          : mode === "discover"
            ? { status: "PUBLISHED" }
            : {}),
      }),
  );
  const set = (key: string, value: string) =>
    setDraft({ ...draft, [key]: value });
  // min_price/max_price match concerts with at least one active ticket type inside the range.
  const apply = (close = false) => {
    const [min, max] = [draft.min_price?.trim() ?? "", draft.max_price?.trim() ?? ""];
    if ([min, max].some((value) => value && !PRICE.test(value)))
      return setInvalid("Los precios son números con hasta dos decimales, sin signo $.");
    if (min && max && Number(min) > Number(max))
      return setInvalid("El precio mínimo no puede superar al máximo.");
    setInvalid("");
    setFilters({ ...draft, min_price: min, max_price: max });
    setPage(1);
    if (close) setExpanded(false);
  };
  return (
    <Page
      title={
        mode === "discover"
          ? "Encontrá tu próximo show"
          : mode === "organizer"
            ? "Mis conciertos"
            : "Todos los conciertos"
      }
      subtitle="Música en vivo. Experiencias que quedan."
    >
      {mode !== 'discover' && <Button title="Ver estadísticas" onPress={() => router.push(can('statistics.global') ? '/admin/statistics' : '/organizer/statistics')} />}
      {mode !== "discover" && (
        <Button
          title="Crear concierto"
          onPress={() => router.push("/organizer/new")}
        />
      )}
      <Card>
        <Field
          label="Buscar conciertos"
          value={draft.q ?? ""}
          onChangeText={(value) => set("q", value)}
          onSubmitEditing={() => apply()}
        />
        <View style={styles.row}>
          <Button title="Buscar" onPress={() => apply()} />
          <Button
            title="Filtros"
            secondary
            onPress={() => setExpanded(!expanded)}
          />
          <Button
            title="Limpiar filtros"
            secondary
            onPress={() => {
              setDraft({});
              setFilters({});
              setInvalid("");
              setPage(1);
            }}
          />
        </View>
        {expanded && (
          <>
            <Field
              label="Nombre del concierto"
              value={draft.name ?? ""}
              onChangeText={(v) => set("name", v)}
            />
            <Field
              label="Artista"
              value={draft.artist ?? ""}
              onChangeText={(v) => set("artist", v)}
            />
            {[
              ["genre_id", "Géneros", "/genres"],
              ["venue_id", "Espacio", "/venues"],
              ["city_id", "Ciudad", "/cities"],
            ].map(([key, label, path]) => (
              <Select
                key={key}
                label={label}
                path={path}
                values={draft[key] ? [draft[key]] : []}
                onChange={(v) => set(key, v[0] ?? "")}
              />
            ))}
            <Field
              label="Desde (ISO, ej. 2027-01-01T00:00:00Z)"
              value={draft.date_from ?? ""}
              onChangeText={(v) => set("date_from", v)}
            />
            <Field
              label="Hasta (ISO)"
              value={draft.date_to ?? ""}
              onChangeText={(v) => set("date_to", v)}
            />
            <View style={styles.row}>
              <Field
                label="Precio mínimo"
                keyboardType="decimal-pad"
                value={draft.min_price ?? ""}
                onChangeText={(v) => set("min_price", v)}
              />
              <Field
                label="Precio máximo"
                keyboardType="decimal-pad"
                value={draft.max_price ?? ""}
                onChangeText={(v) => set("max_price", v)}
              />
            </View>
            {mode !== "discover" && (
              <View style={styles.row}>
                {["", "DRAFT", "PUBLISHED", "CANCELLED", "FINISHED"].map(
                  (status) => (
                    <Button
                      key={status}
                      title={status || "Todos"}
                      secondary={draft.status !== status}
                      onPress={() => set("status", status)}
                    />
                  ),
                )}
              </View>
            )}
            <Button title="Aplicar filtros" onPress={() => apply(true)} />
          </>
        )}
        <Notice message={invalid} error />
      </Card>
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
      />
      <View style={[styles.row, { alignItems: "stretch" }]}>
        {resource.result?.data.map((concert) => (
          <ConcertCard
            key={concert.id}
            concert={concert}
            manage={mode !== "discover"}
          />
        ))}
      </View>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
