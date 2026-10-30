import { Slot } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, ThemeToggle } from "../ui";
export default function AuthLayout() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 12 }}>
        <ThemeToggle />
      </View>
      <Slot />
    </SafeAreaView>
  );
}
