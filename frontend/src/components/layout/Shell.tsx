import { Redirect, Slot, router, usePathname } from "expo-router";
import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
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
import { primaryRole, type Concert, type Permission, type Role } from "../../types/api";
import { colors, Copy, fonts, Page, radius, ResourceState, shadows, ThemeToggle } from "../ui";

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
        paddingVertical: vertical ? 11 : 10,
        paddingHorizontal: 14,
        minHeight: 44,
        justifyContent: "center",
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? colors.borderStrong : "transparent",
        backgroundColor: selected ? colors.primarySoft : hovered ? colors.surfaceHover : "transparent",
      }}
    >
      {selected && (
        <View
          aria-hidden
          style={
            vertical
              ? { position: "absolute", left: 4, top: 10, bottom: 10, width: 3, borderRadius: radius.pill, backgroundColor: colors.primary }
              : { position: "absolute", left: 12, right: 12, bottom: 3, height: 3, borderRadius: radius.pill, backgroundColor: colors.primary }
          }
        />
      )}
      <Text
        style={{
          color: selected ? colors.accent : hovered ? colors.text : colors.muted,
          fontSize: 14,
          fontWeight: selected ? "700" : "600",
          letterSpacing: -0.1,
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

function linksForRole(role: Role, staff: boolean): { path: string; label: string }[] {
  switch (role) {
    case "ADMIN":
      return [
        { path: "/admin", label: "Panel Admin" },
        { path: "/admin/users", label: "Usuarios y roles" },
        { path: "/admin/organizations", label: "Organizaciones" },
        { path: "/admin/establishments", label: "Revisión de espacios" },
        { path: "/admin/concerts", label: "Conciertos" },
        { path: "/admin/statistics", label: "Estadísticas" },
        { path: "/admin/audit", label: "Auditoría" },
        { path: "/discover", label: "Descubrir" },
        { path: "/marketplace", label: "Espacios" },
        { path: "/services", label: "Servicios" },
        { path: "/notifications", label: "Notificaciones" },
        { path: "/profile", label: "Mi cuenta" },
      ];
    case "ORGANIZADOR":
      return [
        { path: "/organizer", label: "Mis conciertos" },
        { path: "/organizer/statistics", label: "Estadísticas" },
        { path: "/marketplace", label: "Espacios" },
        { path: "/marketplace/quotes", label: "Presupuestos de espacios" },
        { path: "/marketplace/reservations", label: "Reservas de espacios" },
        { path: "/services", label: "Servicios" },
        { path: "/services/quotes", label: "Cotizaciones de servicios" },
        { path: "/discover", label: "Descubrir" },
        ...(staff ? [{ path: "/staff", label: "Staff" }] : []),
        { path: "/notifications", label: "Notificaciones" },
        { path: "/profile", label: "Mi cuenta" },
      ];
    case "VENUE":
      return [
        { path: "/marketplace/manage", label: "Mi Espacio Físico" },
        { path: "/marketplace/reservations", label: "Reservas recibidas" },
        { path: "/marketplace/quotes", label: "Presupuestos recibidos" },
        { path: "/marketplace", label: "Catálogo de espacios" },
        { path: "/services", label: "Servicios" },
        { path: "/services/quotes", label: "Cotizaciones de servicios" },
        { path: "/notifications", label: "Notificaciones" },
        { path: "/profile", label: "Mi cuenta" },
      ];
    case "EMPRESA_SERVICIOS":
      return [
        { path: "/services/mine", label: "Mi Empresa y Servicios" },
        { path: "/services/quotes", label: "Cotizaciones recibidas" },
        { path: "/services", label: "Catálogo de servicios" },
        { path: "/notifications", label: "Notificaciones" },
        { path: "/profile", label: "Mi cuenta" },
      ];
    case "ARTISTA":
      return [
        { path: "/artists", label: "Panel de Artista" },
        { path: "/marketplace", label: "Espacios" },
        { path: "/marketplace/quotes", label: "Mis presupuestos" },
        { path: "/marketplace/reservations", label: "Mis reservas" },
        { path: "/discover", label: "Descubrir" },
        ...(staff ? [{ path: "/staff", label: "Staff" }] : []),
        { path: "/notifications", label: "Notificaciones" },
        { path: "/profile", label: "Mi cuenta" },
      ];
    case "COMPRADOR":
    case "GUEST":
    default:
      return [
        { path: "/discover", label: "Descubrir" },
        { path: "/recommendations", label: "Venti Discover" },
        { path: "/tickets", label: "Mis entradas" },
        { path: "/purchases", label: "Mis compras" },
        ...(staff ? [{ path: "/staff", label: "Staff" }] : []),
        { path: "/notifications", label: "Notificaciones" },
        { path: "/profile", label: "Mi cuenta" },
      ];
  }
}

export default function Shell() {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const path = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
  }, [path]);
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
  const activeRole = primaryRole(auth.roles);
  const links = linksForRole(activeRole, staff);
  const isSelected = (linkPath: string) => {
    if (path === linkPath) return true;
    if (!path.startsWith(`${linkPath}/`)) return false;
    return !links.some(
      (other) =>
        other.path !== linkPath &&
        other.path.startsWith(`${linkPath}/`) &&
        (path === other.path || path.startsWith(`${other.path}/`)),
    );
  };
  const navigation = (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "column", gap: 4, padding: 10 }}
    >
      {links.map((link) => (
        <NavTab
          key={link.path}
          label={link.label}
          selected={isSelected(link.path)}
          vertical
          onPress={() => {
            setDrawerOpen(false);
            router.navigate(link.path);
          }}
        >
          {link.path === "/notifications" && <NotificationBadge />}
        </NavTab>
      ))}
    </View>
  );
  const sessionFooter = (
    <View
      style={{
        marginHorizontal: 10,
        marginTop: 8,
        marginBottom: 20,
        padding: 12,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 10,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
          CUENTA ACTIVA
        </Text>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
          {auth.user.email}
        </Text>
      </View>
      <ThemeToggle />
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
            overflow: "hidden",
          }}
        >
          {desktop && (
            <ScrollView
              style={{
                width: 244,
                flexGrow: 0,
                flexShrink: 0,
                backgroundColor: colors.surface,
                borderRightWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 18,
                  paddingTop: 24,
                  paddingBottom: 16,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View
                  aria-hidden
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: radius.sm,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: shadows.primary,
                  }}
                >
                  <Text style={{ color: colors.onPrimary, fontSize: 17, fontWeight: "800", fontFamily: fonts.display }}>
                    V
                  </Text>
                </View>
                <View style={{ gap: 1, flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800", letterSpacing: 2.2, fontFamily: fonts.display }}>
                    VENTI
                  </Text>
                </View>
              </View>
              {navigation}
              {sessionFooter}
            </ScrollView>
          )}
          {!desktop && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                minWidth: 0,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0, flexShrink: 1 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={drawerOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
                  onPress={() => setDrawerOpen((prev) => !prev)}
                  style={({ pressed }) => ({
                    width: 42,
                    height: 42,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: drawerOpen ? colors.primary : colors.borderStrong,
                    backgroundColor: pressed || drawerOpen ? colors.primarySoft : colors.surfaceAlt,
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <Text aria-hidden style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                    {drawerOpen ? "✕" : "☰"}
                  </Text>
                </Pressable>
                <View style={{ gap: 1, minWidth: 0, flexShrink: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "800", letterSpacing: 1.8, fontFamily: fonts.display }}>
                    VENTI
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ir a notificaciones"
                  onPress={() => router.navigate("/notifications")}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceAlt,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>Avisos</Text>
                  <NotificationBadge />
                </Pressable>
              </View>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Slot key={auth.user.id} />
          </View>
          {!desktop && drawerOpen && (
            <View
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                zIndex: 100,
                flexDirection: "row",
              }}
            >
              <View
                style={{
                  width: Math.min(300, Math.max(236, width - 44)),
                  height: "100%",
                  backgroundColor: colors.surface,
                  borderRightWidth: 1,
                  borderColor: colors.borderStrong,
                  boxShadow: shadows.card,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <View
                      aria-hidden
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: radius.sm,
                        backgroundColor: colors.primary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: colors.onPrimary, fontSize: 15, fontWeight: "800", fontFamily: fonts.display }}>
                        V
                      </Text>
                    </View>
                    <View style={{ minWidth: 0, flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "800", letterSpacing: 1.6, fontFamily: fonts.display }}>
                        VENTI
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar menú"
                    onPress={() => setDrawerOpen(false)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceAlt,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text aria-hidden style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                      ✕
                    </Text>
                  </Pressable>
                </View>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {navigation}
                  {sessionFooter}
                </ScrollView>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar menú tocando fuera"
                onPress={() => setDrawerOpen(false)}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(9, 9, 11, 0.58)",
                }}
              />
            </View>
          )}
        </SafeAreaView>
      </NotificationsProvider>
    </PreferencesProvider>
  );
}
