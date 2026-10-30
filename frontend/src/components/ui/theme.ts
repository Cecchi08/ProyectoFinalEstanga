import { Platform } from "react-native";

import { palettes, shadowPalettes as themeShadows, type ThemeName } from "./palette";
export { palettes, shadowPalettes, type ColorToken, type ThemeName } from "./palette";

// On the web every token is a CSS variable, so switching theme only flips data-theme on <html>.
// On iOS/Android the token objects are filled in place with the active palette (applyNativePalette)
// and Root remounts the screens, so styles read at render time pick up the new values.
export const cssVar = (name: string) => `--venti-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
const web = Platform.OS === "web";
const asVars = <T extends Record<string, string>>(source: T, prefix = "") =>
  Object.fromEntries(Object.keys(source).map((key) => [key, `var(${cssVar(prefix + key)})`])) as T;

export const colors = web ? asVars(palettes.light) : { ...palettes.light };
export const shadows = web ? asVars(themeShadows.light, "shadow-") : { ...themeShadows.light };
const derived = new Set<() => void>();
// Module-level objects built from the tokens (the shared StyleSheet) register here to be rebuilt.
export const onNativePalette = (rebuild: () => void) => void derived.add(rebuild);
export function applyNativePalette(theme: ThemeName) {
  if (web) return;
  Object.assign(colors, palettes[theme]);
  Object.assign(shadows, themeShadows[theme]);
  derived.forEach((rebuild) => rebuild());
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

// Display face for titles and the brand: system display faces (no font download), then the system stack.
export const fonts = {
  display: Platform.select({
    web: '"Segoe UI Variable Display", "SF Pro Display", -apple-system, "Segoe UI", Roboto, system-ui, sans-serif',
    default: undefined,
  }),
};

export const type = {
  title: { fontSize: 32, lineHeight: 40, fontWeight: "700", letterSpacing: -0.6, fontFamily: fonts.display },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 21 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
} as const;
