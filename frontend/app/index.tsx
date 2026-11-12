// Redirección inicial hacia la Cartelera principal de conciertos.
import { Redirect } from "expo-router";
export default function Index() {
  return <Redirect href="/cartelera" />;
}
