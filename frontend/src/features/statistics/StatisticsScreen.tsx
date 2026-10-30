import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, Copy, Field, Page, ResourceState, money, styles } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { query } from '../../services/http';
import type { Statistics } from '../../types/api';
import StatisticsCharts from './StatisticsCharts';
export default function StatisticsScreen({ global = false }: { global?: boolean }) {
  const params = useLocalSearchParams<{ concert_id?: string }>();
  const [draft, setDraft] = useState({ from: '', to: '', concert_id: typeof params.concert_id === 'string' ? params.concert_id : '' });
  const [filters, setFilters] = useState(draft);
  const resource = useResource<Statistics>(`${global ? '/admin' : '/organizer'}/statistics${query(filters)}`);
  const data = resource.result?.data;
  return <Page title={global ? 'Estadísticas globales' : 'Mis estadísticas'} subtitle={global ? 'Actividad de VENTI' : 'Ventas y asistencia de tus conciertos'}>
    <Card>
      <View style={styles.row}>
        <Field label="Desde (AAAA-MM-DD)" value={draft.from} onChangeText={from => setDraft({ ...draft, from })} />
        <Field label="Hasta (AAAA-MM-DD)" value={draft.to} onChangeText={to => setDraft({ ...draft, to })} />
        <Field label="ID de concierto (opcional)" value={draft.concert_id} keyboardType="number-pad" onChangeText={concert_id => setDraft({ ...draft, concert_id })} />
      </View>
      <View style={styles.row}>
        <Button title="Aplicar filtros" onPress={() => setFilters({ from: draft.from.trim(), to: draft.to.trim(), concert_id: draft.concert_id.trim() })} />
        <Button title="Limpiar filtros" secondary onPress={() => { const empty = { from: '', to: '', concert_id: '' }; setDraft(empty); setFilters(empty); }} />
        <Button title="Actualizar estadísticas" secondary onPress={() => void resource.reload()} />
      </View>
      <Copy muted>Las fechas filtran compras, inclusive y en UTC. Usuarios, conciertos y capacidad reflejan el estado actual.</Copy>
    </Card>
    <ResourceState {...resource} retry={() => void resource.reload()} />
    {data && <>
      {!data.tickets_sold && <Copy muted>No hay ventas confirmadas en este período.</Copy>}
      <View style={[styles.row, { alignItems: 'stretch' }]}>
        {[
          ['Entradas vendidas', data.tickets_sold], ['Recaudación', money(data.revenue)], ['Asistentes (ingresos)', data.attendees],
          ['Tickets utilizados', data.tickets_used], ['Tickets pendientes', data.tickets_pending], ['Capacidad', data.capacity],
          ['Ocupación', `${data.occupancy_percent}%`], ['Conciertos activos', data.active_concerts],
          ...(global ? [['Usuarios', data.users ?? 0], ['Organizadores', data.organizers ?? 0]] : []),
        ].map(([label, value]) => <View key={label} style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: 220 }}><Card><Copy muted>{label}</Copy><Copy>{value}</Copy></Card></View>)}
      </View>
      <StatisticsCharts data={data} />
      <Card><Copy>Actividad de compras</Copy>
        {data.activity.length ? data.activity.map(item => <Copy key={item.status}>{item.status}: {item.purchases}</Copy>) : <Copy muted>Sin actividad en el período.</Copy>}
      </Card>
    </>}
  </Page>;
}
