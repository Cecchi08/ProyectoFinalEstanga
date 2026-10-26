import { Guard } from "../../../../src/components/layout/Shell";
// Same gate as GET /marketplace/reservations.
export default function Layout() {
  return <Guard permissions={["marketplace.reservations.create", "marketplace.reservations.manage", "marketplace.admin"]} />;
}
