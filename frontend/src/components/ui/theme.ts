import { Platform, type FontVariant } from "react-native";

import { palettes, shadowPalettes as themeShadows, type ThemeName } from "./palette";
export { palettes, shadowPalettes, type ColorToken, type ThemeName } from "./palette";

// En web cada token es una variable CSS, por lo que cambiar de tema solo alterna data-theme en <html>.
// En iOS/Android los objetos de tokens se rellenan en sitio con la paleta activa (applyNativePalette)
// y Root remonta las pantallas para que los estilos leídos al renderizar tomen los nuevos valores.
export const cssVar = (name: string) => `--venti-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
const web = Platform.OS === "web";
const asVars = <T extends Record<string, string>>(source: T, prefix = "") =>
  Object.fromEntries(Object.keys(source).map((key) => [key, `var(${cssVar(prefix + key)})`])) as T;

export const colors = web ? asVars(palettes.light) : { ...palettes.light };
export const shadows = web ? asVars(themeShadows.light, "shadow-") : { ...themeShadows.light };
const derived = new Set<() => void>();
// Los objetos de módulo construidos con tokens (el StyleSheet compartido) se registran aquí para reconstruirse.
export const onNativePalette = (rebuild: () => void) => void derived.add(rebuild);
export function applyNativePalette(theme: ThemeName) {
  if (web) return;
  Object.assign(colors, palettes[theme]);
  Object.assign(shadows, themeShadows[theme]);
  derived.forEach((rebuild) => rebuild());
}

export const radius = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 } as const;

// Tipografías Geist, Inter y Manrope priorizadas para Urbano Contemporáneo, con fallbacks limpios de sistema.
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
