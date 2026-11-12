// Redirección de compatibilidad para evitar rutas huérfanas hacia la Cartelera única.
import { Redirect } from "expo-router";
export default function DiscoverRedirect() {
  return <Redirect href="/cartelera" />;
}
