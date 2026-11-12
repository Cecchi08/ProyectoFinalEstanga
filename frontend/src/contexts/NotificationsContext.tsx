// Contexto de notificaciones y badge flotante en la esquina inferior derecha del icono.
import { createContext, useContext, useEffect, useState, useCallback, useRef, type PropsWithChildren } from 'react';
import { AppState, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { api } from '../services/api';
import type { Notifications } from '../types/api';
import { colors } from '../components/ui';

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
    } catch { /* Conserva la última cantidad conocida en caso de error de red */ }
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

// Insignia flotante ubicada en la esquina inferior derecha del icono sin deformarlo.
export function NotificationBadge() {
  const { unread } = useNotifications();
  if (!unread || unread <= 0) return null;

  // Formato compacto para números mayores a 9
  const label = unread > 9 ? "9+" : String(unread);

  return (
    <View
      aria-hidden
      style={{
        position: 'absolute',
        bottom: -5,
        right: -7,
        minWidth: 16,
        height: 16,
        paddingHorizontal: 3,
        borderRadius: 8,
        backgroundColor: colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: colors.surface,
        zIndex: 5,
      }}
    >
      <Text
        style={{
          color: colors.onDanger,
          fontSize: 9,
          fontWeight: '800',
          lineHeight: 11,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
