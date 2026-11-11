import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { ActionFeedback, BentoGrid, Button, Card, Copy, Page, Pager, ResourceState, colors, dateLabel, styles, useAction, useBento } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { useNotifications } from '../../contexts/NotificationsContext';
import { api } from '../../services/api';
import type { Notification, Notifications } from '../../types/api';
import { notificationTarget } from '../../utils/notificationTarget';
import NotificationPreference from './NotificationPreference';
export default function NotificationsScreen() {
  const [page, setPage] = useState(1);
  const resource = useResource<Notifications>(`/notifications?page=${page}`);
  const badge = useNotifications(); const action = useAction();
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;

  useFocusEffect(useCallback(() => { void resource.reload(); }, [resource.reload]));
  const read = (id?: string) => action.run(async () => {
    await api.request(id ? `/notifications/${id}/read` : '/notifications/read-all', { method: 'POST' });
    await Promise.all([resource.reload(), badge.reload()]);
  });
  // Each notification opens the exact resource it announces; the detail screen asks the API again,
  // so access is checked server-side and the current state is shown. Opening it also marks it as read.
  const open = (item: Notification, path: string) => {
    if (!item.read_at) void api.request(`/notifications/${item.id}/read`, { method: 'POST' }).then(() => badge.reload()).catch(() => undefined);
    router.push(path);
  };
  const target = (item: Notification): { title: string; path: string } | null => notificationTarget(item);
  return <Page title="Notificaciones" subtitle="Avisos de entradas, reservas, presupuestos, contrataciones y recomendaciones.">
    <NotificationPreference />
    <Card variant="subtle">
      <View style={styles.between}>
        <View style={styles.row}>
          <View style={styles.badge}>
            <Copy size="label" color={colors.accentText}>BANDEJA</Copy>
          </View>
          <Copy weight="700">{resource.result?.data.unread_count ?? badge.unread} sin leer</Copy>
        </View>
        <View style={styles.row}>
          <Button title="Marcar todas como leídas" disabled={action.busy || !resource.result?.data.unread_count} onPress={() => void read()} />
          <Button title="Actualizar" secondary onPress={() => { void resource.reload(); void badge.reload(); }} />
        </View>
      </View>
    </Card>
    <ActionFeedback action={action} />
    <ResourceState {...resource} empty={!resource.result?.data.items.length} retry={() => void resource.reload()} />
    <BentoGrid>
      {resource.result?.data.items.map(item => (
        <View key={item.id} style={bento.cell(1, cols)}>
          <Card variant={item.read_at ? "default" : "featured"} style={{ flex: 1, justifyContent: "space-between" }}>
            <View style={{ gap: 6 }}>
              <Copy size="small" color={item.read_at ? colors.muted : colors.accentText} weight="600">
                {item.read_at ? 'Leída' : '● Sin leer'} · {dateLabel(item.created_at)}
              </Copy>
              <Copy size="subheading" weight="700">{item.title}</Copy>
              <Copy muted size="small">{item.message}</Copy>
              {(item.sender_name || item.entity_label) && (
                <Copy muted size="small">
                  {[
                    item.sender_name ? `De: ${item.sender_name}` : null,
                    item.entity_label ? `Ref.: ${item.entity_label}` : null,
                  ].filter(Boolean).join(' · ')}
                </Copy>
              )}
            </View>
            <View style={styles.row}>
              {(() => { const t = target(item); return t ? <Button title={t.title} onPress={() => open(item, t.path)} /> : null; })()}
              {/* A reservation born from a quote also links its quote. */}
              {item.reservation_id && item.quote_id && <Button title="Ver presupuesto" secondary onPress={() => open(item, `/marketplace/quotes/${item.quote_id}`)} />}
              {!item.read_at && <Button title="Marcar como leída" secondary disabled={action.busy} onPress={() => void read(item.id)} />}
            </View>
          </Card>
        </View>
      ))}
    </BentoGrid>
    <Pager pagination={resource.result?.pagination} onPage={setPage} />
  </Page>;
}
