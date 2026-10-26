import { Guard } from "../../../src/components/layout/Shell";
import { P } from "../../../src/constants/access";
import StatisticsScreen from '../../../src/features/statistics/StatisticsScreen';
export default function Screen() { return <Guard permissions={[P.statisticsGlobal]}><StatisticsScreen global /></Guard>; }
