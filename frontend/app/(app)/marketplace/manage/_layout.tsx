import { Guard } from "../../../../src/components/layout/Shell";
export default function Layout() {
  return <Guard permissions={["marketplace.establishments.manage", "marketplace.admin"]} />;
}
