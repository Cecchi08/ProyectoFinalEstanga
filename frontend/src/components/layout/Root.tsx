import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../../contexts/AuthContext";
import { colors } from "../ui";
import { initTheme, useThemeMode } from "../ui/themeMode";
import { installWebStyles } from "./webStyles";
installWebStyles();
initTheme();
export default function Root() {
  const { theme, ready } = useThemeMode();
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        {/* Native styles are read at render: remounting the screens under the navigator applies the new palette.
            The web switches CSS variables instead, so its tree is never remounted. */}
        {ready ? <Slot key={Platform.OS === "web" ? "web" : theme} /> : <View style={{ flex: 1, backgroundColor: colors.bg }} />}
      </AuthProvider>
    </SafeAreaProvider>
  );
}
