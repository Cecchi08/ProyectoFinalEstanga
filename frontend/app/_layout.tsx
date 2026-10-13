export { default } from "../src/components/layout/Root";
import type { ErrorBoundaryProps } from "expo-router";
import { Button, Copy, Page } from "../src/components/ui";

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Page title="No pudimos mostrar esta pantalla">
      <Copy>Ocurrió un problema. Intentá abrirla nuevamente.</Copy>
      <Button title="Reintentar" onPress={() => void retry()} />
    </Page>
  );
}
