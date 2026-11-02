// Modern Bento / Modular UI palette for Venti:
// - Light base: #F5F5F7 background, pure #FFFFFF surfaces, monochrome zinc hierarchy.
// - Dark base: #0A0A0A carbon black background, #121215 / #18181C elevated dark modules.
// - Single musical accent: Electric Stage Indigo (#4338CA light / #4F46E5 & #A5B4FC dark).
// WCAG AA is verified for every pairing by tests/theme-and-scroll.test.ts.
export type ThemeName = "dark" | "light";

const light = {
  bg: "#F5F5F7",
  surface: "#FFFFFF",
  surfaceAlt: "#ECECEF",
  surfaceHover: "#E4E4E9",
  border: "#E2E2E8",
  borderStrong: "#71717A",
  text: "#09090B",
  muted: "#52525B",
  // Single musical accent: Electric Stage Indigo.
  primary: "#4338CA",
  primaryHover: "#3730A3",
  primaryPressed: "#312E81",
  primarySoft: "#4338CA14",
  onPrimary: "#FFFFFF",
  // Monochrome secondary surfaces for quiet modular actions.
  secondary: "#E4E4E8",
  secondaryHover: "#D4D4DA",
  onSecondary: "#09090B",
  // Accent text for links, active tabs, and charts.
  accent: "#4338CA",
  accentText: "#4338CA",
  // Unified with the single accent token so no secondary accent color appears.
  coral: "#4338CA",
  focus: "#4338CA",
  success: "#0F6E48",
  successSoft: "#0F6E4814",
  danger: "#B4232F",
  dangerStrong: "#B4232F",
  onDanger: "#FFFFFF",
  dangerSoft: "#B4232F14",
  warning: "#7C4A00",
  warningSoft: "#B87A0014",
  info: "#4338CA",
  infoSoft: "#4338CA14",
};

const dark: typeof light = {
  bg: "#0A0A0A",
  surface: "#121215",
  surfaceAlt: "#18181C",
  surfaceHover: "#222228",
  border: "#232329",
  borderStrong: "#71717A",
  text: "#FAFAFA",
  muted: "#A1A1AA",
  primary: "#4F46E5",
  primaryHover: "#4338CA",
  primaryPressed: "#3730A3",
  primarySoft: "#6366F124",
  onPrimary: "#FFFFFF",
  secondary: "#1F1F24",
  secondaryHover: "#2A2A32",
  onSecondary: "#FAFAFA",
  accent: "#A5B4FC",
  accentText: "#A5B4FC",
  coral: "#A5B4FC",
  focus: "#818CF8",
  success: "#34D399",
  successSoft: "#34D3991F",
  danger: "#FDA4AF",
  dangerStrong: "#BE123C",
  onDanger: "#FFFFFF",
  dangerSoft: "#FDA4AF1F",
  warning: "#FBBF24",
  warningSoft: "#FBBF241F",
  info: "#A5B4FC",
  infoSoft: "#A5B4FC1F",
};

export const palettes: Record<ThemeName, typeof light> = { dark, light };
export type ColorToken = keyof typeof light;

const themeShadows: Record<ThemeName, Record<"card" | "cardHover" | "primary" | "focus" | "bar", string>> = {
  dark: {
    card: "0 1px 2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.02)",
    cardHover: "0 8px 24px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(165, 180, 252, 0.16)",
    primary: "0 4px 16px rgba(79, 70, 229, 0.38)",
    focus: "0 0 0 3px rgba(129, 140, 248, 0.45)",
    bar: "0 -4px 20px rgba(0, 0, 0, 0.55)",
  },
  light: {
    card: "0 1px 2px rgba(9, 9, 11, 0.03), 0 4px 12px rgba(9, 9, 11, 0.03)",
    cardHover: "0 8px 24px rgba(9, 9, 11, 0.07), 0 2px 6px rgba(9, 9, 11, 0.04)",
    primary: "0 4px 14px rgba(67, 56, 202, 0.24)",
    focus: "0 0 0 3px rgba(67, 56, 202, 0.32)",
    bar: "0 -4px 16px rgba(9, 9, 11, 0.04)",
  },
};
export const shadowPalettes = themeShadows;
