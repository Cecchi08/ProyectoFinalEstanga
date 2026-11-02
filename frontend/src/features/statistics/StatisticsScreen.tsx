import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import {
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  Page,
  ResourceState,
  SectionHeader,
  StatTile,
  money,
  statusLabel,
  styles,
} from "../../components/ui";
import { Select } from "../../components/ui/Select";
import { useResource } from "../../hooks/useResource";
import { query } from "../../services/http";
import type { Statistics } from "../../types/api";
import StatisticsCharts from "./StatisticsCharts";

export default function StatisticsScreen({ global = false }: { global?: boolean }) {
  const params = useLocalSearchParams<{ concert_id?: string }>();
  const [draft, setDraft] = useState({
    from: "",
    to: "",
    concert_id: typeof params.concert_id === "string" ? params.concert_id : "",
  });
  const [filters, setFilters] = useState(draft);
  const resource = useResource<Statistics>(
    `${global ? "/admin" : "/organizer"}/statistics${query(filters)}`,
  );
  const data = resource.result?.data;
  return (
    <Page
      eyebrow={global ? "VENTI · ANALÍTICA DE PLATAFORMA" : "VENTI · ANALÍTICA DE ORGANIZADOR"}
      title={global ? "Estadísticas globales" : "Mis estadísticas"}
      subtitle={global ? "Actividad de VENTI" : "Ventas y asistencia de tus conciertos"}
      actions={
        <Button
          title="Actualizar estadísticas"
          secondary
          onPress={() => void resource.reload()}
        />
      }
    >
      <Card>
        <View style={styles.row}>
          <Field
            label="Desde (AAAA-MM-DD)"
            value={draft.from}
            onChangeText={(from) => setDraft({ ...draft, from })}
          />
          <Field
            label="Hasta (AAAA-MM-DD)"
            value={draft.to}
            onChangeText={(to) => setDraft({ ...draft, to })}
          />
          <Select
            label="Concierto (opcional)"
            path={global ? "/concerts" : "/concerts?mine=true"}
            values={draft.concert_id ? [draft.concert_id] : []}
            onChange={(values) => setDraft({ ...draft, concert_id: values[0] ?? "" })}
          />
        </View>
        <View style={styles.row}>
          <Button
            title="Aplicar filtros"
            onPress={() =>
              setFilters({
                from: draft.from.trim(),
                to: draft.to.trim(),
                concert_id: draft.concert_id.trim(),
              })
            }
          />
          <Button
            title="Limpiar filtros"
            secondary
            onPress={() => {
              const empty = { from: "", to: "", concert_id: "" };
              setDraft(empty);
              setFilters(empty);
            }}
          />
        </View>
        <Copy muted>
          Las fechas filtran compras, inclusive y en UTC. Usuarios, conciertos y capacidad reflejan el estado actual.
        </Copy>
      </Card>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {data && (
        <>
          {!data.tickets_sold && (
            <Card variant="subtle">
              <Copy muted>No hay ventas confirmadas en este período.</Copy>
            </Card>
          )}
          <BentoGrid>
            {(
              [
                ["Recaudación", money(data.revenue), true],
                ["Entradas vendidas", data.tickets_sold, true],
                ["Asistentes (ingresos)", data.attendees, false],
                ["Tickets utilizados", data.tickets_used, false],
                ["Tickets pendientes", data.tickets_pending, false],
                ["Capacidad", data.capacity, false],
                ["Ocupación", `${data.occupancy_percent}%`, false],
                ["Conciertos activos", data.active_concerts, false],
                ...(global
                  ? ([
                      ["Usuarios", data.users ?? 0, false],
                      ["Organizadores", data.organizers ?? 0, false],
                    ] as const)
                  : []),
              ] as const
            ).map(([label, value, featured]) => (
              <StatTile
                key={label}
                label={label}
                value={value}
                featured={featured}
              />
            ))}
          </BentoGrid>
          <StatisticsCharts data={data} />
          <Card variant="subtle">
            <SectionHeader title="Actividad de compras" />
            {data.activity.length ? (
              <View style={styles.row}>
                {data.activity.map((item) => (
                  <Copy key={item.status} strong>
                    {statusLabel(item.status)}: {item.purchases}
                  </Copy>
                ))}
              </View>
            ) : (
              <Copy muted>Sin actividad en el período.</Copy>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}
