import { Require } from "../../../src/components/layout/Shell";
import OrganizationsScreen from "../../../src/features/admin/OrganizationsScreen";
export default function Screen() {
  return (
    <Require permissions={["users.manage", "marketplace.admin"]}>
      <OrganizationsScreen />
    </Require>
  );
}
