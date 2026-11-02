import { Link } from "expo-router";
import { Card, Copy, colors, Page } from "../src/components/ui";
export default function NotFound() {
  return (
    <Page title="Página no encontrada">
      <Card>
        <Copy muted>La ruta que buscás no existe o fue movida.</Copy>
        <Link href="/discover" style={{ color: colors.accentText, fontWeight: "700" }}>
          Volver a VENTI
        </Link>
      </Card>
    </Page>
  );
}
