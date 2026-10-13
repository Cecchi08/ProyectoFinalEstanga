import { createContext, useContext, useEffect, useState, useCallback, useRef, type PropsWithChildren } from 'react';
import { AppState, Text } from 'react-native';
import { usePathname } from 'expo-router';
import { api } from '../services/api';
import type { Notifications } from '../types/api';

const Context = createContext({ unread: 0, reload: async () => {} });
export function NotificationsProvider({ children }: PropsWithChildren) {
  const [unread, setUnread] = useState(0);
  const path = usePathname();
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await api.request<Notifications>('/notifications?limit=1');
      if (current === sequence.current) setUnread(result.data.unread_count);
    } catch { /* The inbox displays errors and retry; retain the last known badge. */ }
  }, []);
  useEffect(() => { void reload(); }, [path, reload]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') void reload(); }, 60000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void reload(); });
    return () => { sequence.current++; clearInterval(timer); listener.remove(); };
  }, [reload]);
  return <Context.Provider value={{ unread, reload }}>{children}</Context.Provider>;
}
export const useNotifications = () => useContext(Context);
export function NotificationBadge() {
  const { unread } = useNotifications();
  return unread ? <Text accessibilityLabel={`${unread} sin leer`}> ({unread})</Text> : null;
}
