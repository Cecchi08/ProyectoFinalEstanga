import { Require } from "../../../src/components/layout/Shell";
import { AuditScreen } from "../../../src/features/admin/UsersScreen";
export default function Screen() {
  return (
    <Require permissions={["users.manage"]}>
      <AuditScreen />
    </Require>
  );
}
