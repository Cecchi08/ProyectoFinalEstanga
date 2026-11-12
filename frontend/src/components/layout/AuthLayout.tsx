// Layout contenedor para pantallas de autenticación con identidad visual Venti y botón flotante de retorno.
import { Slot, router, usePathname } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadows, ThemeToggle } from "../ui";
import { ArrowBackIcon } from "../ui/icons";
import { VentiLogo } from "../ui/logo";

export default function AuthLayout() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  // Mostrar botón volver flotante en pantallas secundarias de autenticación
  const isRootAuth = path === "/login" || path === "/(auth)/login";
  const canReturn = !isRootAuth;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <VentiLogo size={28} />
        <ThemeToggle />
      </View>
      <Slot />
      {canReturn && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al inicio de sesión"
          onPress={() => router.replace("/login")}
          style={({ pressed }) => ({
            position: "absolute",
            bottom: Math.max(insets.bottom + 16, 20),
            left: 20,
            zIndex: 95,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 46,
            paddingVertical: 10,
            paddingHorizontal: 18,
            borderRadius: radius.pill,
            backgroundColor: pressed ? colors.surfaceHover : colors.surface,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            boxShadow: shadows.card,
          })}
        >
          <ArrowBackIcon color={colors.accent} size={18} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
            Volver
          </Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
