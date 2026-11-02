import { Slot } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, radius, ThemeToggle } from "../ui";

export default function AuthLayout() {
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
        <View aria-hidden style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: radius.xs,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 14, fontWeight: "800", fontFamily: fonts.display }}>V</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", letterSpacing: 2, fontFamily: fonts.display }}>
            VENTI
          </Text>
        </View>
        <ThemeToggle />
      </View>
      <Slot />
    </SafeAreaView>
  );
}
