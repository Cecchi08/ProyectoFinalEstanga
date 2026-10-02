import { useState } from "react";
import { Image, View } from "react-native";
import { router } from "expo-router";
import {
  Button,
  Card,
  Copy,
  Field,
  Page,
  Pager,
  ResourceState,
  dateLabel,
  styles,
} from "../../components/ui";
import { Select } from "../../components/ui/Select";
import { useResource } from "../../hooks/useResource";
import { query } from "../../services/http";
import type { Concert } from "../../types/api";
export function ConcertCard({
  concert,
  manage = false,
  reason,
}: {
  concert: Concert;
  manage?: boolean;
  reason?: string;
}) {
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
        <Copy muted>{concert.artists.map((a) => a.name).join(" · ")}</Copy>
        <Copy muted>
          {concert.venue_name} · {concert.city_name}
        </Copy>
        {reason && <Copy>{reason}</Copy>}
        <Button
          title={manage ? `Gestionar ${concert.name}` : `Ver ${concert.name}`}
          onPress={() =>
            router.push(
              manage ? `/organizer/${concert.id}` : `/concerts/${concert.id}`,
            )
          }
        />
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
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
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
      {mode !== "discover" && (
        <Button
          title="Crear concierto"
          onPress={() => router.push("/organizer/new")}
        />
      )}
      <Card>
        <Field
          label="Buscar conciertos o artistas"
          value={draft.q ?? ""}
          onChangeText={(value) => set("q", value)}
          onSubmitEditing={() => {
            setFilters(draft);
            setPage(1);
          }}
        />
        <View style={styles.row}>
          <Button
            title="Buscar"
            onPress={() => {
              setFilters(draft);
              setPage(1);
            }}
          />
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
            {[
              ["artist_id", "Artistas", "/artists"],
              ["genre_id", "Géneros", "/genres"],
              ["venue_id", "Venue", "/venues"],
              ["city_id", "Ciudad", "/cities"],
              ["concert_type_id", "Tipo", "/concert-types"],
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
            <Button
              title="Aplicar filtros"
              onPress={() => {
                setFilters(draft);
                setPage(1);
                setExpanded(false);
              }}
            />
          </>
        )}
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
