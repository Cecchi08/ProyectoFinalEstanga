export { default } from "../src/components/layout/Root";
import type { ErrorBoundaryProps } from "expo-router";
import { Button, Card, Copy, Page } from "../src/components/ui";

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Page title="No pudimos mostrar esta pantalla">
      <Card>
        <Copy>Ocurrió un problema. Intentá abrirla nuevamente.</Copy>
        <Button title="Reintentar" onPress={() => void retry()} />
      </Card>
    </Page>
  );
}
