import { View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { BentoGrid, Card, Copy, colors, money, styles, useBento } from '../../components/ui';
import type { Statistics } from '../../types/api';

export default function StatisticsCharts({ data }: { data: Statistics }) {
  const days = data.sales_by_day.slice(-14);
  const max = Math.max(1, ...days.map(day => day.tickets_sold));
  const step = 600 / Math.max(1, days.length);
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;

  return (
    <BentoGrid>
      <View style={bento.cell(1, cols)}>
        <Card style={{ flex: 1 }}>
          <View style={styles.between}>
            <Copy size="subheading" weight="700">Ventas por día (UTC)</Copy>
            <View style={styles.badge}>
              <Copy size="label" color={colors.accentText}>14 DÍAS</Copy>
            </View>
          </View>
          <Copy muted size="small">Últimos 14 días con ventas del período. Fecha de creación de la compra confirmada.</Copy>
          {days.length ? (
            <>
              <View style={{ width: '100%', height: 240, backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 8, borderWidth: 1, borderColor: colors.border }} accessibilityLabel="Gráfico de ventas por día">
                <Svg width="100%" height="100%" viewBox="0 0 640 240">
                  {days.map((day, index) => {
                    const height = Math.max(6, (day.tickets_sold / max) * 165);
                    const x = 24 + index * step;
                    return (
                      <Svg key={day.date}>
                        <Rect x={x} y={25} width={step * 0.65} height={165} rx={6} fill={colors.border} opacity={0.35} />
                        <Rect x={x} y={190 - height} width={step * 0.65} height={height} rx={6} fill={colors.accent} />
                        <SvgText x={x + step * 0.325} y={180 - height} textAnchor="middle" fontSize={13} fontWeight="700" fill={colors.text}>{day.tickets_sold}</SvgText>
                        <SvgText x={x + step * 0.325} y={214} textAnchor="middle" fontSize={11} fill={colors.muted}>{day.date.slice(5)}</SvgText>
                      </Svg>
                    );
                  })}
                </Svg>
              </View>
              <View style={{ gap: 6 }}>
                {days.map(day => (
                  <View key={day.date} style={[styles.between, { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <Copy muted size="small">{day.date} · {day.tickets_sold} entradas · {money(day.revenue)}</Copy>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Copy muted>Sin ventas en el período.</Copy>
          )}
        </Card>
      </View>

      <View style={bento.cell(1, cols)}>
        <Card style={{ flex: 1 }}>
          <View style={styles.between}>
            <Copy size="subheading" weight="700">Entradas vendidas y utilizadas</Copy>
            <View style={styles.badgeMuted}>
              <Copy size="label" muted>{data.occupancy_percent}% OCUPACIÓN</Copy>
            </View>
          </View>
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
            <Svg width="100%" height={80} viewBox="0 0 600 80" accessibilityLabel={`${data.tickets_sold} vendidas, ${data.tickets_used} utilizadas`}>
              <Rect x={0} y={8} width={600} height={22} rx={8} fill={colors.border} opacity={0.45} />
              <Rect x={0} y={8} width={data.tickets_sold ? 600 : 0} height={22} rx={8} fill={colors.accent} />
              <Rect x={0} y={48} width={600} height={22} rx={8} fill={colors.border} opacity={0.45} />
              <Rect x={0} y={48} width={data.tickets_sold ? Math.min(1, data.tickets_used / data.tickets_sold) * 600 : 0} height={22} rx={8} fill={colors.success} />
            </Svg>
            <Copy size="small" weight="600">Vendidas: {data.tickets_sold} · Utilizadas: {data.tickets_used} · Pendientes: {data.tickets_pending}</Copy>
          </View>
          <Copy muted size="small">La ocupación compara ventas del período con el cupo actual de entradas.</Copy>
          <View style={styles.between}>
            <Copy weight="600">Ocupación: {data.occupancy_percent}% · Capacidad: {data.capacity}</Copy>
          </View>
          <Svg width="100%" height={24} viewBox="0 0 600 24" accessibilityLabel={`Ocupación ${data.occupancy_percent}%`}>
            <Rect width={600} height={24} rx={8} fill={colors.border} />
            <Rect width={Math.min(100, data.occupancy_percent) * 6} height={24} rx={8} fill={colors.success} />
          </Svg>
        </Card>
      </View>
    </BentoGrid>
  );
}
