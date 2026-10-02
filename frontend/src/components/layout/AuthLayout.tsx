import { Slot } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../ui";
export default function AuthLayout() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Slot />
    </SafeAreaView>
  );
}
