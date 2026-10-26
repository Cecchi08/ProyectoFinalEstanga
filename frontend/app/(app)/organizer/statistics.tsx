import { useAuth } from '../../../src/contexts/AuthContext';
import { Page, Copy } from '../../../src/components/ui';
import StatisticsScreen from '../../../src/features/statistics/StatisticsScreen';
export default function Screen() {
  const { roles } = useAuth();
  return roles.includes('ORGANIZER') ? <StatisticsScreen /> : <Page title="Sin permiso"><Copy>Se requiere el rol Organizer.</Copy></Page>;
}
