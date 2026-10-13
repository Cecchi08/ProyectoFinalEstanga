import { View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { Card, Copy, colors, money } from '../../components/ui';
import type { Statistics } from '../../types/api';
export default function StatisticsCharts({ data }: { data: Statistics }) {
  const days = data.sales_by_day.slice(-14);
  const max = Math.max(1, ...days.map(day => day.tickets_sold));
  const step = 600 / Math.max(1, days.length);
  return <>
    <Card>
      <Copy>Ventas por día (UTC)</Copy>
      <Copy muted>Últimos 14 días con ventas del período. Fecha de creación de la compra confirmada.</Copy>
      {days.length ? <>
        <View style={{ width: '100%', height: 240 }} accessibilityLabel="Gráfico de ventas por día">
          <Svg width="100%" height="100%" viewBox="0 0 640 240">
            {days.map((day, index) => {
              const height = day.tickets_sold / max * 165, x = 24 + index * step;
              return <Svg key={day.date}>
                <Rect x={x} y={190 - height} width={step * 0.65} height={height} fill={colors.accent} />
                <SvgText x={x + step * 0.325} y={180 - height} textAnchor="middle" fontSize={13} fill={colors.text}>{day.tickets_sold}</SvgText>
                <SvgText x={x + step * 0.325} y={212} textAnchor="middle" fontSize={11} fill={colors.muted}>{day.date.slice(5)}</SvgText>
              </Svg>;
            })}
          </Svg>
        </View>
        {days.map(day => <Copy key={day.date} muted>{day.date} · {day.tickets_sold} entradas · {money(day.revenue)}</Copy>)}
      </> : <Copy muted>Sin ventas en el período.</Copy>}
    </Card>
    <Card>
      <Copy>Entradas vendidas y utilizadas</Copy>
      <Svg width="100%" height={80} viewBox="0 0 600 80" accessibilityLabel={`${data.tickets_sold} vendidas, ${data.tickets_used} utilizadas`}>
        <Rect x={0} y={5} width={data.tickets_sold ? 600 : 0} height={25} fill={colors.accent} />
        <Rect x={0} y={45} width={data.tickets_sold ? Math.min(1, data.tickets_used / data.tickets_sold) * 600 : 0} height={25} fill={colors.good} />
      </Svg>
      <Copy>Vendidas: {data.tickets_sold} · Utilizadas: {data.tickets_used} · Pendientes: {data.tickets_pending}</Copy>
      <Copy muted>La ocupación compara ventas del período con el cupo actual de entradas.</Copy>
      <Copy>Ocupación: {data.occupancy_percent}% · Capacidad: {data.capacity}</Copy>
      <Svg width="100%" height={24} viewBox="0 0 600 24" accessibilityLabel={`Ocupación ${data.occupancy_percent}%`}>
        <Rect width={600} height={24} rx={6} fill={colors.border} />
        <Rect width={Math.min(100, data.occupancy_percent) * 6} height={24} rx={6} fill={colors.good} />
      </Svg>
    </Card>
  </>;
}
