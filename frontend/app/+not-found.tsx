import { Link } from "expo-router";
import { colors, Page } from "../src/components/ui";
export default function NotFound() {
  return (
    <Page title="Página no encontrada">
      <Link href="/discover" style={{ color: colors.accent, fontWeight: "600" }}>
        Volver a VENTI
      </Link>
    </Page>
  );
}
