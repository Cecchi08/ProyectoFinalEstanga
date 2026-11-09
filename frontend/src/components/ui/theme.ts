import { Platform, type FontVariant } from "react-native";

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

export const radius = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 } as const;

// Geist, Inter, and Manrope prioritized for Urbano Contemporáneo, with clean system fallbacks.
export const fonts = {
  display: Platform.select({
    web: '"Geist", "Inter", "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", sans-serif',
    default: undefined,
  }),
  sans: Platform.select({
    web: '"Geist", "Inter", "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
    default: undefined,
  }),
  mono: Platform.select({
    web: '"Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    default: undefined,
  }),
};

const tabularNums: FontVariant[] = ["tabular-nums"];

export const type = {
  hero: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.6, fontFamily: fonts.display },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.6, fontFamily: fonts.display },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3, fontFamily: fonts.display },
  subheading: { fontSize: 17, lineHeight: 23, fontWeight: "700", letterSpacing: -0.2, fontFamily: fonts.sans },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400", fontFamily: fonts.sans },
  small: { fontSize: 13, lineHeight: 19, fontWeight: "500", fontFamily: fonts.sans },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", fontFamily: fonts.sans },
  metric: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.8, fontVariant: tabularNums, fontFamily: fonts.display },
  code: { fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.3, fontVariant: tabularNums, fontFamily: fonts.mono },
} as const;
