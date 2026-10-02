import { router } from "expo-router";
import { View } from "react-native";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useResource } from "../../hooks/useResource";
import {
  Button,
  Card,
  Copy,
  Page,
  ResourceState,
  styles,
} from "../../components/ui";
import { ConcertCard } from "../concerts/ConcertList";
import type { Concert } from "../../types/api";

interface Recommendations {
  enabled: boolean;
  recommendations: { concert: Concert; reason: string }[];
}
export default function DiscoverScreen() {
  const preferences = usePreferences();
  const active =
    preferences.enabled === true && !preferences.loading && !preferences.saving;
  const resource = useResource<Recommendations>(
    active ? "/recommendations" : null,
  );
  const off =
    preferences.enabled === false ||
    (active && resource.result?.data.enabled === false);
  return (
    <Page
      title="Venti Discover"
      subtitle="Conciertos para vos, a partir de tus entradas y favoritos."
    >
      <ResourceState
        loading={preferences.loading || preferences.saving}
        error={preferences.error}
        retry={() => void preferences.reload()}
      />
      {off && (
        <Card>
          <Copy>Las recomendaciones personalizadas están desactivadas.</Copy>
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
          <Button
            title="Actualizar recomendaciones"
            secondary
            onPress={() => void resource.reload()}
          />
          <ResourceState
            {...resource}
            empty={resource.result?.data.recommendations.length === 0}
            retry={() => void resource.reload()}
          />
          <View style={[styles.row, { alignItems: "stretch" }]}>
            {resource.result?.data.recommendations.map((item) => (
              <ConcertCard
                key={item.concert.id}
                concert={item.concert}
                reason={item.reason}
              />
            ))}
          </View>
        </>
      )}
      <Button
        title="Explorar todos los conciertos"
        secondary
        onPress={() => router.push("/discover")}
      />
    </Page>
  );
}
