import { Switch, View } from 'react-native';
import { usePreferences } from '../../contexts/PreferencesContext';
import { Card, Copy, ResourceState, styles, switchColors } from '../../components/ui';
export default function NotificationPreference() {
  const preferences = usePreferences();
  return <Card>
    <View style={styles.between}>
      <Copy size="subheading" weight="700">Notificaciones opcionales</Copy>
      {preferences.notificationsEnabled !== null && (
        <Switch {...switchColors} accessibilityLabel="Notificaciones opcionales" value={preferences.notificationsEnabled}
          disabled={preferences.loading || preferences.saving} onValueChange={value => void preferences.setNotificationsEnabled(value)} />
      )}
    </View>
    <ResourceState loading={preferences.loading || preferences.saving} error={preferences.error} retry={() => void preferences.reload()} />
    {preferences.notificationsEnabled !== null && <>
      <Copy muted size="small">{preferences.notificationsEnabled ? 'ON · Recibís avisos de Venti Discover.' : 'OFF · No se generan avisos de Venti Discover.'}</Copy>
      <Copy muted size="small">Las confirmaciones y los cambios de conciertos con compras vigentes siempre se guardan aquí.</Copy>
    </>}
  </Card>;
}
