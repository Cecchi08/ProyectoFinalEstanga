import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { primaryRole, ROLE_GUIDES, type SelfProfiles } from "../../types/api";
import {
  BentoGrid,
  Button,
  Card,
  Copy,
  Page,
  ResourceState,
  colors,
  styles,
  useBento,
} from "../../components/ui";
export default function ProfilesScreen() {
  const auth = useAuth();
  const resource = useResource<SelfProfiles>("/me/profiles");
  const profiles = resource.result?.data;
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;
  const activeRole = primaryRole(profiles?.roles ?? auth.roles);
  const guide = activeRole !== "GUEST" ? ROLE_GUIDES[activeRole] : null;

  return (
    <Page
      title="Tu perfil"
      subtitle="Tu cuenta en Venti se adapta a la actividad que querés ejercer."
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {profiles && (
        <BentoGrid>
          <View style={bento.cell(cols, cols)}>
            <Card variant="featured">
              <View style={styles.between}>
                <Copy size="subheading" weight="700">Perfil activo</Copy>
                <View style={styles.badge}>
                  <Copy size="label" color={colors.accentText}>CUENTA</Copy>
                </View>
              </View>
              {guide ? (
                <>
                  <Copy weight="600">{guide.subtitle}</Copy>
                  <Copy muted>{guide.allows}</Copy>
                </>
              ) : (
                <Copy muted>Perfil de tu cuenta.</Copy>
              )}
            </Card>
          </View>
        </BentoGrid>
      )}
      <Button title="Volver a mi cuenta" secondary onPress={() => router.back()} />
    </Page>
  );
}
