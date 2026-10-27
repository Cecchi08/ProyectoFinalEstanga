import { Redirect, Slot, router, usePathname } from "expo-router";
import { useState, type PropsWithChildren, type ReactNode } from "react";
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
import { colors, Copy, Page, radius, ResourceState, shadows } from "../ui";
function NavTab({
  label,
  selected,
  vertical,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  vertical: boolean;
  onPress(): void;
  children?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        paddingVertical: 13,
        paddingHorizontal: 14,
        minHeight: 48,
        justifyContent: "center",
        borderRadius: radius.md,
        backgroundColor: selected ? colors.primarySoft : hovered ? colors.surfaceHover : "transparent",
      }}
    >
      {selected && (
        <View
          aria-hidden
          style={
            vertical
              ? { position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: radius.pill, backgroundColor: colors.primary }
              : { position: "absolute", left: 14, right: 14, bottom: 4, height: 3, borderRadius: radius.pill, backgroundColor: colors.primary }
          }
        />
      )}
      <Text
        style={{
          color: selected ? colors.accent : hovered ? colors.text : colors.muted,
          fontSize: 15,
          fontWeight: selected ? "800" : "600",
        }}
      >
        {label}
        {children}
      </Text>
    </Pressable>
  );
}
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
      style={{ flexDirection: desktop ? "column" : "row", gap: 4, padding: desktop ? 12 : 8 }}
    >
      {links.map((link) => (
        <NavTab
          key={link.path}
          label={link.label}
          selected={path.startsWith(link.path)}
          vertical={desktop}
          onPress={() => router.navigate(link.path)}
        >
          {link.path === '/notifications' && <NotificationBadge />}
        </NavTab>
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
              backgroundColor: colors.surfaceAlt,
              borderRightWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 18 }}>
              <View
                aria-hidden
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: radius.sm,
                  backgroundColor: colors.primary,
                  boxShadow: shadows.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.onPrimary, fontSize: 17, fontWeight: "900" }}>V</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 1.5 }}>
                VENTI
              </Text>
            </View>
            {navigation}
          </ScrollView>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Slot key={auth.user.id} />
        </View>
        {!desktop && (
          <View style={{ borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, boxShadow: shadows.bar }}>
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
