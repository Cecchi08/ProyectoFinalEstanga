import { Link } from "expo-router";
import { Page } from "../src/components/ui";
export default function NotFound() {
  return (
    <Page title="Página no encontrada">
      <Link href="/discover" style={{ color: "#ba9bff" }}>
        Volver a VENTI
      </Link>
    </Page>
  );
}
