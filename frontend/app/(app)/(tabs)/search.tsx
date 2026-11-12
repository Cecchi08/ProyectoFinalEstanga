// Redirección de compatibilidad para evitar rutas huérfanas hacia la Cartelera única.
import { Redirect } from "expo-router";
export default function SearchRedirect() {
  return <Redirect href="/cartelera" />;
}
