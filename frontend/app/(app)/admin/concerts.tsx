import { Guard } from "../../../src/components/layout/Shell";
import { P } from "../../../src/constants/access";
import ConcertList from "../../../src/features/concerts/ConcertList";
export default function Screen() {
  return <Guard permissions={[P.concertsManageAll]}><ConcertList mode="admin" /></Guard>;
}
