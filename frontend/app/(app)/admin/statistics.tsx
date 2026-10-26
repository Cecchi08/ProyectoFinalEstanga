import { Require } from '../../../src/components/layout/Shell';
import StatisticsScreen from '../../../src/features/statistics/StatisticsScreen';
export default function Screen() {
  return (
    <Require permissions={['statistics.global']}>
      <StatisticsScreen global />
    </Require>
  );
}
