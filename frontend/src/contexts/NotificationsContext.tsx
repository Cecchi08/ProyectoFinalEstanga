// Contexto de notificaciones y badge flotante en la esquina inferior derecha del icono.
import { createContext, useContext, useEffect, useState, useCallback, useRef, type PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { api } from '../services/api';
import { subscribeDomains, subscribeUnreadEvents } from '../services/syncEngine';
import type { Notifications } from '../types/api';
import { colors } from '../components/ui';

// Contexto global compartido con el contador de notificaciones sin leer y función de recarga.
const Context = createContext({ unread: 0, reload: async () => {} });

// Proveedor que mantiene sincronizado el contador de notificaciones mediante el motor centralizado.
export function NotificationsProvider({ children }: PropsWithChildren) {
  const [unread, setUnread] = useState(0);
  const path = usePathname();
  // Secuencia para ignorar respuestas viejas ante recargas concurrentes.
  const sequence = useRef(0);
  // Consulta /notifications?limit=1 para obtener el unread_count actualizado.
  const reload = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await api.request<Notifications>('/notifications?limit=1');
      if (current === sequence.current) setUnread(result.data.unread_count);
    } catch { /* Conserva la última cantidad conocida en caso de error de red */ }
  }, []);
  // Recarga el contador al cambiar de ruta.
  useEffect(() => { void reload(); }, [path, reload]);
  // Suscripción centralizada a mutaciones locales y cambios remotos en notificaciones.
  useEffect(() => {
    const unsubUnread = subscribeUnreadEvents((ev) => {
      sequence.current++;
      if (ev.mode === 'set') setUnread(ev.value);
      else if (ev.mode === 'delta') setUnread((prev) => Math.max(0, prev + ev.delta));
      else void reload();
    });
    const unsubDomain = subscribeDomains(['notifications'], () => {
      void reload();
    });
    return () => { sequence.current++; unsubUnread(); unsubDomain(); };
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
