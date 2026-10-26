import { Slot } from "expo-router";
// Any signed-in user may open it: the backend only lists concerts assigned in concert_staff (or all, for ADMIN).
export default function Layout() {
  return <Slot />;
}
