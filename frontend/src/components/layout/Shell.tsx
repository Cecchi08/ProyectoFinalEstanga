import { Redirect, Slot, router, usePathname } from "expo-router";
import type { PropsWithChildren } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../contexts/AuthContext";
import { PreferencesProvider } from "../../contexts/PreferencesContext";
import { NotificationsProvider, NotificationBadge } from "../../contexts/NotificationsContext";
import { useResource } from "../../hooks/useResource";
import { ADMIN_PERMISSIONS, P, can, type Permission } from "../../constants/access";
import type { Concert } from "../../types/api";
import { colors, Copy, Page, ResourceState } from "../ui";
// Waits for GET /auth/me before deciding, so a reload never flashes "Sin permiso" nor shows a forbidden screen.
export function Guard({ permissions, children }: PropsWithChildren<{ permissions: readonly Permission[] }>) {
  const auth = useAuth();
  if (auth.accessError)
    return (
      <Page title="VENTI">
        <ResourceState loading={false} error={auth.accessError} retry={auth.refreshAccess} />
      </Page>
    );
  if (auth.accessLoading)
    return (
      <Page title="VENTI">
        <ResourceState loading error="" retry={() => {}} />
      </Page>
    );
  return can(auth.permissions, permissions) ? (
    <>{children ?? <Slot />}</>
  ) : (
    <Page title="Sin permiso">
      <Copy>Tu cuenta no tiene acceso a esta sección.</Copy>
    </Page>
  );
}
export default function Shell() {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const path = usePathname();
  // Staff is a per-concert assignment: the tab shows for global validators or users with at least one assignment.
  const validator = can(auth.permissions, P.ticketsValidate);
  const assignments = useResource<Concert[]>(auth.user && !auth.accessLoading && !validator ? "/staff/assignments?limit=1" : null);
  const staff = validator || Boolean(assignments.result?.pagination?.total);
  if (auth.loading)
    return (
      <Page title="VENTI">
        <ResourceState loading error="" retry={() => {}} />
      </Page>
    );
  if (!auth.user) return <Redirect href="/login" />;
  const desktop = width >= 900;
  const links = [
    { path: "/discover", label: "Descubrir" },
    { path: "/recommendations", label: "Venti Discover" },
    { path: "/tickets", label: "Entradas" },
    { path: "/marketplace", label: "Espacios" },
    { path: "/notifications", label: "Notificaciones" },
    { path: "/profile", label: "Mi cuenta" },
    ...(can(auth.permissions, [P.artistProfileManage, P.artistsAdmin])
      ? [{ path: "/artists", label: "Artistas" }]
      : []),
    ...(can(auth.permissions, [P.concertsManage, P.concertsManageAll])
      ? [{ path: "/organizer", label: "Organizer" }]
      : []),
    ...(staff
      ? [{ path: "/staff", label: "Staff" }]
      : []),
    ...(can(auth.permissions, ADMIN_PERMISSIONS)
      ? [{ path: "/admin", label: "Admin" }]
      : []),
  ];
  const navigation = (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: desktop ? "column" : "row", gap: 6, padding: 12 }}
    >
      {links.map((link) => (
        <Pressable
          key={link.path}
          accessibilityRole="tab"
          accessibilityState={{ selected: path.startsWith(link.path) }}
          onPress={() => router.navigate(link.path)}
          style={{
            padding: 14,
            minHeight: 48,
            borderRadius: 12,
            backgroundColor: path.startsWith(link.path)
              ? "#352650"
              : "transparent",
          }}
        >
          <Text
            style={{
              color: path.startsWith(link.path) ? colors.accent : colors.muted,
              fontWeight: "700",
            }}
          >
            {link.label}
            {link.path === '/notifications' && <NotificationBadge />}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <PreferencesProvider key={auth.user.id}>
      <NotificationsProvider>
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          flexDirection: desktop ? "row" : "column",
        }}
      >
        {desktop && (
          <ScrollView
            style={{
              width: 220,
              flexGrow: 0,
              flexShrink: 0,
              borderRightWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.accent,
                fontSize: 32,
                fontWeight: "900",
                padding: 26,
              }}
            >
              VENTI
            </Text>
            {navigation}
          </ScrollView>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Slot key={auth.user.id} />
        </View>
        {!desktop && (
          <View style={{ borderTopWidth: 1, borderColor: colors.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {navigation}
            </ScrollView>
          </View>
        )}
      </SafeAreaView>
      </NotificationsProvider>
    </PreferencesProvider>
  );
}
