// Estructura y contenedor principal de la aplicación Venti con navegación lateral unificada.
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
import { ArrowBackIcon, BellIcon, CartIcon, RouteIcon } from "../ui/icons";
import { VentiIsotype } from "../ui/logo";

// Elemento de navegación para el menú lateral.
function NavTab({
  path = "",
  label,
  selected,
  role = "tab",
  onPress,
  children,
}: {
  path?: string;
  label: string;
  selected: boolean;
  role?: "tab" | "button";
  onPress(): void;
  children?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 14,
        minHeight: 48,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? colors.borderStrong : "transparent",
        backgroundColor: selected ? colors.primarySoft : hovered ? colors.surfaceHover : "transparent",
        justifyContent: "center",
      }}
    >
      {selected && (
        <View
          aria-hidden
          style={{
            position: "absolute",
            left: 4,
            top: 10,
            bottom: 10,
            width: 3,
            borderRadius: radius.pill,
            backgroundColor: colors.primary,
          }}
        />
      )}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <RouteIcon path={path} size={18} color={selected ? colors.accent : colors.muted} />
          <Text
            numberOfLines={1}
            style={{
              color: selected ? colors.accent : hovered ? colors.text : colors.muted,
              fontSize: 14,
              lineHeight: 20,
              fontWeight: selected ? "700" : "600",
              letterSpacing: -0.1,
              textAlign: "left",
              flexShrink: 1,
            }}
          >
            {label}
          </Text>
        </View>
        {children}
      </View>
    </Pressable>
  );
}

// Control de acceso según los permisos del usuario activo.
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

// Versión protectora de rutas completas en carpetas de navegación.
export function Guard({ permissions }: { permissions: Permission[] }) {
  return (
    <Require permissions={permissions}>
      <Slot />
    </Require>
  );
}

export { linksForRole, mobileBottomTabs };

// Contenedor principal de la aplicación Venti con navegación lateral única y botón flotante.
export default function Shell() {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const path = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Cerrar el menú lateral al cambiar de pantalla.
  useEffect(() => {
    setDrawerOpen(false);
  }, [path]);

  // Manejo de la tecla Escape en web y botón atrás en Android para cerrar el menú lateral.
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

  // Detección de permisos para el rol de staff en conciertos asignados.
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
  const insets = useSafeAreaInsets();

  // Rutas raíz donde no se debe mostrar el botón flotante de retorno.
  const rootPaths = [
    "/cartelera",
    "/discover",
    "/search",
    "/tickets",
    "/notifications",
    "/profile",
    "/admin",
    "/organizer",
    "/marketplace/manage",
    "/services/mine",
    "/artists",
    "/staff",
  ];
  const isRoot = rootPaths.includes(path);
  const showFloatingBack = !isRoot && router.canGoBack();

  // Verificación de selección de ruta para destacar el enlace correspondiente.
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

  // Selector de roles cuando el usuario posee múltiples perfiles asignados.
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

  // Renderizado del listado de enlaces del menú lateral con iconos monocromáticos.
  const renderMenuList = (items: { path: string; label: string }[], asTablist: boolean) => (
    <View
      accessibilityRole={asTablist ? "tablist" : undefined}
      style={{ flexDirection: "column", gap: 4, padding: 10 }}
    >
      {items.map((link) => (
        <NavTab
          key={link.path}
          path={link.path}
          label={link.label}
          selected={isSelected(link.path)}
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

  // Pie del menú lateral para escritorio con información de sesión y alternador de tema.
  const desktopSessionFooter = (
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

  // Pie del menú lateral en móviles sin alternador duplicado (solo presente en el header).
  const mobileDrawerFooter = (
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
        gap: 4,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
        CUENTA ACTIVA · {ROLE_LABELS[activeRole]}
      </Text>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
        {auth.user.email}
      </Text>
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
          {/* Navegación lateral persistente en pantallas de escritorio */}
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
                <VentiIsotype size={32} />
                <View style={{ gap: 1, flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800", letterSpacing: 2.2, fontFamily: fonts.display }}>
                    VENTI
                  </Text>
                </View>
              </View>
              {roleSelector}
              {renderMenuList(links, true)}
              {desktopSessionFooter}
            </ScrollView>
          )}

          {/* Encabezado superior en dispositivos móviles */}
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, flexShrink: 1 }}>
                  <VentiIsotype size={24} />
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "800", letterSpacing: 1.6, fontFamily: fonts.display }}>
                    VENTI
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {/* Selector claro/oscuro en el header */}
                <ThemeToggle compact />

                {/* Acceso a notificaciones con insignia flotante */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ver notificaciones"
                  onPress={() => router.navigate("/notifications")}
                  style={({ pressed }) => ({
                    width: 38,
                    height: 38,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: path.startsWith("/notifications") ? colors.accentBorder : colors.border,
                    backgroundColor: path.startsWith("/notifications") ? colors.accentSoft : pressed ? colors.surfaceHover : colors.surfaceAlt,
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <View style={{ position: "relative" }}>
                    <BellIcon size={18} color={path.startsWith("/notifications") ? colors.accent : colors.text} />
                    <NotificationBadge />
                  </View>
                </Pressable>

                {/* Selector rápido de rol si el usuario tiene múltiples */}
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

                {/* Carrito de compras monocromático en el header */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mis compras"
                  onPress={() => router.navigate("/purchases")}
                  style={({ pressed }) => ({
                    width: 38,
                    height: 38,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: path.startsWith("/purchases") ? colors.accentBorder : colors.border,
                    backgroundColor: path.startsWith("/purchases") ? colors.accentSoft : pressed ? colors.surfaceHover : colors.surfaceAlt,
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <CartIcon size={18} color={path.startsWith("/purchases") ? colors.accent : colors.text} />
                </Pressable>
              </View>
            </View>
          )}

          {/* Área principal del contenido */}
          <View style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
            <Slot key={auth.user.id} />
          </View>

          {/* Menú lateral desplegable para móvil (sin barra redundante inferior) */}
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
                    <VentiIsotype size={28} />
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
                  {/* Se muestran todas las rutas disponibles en el menú lateral */}
                  {renderMenuList(links, false)}
                  {mobileDrawerFooter}
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

          {/* Botón flotante para volver atrás con mayor tamaño y diseño accesible */}
          {showFloatingBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver a la pantalla anterior"
              onPress={() => router.back()}
              style={({ pressed }) => ({
                position: "absolute",
                bottom: Math.max(insets.bottom + 18, 20),
                left: desktop ? 240 : 18,
                zIndex: 90,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 16,
                minHeight: 46,
                borderRadius: radius.pill,
                backgroundColor: pressed ? colors.surfaceHover : colors.surface,
                borderWidth: 1.5,
                borderColor: colors.borderStrong,
                boxShadow: shadows.card,
              })}
            >
              <ArrowBackIcon size={18} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", letterSpacing: -0.1 }}>
                Volver
              </Text>
            </Pressable>
          )}
        </SafeAreaView>
      </NotificationsProvider>
    </PreferencesProvider>
  );
}
