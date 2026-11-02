import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import {
  BentoGrid,
  Button,
  Card,
  colors,
  Copy,
  Field,
  MusicalCover,
  Notice,
  Page,
  Pager,
  ResourceState,
  dateLabel,
  money,
  statusLabel,
  styles,
  useBento,
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
  featured = false,
}: {
  concert: Concert;
  manage?: boolean;
  reason?: string;
  featured?: boolean;
}) {
  const { can } = useAuth();
  const { desktop, mobile } = useBento();
  const isHero = featured && desktop;
  return (
    <View
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
        flexBasis: mobile ? "100%" : isHero ? 560 : 320,
        maxWidth: "100%",
      }}
    >
      <Card variant={isHero ? "featured" : "default"} style={{ height: "100%", justifyContent: "space-between" }}>
        <View style={{ gap: 10, minWidth: 0 }}>
          <MusicalCover
            uri={concert.image_url}
            alt={concert.name}
            kind="concert"
            height={isHero ? 210 : 168}
            badge={statusLabel(concert.status)}
            subBadge={concert.genres?.[0]?.name}
          />
          <Text style={[styles.label, { color: colors.accent }]}>
            {dateLabel(concert.start_datetime)} · {statusLabel(concert.status)}
          </Text>
          <Text style={[styles.heading, isHero && { fontSize: 22, lineHeight: 28 }]}>
            {concert.name}
          </Text>
          <View style={{ gap: 4 }}>
            <Copy strong>{lineup(concert)}</Copy>
            <Copy muted>{place(concert)}</Copy>
          </View>
          {reason && (
            <View
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Copy>{reason}</Copy>
            </View>
          )}
        </View>
        <View
          style={{
            gap: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          {concert.price_from != null && (
            <Text style={[styles.text, { fontWeight: "700", color: colors.accent }]}>
              Desde {money(concert.price_from)}
            </Text>
          )}
          <View style={styles.row}>
            <Button
              title={manage ? `Gestionar ${concert.name}` : `Ver ${concert.name}`}
              secondary
              onPress={() =>
                router.push(
                  manage ? `/organizer/${concert.id}` : `/concerts/${concert.id}`,
                )
              }
            />
            {manage && (
              <Button
                title={`Estadísticas de ${concert.name}`}
                secondary
                onPress={() =>
                  router.push(
                    `${can("statistics.global") ? "/admin" : "/organizer"}/statistics?concert_id=${concert.id}`,
                  )
                }
              />
            )}
          </View>
        </View>
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
      eyebrow={
        mode === "discover"
          ? "VENTI · CARTELERA EN VIVO"
          : mode === "organizer"
            ? "VENTI · PANEL DE ORGANIZADOR"
            : "VENTI · GESTIÓN GLOBAL"
      }
      title={
        mode === "discover"
          ? "Encontrá tu próximo show"
          : mode === "organizer"
            ? "Mis conciertos"
            : "Todos los conciertos"
      }
      subtitle="Música en vivo. Experiencias que quedan."
      actions={
        mode !== "discover" ? (
          <>
            <Button
              title="Ver estadísticas"
              secondary
              onPress={() =>
                router.push(
                  can("statistics.global")
                    ? "/admin/statistics"
                    : "/organizer/statistics",
                )
              }
            />
            <Button
              title="Crear concierto"
              onPress={() => router.push("/organizer/new")}
            />
          </>
        ) : undefined
      }
    >
      <Card>
        <View style={styles.row}>
          <Field
            label="Buscar conciertos"
            value={draft.q ?? ""}
            onChangeText={(value) => set("q", value)}
            onSubmitEditing={() => apply()}
          />
        </View>
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
          <View
            style={{
              gap: 14,
              paddingTop: 12,
              borderTopWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={styles.row}>
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
            </View>
            <View style={styles.row}>
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
            </View>
            <View style={styles.row}>
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
            </View>
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
                      title={status ? statusLabel(status) : "Todos"}
                      secondary={draft.status !== status}
                      onPress={() => set("status", status)}
                    />
                  ),
                )}
              </View>
            )}
            <Button title="Aplicar filtros" onPress={() => apply(true)} />
          </View>
        )}
        <Notice message={invalid} error />
      </Card>
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
      />
      <BentoGrid>
        {resource.result?.data.map((concert, index) => (
          <ConcertCard
            key={concert.id}
            concert={concert}
            manage={mode !== "discover"}
            featured={index === 0 && (resource.result?.data.length ?? 0) > 1}
          />
        ))}
      </BentoGrid>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
