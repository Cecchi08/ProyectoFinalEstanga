import { useAuth } from '../../../src/contexts/AuthContext';
import { Page, Copy } from '../../../src/components/ui';
import StatisticsScreen from '../../../src/features/statistics/StatisticsScreen';
// GET /organizer/statistics requires statistics.own and always filters by the signed-in organizer.
export default function Screen() {
  const { can } = useAuth();
  return can('statistics.own') ? <StatisticsScreen /> : <Page title="Sin permiso"><Copy>Necesitás el perfil ORGANIZADOR para ver estadísticas de tus conciertos.</Copy></Page>;
}
