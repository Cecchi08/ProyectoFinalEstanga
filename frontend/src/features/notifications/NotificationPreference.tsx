import { Switch } from 'react-native';
import { usePreferences } from '../../contexts/PreferencesContext';
import { Card, Copy, ResourceState } from '../../components/ui';
export default function NotificationPreference() {
  const preferences = usePreferences();
  return <Card>
    <Copy>Notificaciones opcionales</Copy>
    <ResourceState loading={preferences.loading || preferences.saving} error={preferences.error} retry={() => void preferences.reload()} />
    {preferences.notificationsEnabled !== null && <>
      <Switch accessibilityLabel="Notificaciones opcionales" value={preferences.notificationsEnabled}
        disabled={preferences.loading || preferences.saving} onValueChange={value => void preferences.setNotificationsEnabled(value)} />
      <Copy muted>{preferences.notificationsEnabled ? 'ON · Recibís avisos de Venti Discover.' : 'OFF · No se generan avisos de Venti Discover.'}</Copy>
      <Copy muted>Las confirmaciones y los cambios de conciertos con compras vigentes siempre se guardan aquí.</Copy>
    </>}
  </Card>;
}
