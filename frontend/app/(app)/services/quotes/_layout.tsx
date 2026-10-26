import { Guard } from "../../../../src/components/layout/Shell";
// Same gate as GET /services/quotes.
export default function Layout() {
  return <Guard permissions={["services.quotes.request", "services.quotes.respond", "services.admin"]} />;
}
