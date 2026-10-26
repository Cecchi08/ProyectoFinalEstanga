import { Guard } from "../../../src/components/layout/Shell";
export default function Layout() {
  return <Guard permissions={["artist.profile.manage", "artists.admin"]} />;
}
