import { Require } from "../../../src/components/layout/Shell";
import PromotionsAdminScreen from "../../../src/features/admin/PromotionsAdminScreen";

export default function Screen() {
  return (
    <Require permissions={["orders.read_all", "catalogs.manage"]}>
      <PromotionsAdminScreen />
    </Require>
  );
}

