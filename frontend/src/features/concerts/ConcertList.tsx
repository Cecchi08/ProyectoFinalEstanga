import { memo, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { usePreferences } from "../../contexts/PreferencesContext";
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
  SectionHeader,
  colors,
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
import { fromArgDateTimeToUtcIso } from "../marketplace/time";
import { lineup, place } from "./ConcertDetail";

const PRICE = /^\d+(\.\d{1,2})?$/;

// Tarjeta individual de concierto con diferenciación visual destacada para recomendaciones.
export const ConcertCard = memo(function ConcertCard({
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
  const isRecommendation = Boolean(reason);
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
      <Card
        variant={isRecommendation ? "featured" : isHero ? "featured" : "default"}
        style={{
          flexGrow: 1,
          justifyContent: "space-between",
          borderColor: isRecommendation ? colors.accentBorder : undefined,
          borderWidth: isRecommendation ? 1.5 : 1,
        }}
      >
        <View style={{ gap: 10, minWidth: 0 }}>
          {isRecommendation && (
            <View
              style={{
                alignSelf: "flex-start",
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 6,
                backgroundColor: colors.accentSoft,
                borderWidth: 1,
                borderColor: colors.accentBorder,
              }}
            >
              <Text style={{ color: colors.accentText, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 }}>
                RECOMENDADO POR VENTI
              </Text>
            </View>
          )}
          <MusicalCover
            uri={concert.image_url}
            alt={concert.name}
            kind="concert"
            height={isHero ? 210 : 168}
            badge={statusLabel(concert.status)}
            subBadge={concert.genres?.[0]?.name}
          />
          <Text style={[styles.label, { color: colors.accentText }]}>
            {dateLabel(concert.start_datetime)} · {statusLabel(concert.status)}
          </Text>
          <Text style={[styles.subheading, isHero && { fontSize: 22, lineHeight: 28 }]}>
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
              <Copy size="small">{reason}</Copy>
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
});

export default function ConcertList({
  mode = "discover",
}: {
  mode?: "discover" | "organizer" | "admin";
}) {
  const [page, setPage] = useState(1);
  const { can } = useAuth();
  const preferences = usePreferences();
  const recActive =
    mode === "discover" &&
    preferences.enabled === true &&
    !preferences.loading &&
    !preferences.saving;
  const recResource = useResource<{
    enabled: boolean;
    recommendations: { concert: Concert; reason: string }[];
  }>(recActive ? "/recommendations" : null);
  const recs = recResource.result?.data?.recommendations ?? [];
  const recsOff =
    mode === "discover" &&
    (preferences.enabled === false ||
      (recActive && recResource.result?.data.enabled === false));

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
    if (draft.date_from && draft.date_to && draft.date_from > draft.date_to)
      return setInvalid("La fecha desde no puede ser posterior a la fecha hasta.");
    setInvalid("");
    setFilters({
      ...draft,
      date_from: draft.date_from ? fromArgDateTimeToUtcIso(draft.date_from, "00:00") : "",
      date_to: draft.date_to ? fromArgDateTimeToUtcIso(draft.date_to, "23:59") : "",
      min_price: min,
      max_price: max,
    });
    setPage(1);
    if (close) setExpanded(false);
  };
  return (
    <Page
      eyebrow={
        mode === "discover"
          ? "VENTI · CARTELERA"
          : mode === "organizer"
            ? "VENTI · PANEL DE ORGANIZADOR"
            : "VENTI · GESTIÓN GLOBAL"
      }
      title={
        mode === "discover"
          ? "Cartelera de Conciertos"
          : mode === "organizer"
            ? "Mis conciertos"
            : "Todos los conciertos"
      }
      subtitle={
        mode === "discover"
          ? "Explorá la cartelera completa en vivo y recibí recomendaciones personalizadas de Venti."
          : "Música en vivo. Experiencias que quedan."
      }
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
      {/* 1. FILTROS EN LA PARTE SUPERIOR DE LA PANTALLA */}
      <Card>
        <View style={styles.row}>
          <Field
            label="Buscar conciertos"
            placeholder="Nombre del show, artista o palabras clave..."
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
              <DateTimeField
                label="Fecha desde"
                mode="date"
                value={draft.date_from ?? ""}
                onChange={(v) => set("date_from", v)}
              />
              <DateTimeField
                label="Fecha hasta"
                mode="date"
                value={draft.date_to ?? ""}
                onChange={(v) => set("date_to", v)}
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

      {/* 2. RECOMENDACIONES DE VENTI INMEDIATAMENTE DEBAJO DE LOS FILTROS */}
      {mode === "discover" && recActive && recs.length > 0 && (
        <View style={{ gap: 12, marginTop: 12, marginBottom: 8 }}>
          <SectionHeader
            title="Recomendados para vos"
            subtitle="Sugerencias personalizadas de Venti basadas en tus entradas adquiridas."
            action={
              <Button
                title="Actualizar recomendaciones"
                secondary
                onPress={() => void recResource.reload()}
              />
            }
          />
          <BentoGrid>
            {recs.map((item, index) => (
              <ConcertCard
                key={`rec-${item.concert.id}`}
                concert={item.concert}
                reason={item.reason}
                featured={index === 0 && recs.length > 1}
              />
            ))}
          </BentoGrid>
        </View>
      )}

      {mode === "discover" && recsOff && (
        <Card variant="featured" style={{ marginTop: 12, marginBottom: 8 }}>
          <View style={styles.between}>
            <View style={{ gap: 2, flex: 1, paddingRight: 8 }}>
              <Copy strong>Recomendaciones personalizadas desactivadas</Copy>
              <Copy muted size="small">
                Podés activarlas en Mi cuenta para recibir sugerencias personalizadas de Venti Discover.
              </Copy>
            </View>
            <Button
              title="Ir a preferencias"
              secondary
              onPress={() => router.push("/profile")}
            />
          </View>
        </Card>
      )}

      {/* 3. RESTO DE LOS CONCIERTOS DISPONIBLES DEBAJO DE LAS RECOMENDACIONES */}
      {mode === "discover" && (
        <View style={{ marginTop: 12 }}>
          <SectionHeader
            title="Todos los conciertos en cartelera"
            subtitle="Explorá el catálogo completo y encontrá tu próximo show."
          />
        </View>
      )}
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
        skeleton="card"
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
