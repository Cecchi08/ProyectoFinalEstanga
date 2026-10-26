import { Guard } from "../../../src/components/layout/Shell";
import { ADMIN_PERMISSIONS } from "../../../src/constants/access";
// Any admin capability opens the section; every screen below checks its own permission.
export default function Layout() {
  return <Guard permissions={ADMIN_PERMISSIONS} />;
}
