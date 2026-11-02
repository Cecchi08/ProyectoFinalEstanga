import { router } from "expo-router";
import { useEffect } from "react";
import { useNotifications } from "../../contexts/NotificationsContext";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useResource } from "../../hooks/useResource";
import {
  BentoGrid,
  Button,
  Card,
  Copy,
  Page,
  ResourceState,
} from "../../components/ui";
import { ConcertCard } from "../concerts/ConcertList";
import type { Concert } from "../../types/api";

interface Recommendations {
  enabled: boolean;
  recommendations: { concert: Concert; reason: string }[];
}

export default function DiscoverScreen() {
  const { reload: reloadNotifications } = useNotifications();
  const preferences = usePreferences();
  const active =
    preferences.enabled === true && !preferences.loading && !preferences.saving;
  const resource = useResource<Recommendations>(
    active ? "/recommendations" : null,
  );
  const off =
    preferences.enabled === false ||
    (active && resource.result?.data.enabled === false);
  useEffect(() => {
    if (resource.result) void reloadNotifications();
  }, [resource.result, reloadNotifications]);
  return (
    <Page
      eyebrow="VENTI · MOTOR DE DESCUBRIMIENTO"
      title="Venti Discover"
      subtitle="Conciertos para vos, a partir de tus entradas."
      actions={
        <>
          {active && !off && (
            <Button
              title="Actualizar recomendaciones"
              secondary
              onPress={() => void resource.reload()}
            />
          )}
          <Button
            title="Explorar todos los conciertos"
            secondary
            onPress={() => router.push("/discover")}
          />
        </>
      }
    >
      <ResourceState
        loading={preferences.loading || preferences.saving}
        error={preferences.error}
        retry={() => void preferences.reload()}
      />
      {off && (
        <Card variant="featured">
          <Copy strong>Las recomendaciones personalizadas están desactivadas.</Copy>
          <Copy muted>
            Podés activarlas desde Mi cuenta. La búsqueda de conciertos sigue
            disponible.
          </Copy>
          <Button
            title="Ir a preferencias"
            secondary
            onPress={() => router.push("/profile")}
          />
        </Card>
      )}
      {active && !off && (
        <>
          <ResourceState
            {...resource}
            empty={resource.result?.data.recommendations.length === 0}
            retry={() => void resource.reload()}
          />
          <BentoGrid>
            {resource.result?.data.recommendations.map((item, index) => (
              <ConcertCard
                key={item.concert.id}
                concert={item.concert}
                reason={item.reason}
                featured={index === 0 && (resource.result?.data.recommendations.length ?? 0) > 1}
              />
            ))}
          </BentoGrid>
        </>
      )}
    </Page>
  );
}
