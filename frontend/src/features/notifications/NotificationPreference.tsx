import { Switch, Text, View } from "react-native";
import { usePreferences } from "../../contexts/PreferencesContext";
import { Card, Copy, ResourceState, colors, radius, styles, switchColors } from "../../components/ui";

export default function NotificationPreference() {
  const preferences = usePreferences();
  return (
    <Card>
      <View style={styles.between}>
        <View style={{ gap: 2, flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text aria-hidden style={{ fontSize: 16 }}>🔔</Text>
            <Copy size="subheading" weight="700">Notificaciones de eventos</Copy>
          </View>
          <Copy muted size="small">
            Alertas sobre nuevos conciertos y novedades de artistas seguidos.
          </Copy>
        </View>
        {preferences.notificationsEnabled !== null && (
          <Switch
            {...switchColors}
            accessibilityLabel="Notificaciones opcionales"
            value={preferences.notificationsEnabled}
            disabled={preferences.loading || preferences.saving}
            onValueChange={(value) => void preferences.setNotificationsEnabled(value)}
          />
        )}
      </View>
      <ResourceState
        loading={preferences.loading || preferences.saving}
        error={preferences.error}
        retry={() => void preferences.reload()}
      />
      {preferences.notificationsEnabled !== null && (
        <View style={{ gap: 6, marginTop: 4 }}>
          <View
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: radius.sm,
              backgroundColor: preferences.notificationsEnabled ? colors.accentSoft : colors.surfaceAlt,
              borderWidth: 1,
              borderColor: preferences.notificationsEnabled ? colors.accentBorder : colors.border,
            }}
          >
            <Copy size="small" weight={preferences.notificationsEnabled ? "700" : "500"} color={preferences.notificationsEnabled ? colors.accentText : colors.muted}>
              {preferences.notificationsEnabled
                ? "✓ ACTIVADO · Recibís avisos y novedades de Venti Discover."
                : "✕ DESACTIVADO · No se generan avisos promocionales de Venti Discover."}
            </Copy>
          </View>
          <Copy muted size="small">
            Nota: las confirmaciones de compra y avisos críticos de conciertos adquiridos se entregan siempre.
          </Copy>
        </View>
      )}
    </Card>
  );
}
