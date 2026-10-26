import { Guard } from "../../../../src/components/layout/Shell";
// Same gate as GET /marketplace/quotes.
export default function Layout() {
  return <Guard permissions={["marketplace.quotes.request", "marketplace.quotes.respond", "marketplace.admin"]} />;
}
