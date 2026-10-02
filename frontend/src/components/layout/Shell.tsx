import { Redirect, Slot, router, usePathname } from "expo-router";
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
import { hasRoles, type Role } from "../../types/api";
import { colors, Copy, Page, ResourceState } from "../ui";
export function Guard({ roles }: { roles: Role[] }) {
  const auth = useAuth();
  return hasRoles(auth.roles, roles) ? (
    <Slot />
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
    { path: "/favorites", label: "Favoritos" },
    { path: "/profile", label: "Mi cuenta" },
    ...(hasRoles(auth.roles, ["ORGANIZER", "ADMIN"])
      ? [{ path: "/organizer", label: "Organizer" }]
      : []),
    ...(hasRoles(auth.roles, ["STAFF", "ADMIN"])
      ? [{ path: "/staff", label: "Staff" }]
      : []),
    ...(auth.roles.includes("ADMIN")
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
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <PreferencesProvider key={auth.user.id}>
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          flexDirection: desktop ? "row" : "column",
        }}
      >
        {desktop && (
          <View
            style={{
              width: 220,
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
          </View>
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
    </PreferencesProvider>
  );
}
