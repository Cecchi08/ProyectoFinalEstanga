import { Redirect, Slot, router, usePathname } from "expo-router";
import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import {
  BackHandler,
  Platform,
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
import {
  ROLE_LABELS,
  linksForRole,
  mobileBottomTabs,
  type Concert,
  type Permission,
  type Role,
} from "../../types/api";
import { colors, Copy, fonts, Page, radius, ResourceState, shadows, ThemeToggle } from "../ui";

function NavTab({
  label,
  selected,
  vertical,
  compact = false,
  role = "tab",
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  vertical: boolean;
  compact?: boolean;
  role?: "tab" | "button";
  onPress(): void;
  children?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ selected }}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        flex: compact ? 1 : undefined,
        minWidth: compact ? 0 : undefined,
        paddingVertical: compact ? 8 : vertical ? 11 : 10,
        paddingHorizontal: compact ? 4 : 14,
        minHeight: 48,
        alignItems: compact ? "center" : undefined,
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
              : { position: "absolute", left: compact ? 8 : 12, right: compact ? 8 : 12, bottom: 3, height: 3, borderRadius: radius.pill, backgroundColor: colors.primary }
          }
        />
      )}
      <Text
        numberOfLines={compact ? 1 : undefined}
        style={{
          color: selected ? colors.accent : hovered ? colors.text : colors.muted,
          fontSize: compact ? 11 : 14,
          lineHeight: compact ? 15 : 20,
          fontWeight: selected ? "700" : "600",
          letterSpacing: compact ? -0.2 : -0.1,
          textAlign: compact ? "center" : "left",
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

export { linksForRole, mobileBottomTabs };

export default function Shell() {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const path = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
  }, [path]);
  useEffect(() => {
    if (!drawerOpen) return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") setDrawerOpen(false);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setDrawerOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [drawerOpen]);
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
  const activeRole = auth.activeRole;
  const assignableRoles: Role[] = auth.roles.filter((r) => r !== "GUEST");
  const links = linksForRole(activeRole, staff);
  const bottomTabs = mobileBottomTabs(activeRole, staff);
  const isSelected = (linkPath: string, pool: { path: string }[] = links) => {
    if (path === linkPath) return true;
    if (!path.startsWith(`${linkPath}/`)) return false;
    return !pool.some(
      (other) =>
        other.path !== linkPath &&
        other.path.startsWith(`${linkPath}/`) &&
        (path === other.path || path.startsWith(`${other.path}/`)),
    );
  };
  const roleSelector = assignableRoles.length > 1 && (
    <View
      style={{
        marginHorizontal: 10,
        marginTop: 10,
        padding: 10,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 6,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
        PERFIL ACTIVO
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {assignableRoles.map((role) => {
          const active = role === activeRole;
          return (
            <Pressable
              key={role}
              accessibilityRole="button"
              accessibilityLabel={`Cambiar a perfil ${ROLE_LABELS[role]}`}
              accessibilityState={{ selected: active }}
              onPress={() => auth.setActiveRole(role)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                minHeight: 34,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: active ? colors.accentBorder : colors.borderStrong,
                backgroundColor: active ? colors.accentSoft : colors.surface,
                justifyContent: "center",
              }}
            >
              <Text style={{ color: active ? colors.accentText : colors.text, fontSize: 12, fontWeight: active ? "700" : "600" }}>
                {ROLE_LABELS[role]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
  const renderMenuList = (asTablist: boolean) => (
    <View
      accessibilityRole={asTablist ? "tablist" : undefined}
      style={{ flexDirection: "column", gap: 4, padding: 10 }}
    >
      {links.map((link) => (
        <NavTab
          key={link.path}
          label={link.label}
          selected={isSelected(link.path)}
          vertical
          role={asTablist ? "tab" : "button"}
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
          CUENTA ACTIVA · {ROLE_LABELS[activeRole]}
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
                width: 220,
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
              {roleSelector}
              {renderMenuList(true)}
              {sessionFooter}
            </ScrollView>
          )}
          {!desktop && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                minWidth: 0,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, flexShrink: 1 }}>
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
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: "800", letterSpacing: 1.6, fontFamily: fonts.display }}>
                    VENTI
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {assignableRoles.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Perfil activo: ${ROLE_LABELS[activeRole]}. Tocar para cambiar`}
                    onPress={() => {
                      const nextIndex = (assignableRoles.indexOf(activeRole) + 1) % assignableRoles.length;
                      auth.setActiveRole(assignableRoles[nextIndex]);
                    }}
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 7,
                      minHeight: 36,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: colors.accentBorder,
                      backgroundColor: colors.accentSoft,
                      justifyContent: "center",
                    }}
                  >
                    <Text numberOfLines={1} style={{ color: colors.accentText, fontSize: 11, fontWeight: "700" }}>
                      {ROLE_LABELS[activeRole]} ▾
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mis compras"
                  onPress={() => router.navigate("/purchases")}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    minHeight: 36,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: path.startsWith("/purchases") ? colors.accentBorder : colors.border,
                    backgroundColor: path.startsWith("/purchases") ? colors.accentSoft : colors.surfaceAlt,
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: path.startsWith("/purchases") ? colors.accentText : colors.text, fontSize: 12, fontWeight: "700" }}>
                    Compras
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
            <Slot key={auth.user.id} />
          </View>
          {!desktop && (
            <View
              accessibilityRole="tablist"
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                paddingHorizontal: 4,
                paddingVertical: 6,
                borderTopWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                boxShadow: shadows.bar,
              }}
            >
              {bottomTabs.map((tab) => (
                <NavTab
                  key={tab.path}
                  label={tab.label}
                  selected={isSelected(tab.path, bottomTabs)}
                  vertical={false}
                  compact
                  onPress={() => router.navigate(tab.path)}
                >
                  {tab.path === "/notifications" && <NotificationBadge />}
                </NavTab>
              ))}
            </View>
          )}
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
                  {roleSelector}
                  {renderMenuList(false)}
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
