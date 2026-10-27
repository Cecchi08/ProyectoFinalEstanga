import { useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { ActionFeedback, Button, Card, Copy, Page, Pager, ResourceState, dateLabel, styles, useAction } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { useNotifications } from '../../contexts/NotificationsContext';
import { api } from '../../services/api';
import type { Notifications } from '../../types/api';
import NotificationPreference from './NotificationPreference';
export default function NotificationsScreen() {
  const [page, setPage] = useState(1);
  const resource = useResource<Notifications>(`/notifications?page=${page}`);
  const badge = useNotifications(); const action = useAction();
  useFocusEffect(useCallback(() => { void resource.reload(); }, [resource.reload]));
  const read = (id?: string) => action.run(async () => {
    await api.request(id ? `/notifications/${id}/read` : '/notifications/read-all', { method: 'PATCH' });
    await Promise.all([resource.reload(), badge.reload()]);
  });
  return <Page title="Notificaciones">
    <NotificationPreference />
    <View style={styles.row}>
      <Copy>{resource.result?.data.unread_count ?? badge.unread} sin leer</Copy>
      <Button title="Marcar todas como leídas" disabled={action.busy || !resource.result?.data.unread_count} onPress={() => void read()} />
      <Button title="Actualizar" secondary onPress={() => { void resource.reload(); void badge.reload(); }} />
    </View>
    <ActionFeedback action={action} />
    <ResourceState {...resource} empty={!resource.result?.data.items.length} retry={() => void resource.reload()} />
    {resource.result?.data.items.map(item => <Card key={item.id}>
      <Copy>{item.read_at ? 'Leída' : '● Sin leer'} · {dateLabel(item.created_at)}</Copy>
      <Copy>{item.title}</Copy><Copy muted>{item.message}</Copy>
      <View style={styles.row}>
        {!item.read_at && <Button title={`Marcar como leída: ${item.title}`} secondary disabled={action.busy} onPress={() => void read(item.id)} />}
        {item.purchase_id ? <Button title="Ver compra" onPress={() => router.push(`/purchases/${item.purchase_id}`)} /> :
          item.concert_id && item.concert_status === 'PUBLISHED' ? <Button title="Ver concierto" onPress={() => router.push(`/concerts/${item.concert_id}`)} /> : null}
        {/* Marketplace events carry the space quote or reservation; the detail checks access for either side. */}
        {item.reservation_id && <Button title="Ver reserva" onPress={() => router.push(`/marketplace/reservations/${item.reservation_id}`)} />}
        {item.quote_id && <Button title="Ver presupuesto" onPress={() => router.push(`/marketplace/quotes/${item.quote_id}`)} />}
        {item.service_quote_id && <Button title="Ver cotización" onPress={() => router.push(`/services/quotes/${item.service_quote_id}`)} />}
      </View>
    </Card>)}
    <Pager pagination={resource.result?.pagination} onPage={setPage} />
  </Page>;
}
