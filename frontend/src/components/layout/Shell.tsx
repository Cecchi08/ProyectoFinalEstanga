import { Redirect, Slot, router, usePathname } from "expo-router";
import { type PropsWithChildren } from "react";
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
import type { Concert, Permission } from "../../types/api";
import { colors, Copy, Page, ResourceState } from "../ui";
// Sections are gated by permission, like the API. While /auth/me is in flight the decision
// is not known yet, so the guard waits instead of denying.
export function Require({
  permissions,
  children,
}: PropsWithChildren<{ permissions: Permission[] }>) {
  const auth = useAuth();
  if (auth.accessLoading)
    return (
      <Page title="VENTI">
        <ResourceState loading error="" retry={() => {}} />
      </Page>
    );
  if (auth.accessError)
    return (
      <Page title="VENTI">
        <ResourceState
          loading={false}
          error={auth.accessError}
          retry={() => void auth.reloadAccess()}
        />
      </Page>
    );
  return auth.can(...permissions) ? (
    children
  ) : (
    <Page title="Sin permiso">
      <Copy>Tu cuenta no tiene acceso a esta sección.</Copy>
    </Page>
  );
}
// Layout version: guards every route under the folder.
export function Guard({ permissions }: { permissions: Permission[] }) {
  return (
    <Require permissions={permissions}>
      <Slot />
    </Require>
  );
}
export default function Shell() {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const path = usePathname();
  // Staff is a per-concert assignment: tickets.validate comes from concert_staff (published concerts),
  // tickets.validate_all lets ADMIN validate any ticket; an assignment to an unpublished concert also shows the tab.
  const validator = auth.can("tickets.validate", "tickets.validate_all");
  const assignments = useResource<Concert[]>(
    auth.user && !auth.accessLoading && !validator ? "/staff/assignments?limit=1" : null,
  );
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
    { path: "/services", label: "Servicios" },
    { path: "/notifications", label: "Notificaciones" },
    { path: "/profile", label: "Mi cuenta" },
    ...(auth.can("artist.profile.manage", "artists.admin")
      ? [{ path: "/artists", label: "Mi artista" }]
      : []),
    ...(auth.can("concerts.manage", "concerts.manage_all")
      ? [{ path: "/organizer", label: "Organizador" }]
      : []),
    ...(staff
      ? [{ path: "/staff", label: "Staff" }]
      : []),
    ...(auth.can("users.manage", "catalogs.manage", "statistics.global", "marketplace.admin", "services.admin")
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
