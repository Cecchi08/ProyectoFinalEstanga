import { Require } from "../../../src/components/layout/Shell";
import ConcertList from "../../../src/features/concerts/ConcertList";
export default function Screen() {
  return (
    <Require permissions={["concerts.manage_all"]}>
      <ConcertList mode="admin" />
    </Require>
  );
}
