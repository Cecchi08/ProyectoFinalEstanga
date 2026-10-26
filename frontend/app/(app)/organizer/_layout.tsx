import { Guard } from "../../../src/components/layout/Shell";
export default function Layout() {
  return <Guard permissions={["concerts.manage", "concerts.manage_all"]} />;
}
