import { Guard } from "../../../src/components/layout/Shell";
export default function Layout() {
  return <Guard permissions={["users.manage", "catalogs.manage", "statistics.global", "marketplace.admin", "services.admin"]} />;
}
