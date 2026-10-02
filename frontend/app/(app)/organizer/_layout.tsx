import { Guard } from "../../../src/components/layout/Shell";
export default function Layout() {
  return <Guard roles={["ORGANIZER", "ADMIN"]} />;
}
