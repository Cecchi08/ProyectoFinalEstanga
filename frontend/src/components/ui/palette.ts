// Single source of the visual identity: deep violet for actions, lavender for secondary surfaces,
// warm ivory backgrounds and a few coral accents; a light and a dark (violet-neutral) theme.
// WCAG AA is checked for every pairing the components use by tests/theme-and-scroll.test.ts
// (text 4.5:1, control borders and focus 3:1, translucent tones composed over the surface).
export type ThemeName = "dark" | "light";

const light = {
  bg: "#FBF8F3",
  surface: "#FFFFFF",
  surfaceAlt: "#F6F1EA",
  surfaceHover: "#F1EBF8",
  border: "#E9E2EC",
  borderStrong: "#8A7FA0",
  text: "#1E1631",
  muted: "#5A5270",
  // Deep violet is the action color, with white text in both themes.
  primary: "#5B21B6",
  primaryHover: "#4C1D95",
  primaryPressed: "#3E1680",
  primarySoft: "#5B21B61A",
  onPrimary: "#FFFFFF",
  // Lavender: secondary buttons and quiet highlights.
  secondary: "#EDE6FB",
  secondaryHover: "#E1D6F8",
  onSecondary: "#3E1680",
  // Violet text for links, selected navigation and charts.
  accent: "#5B21B6",
  // Coral is used sparingly: dates, required marks, the page header dot.
  coral: "#B8432C",
  focus: "#7C3AED",
  success: "#11704A",
  successSoft: "#11704A17",
  danger: "#B4232F",
  dangerStrong: "#B4232F",
  onDanger: "#FFFFFF",
  dangerSoft: "#B4232F14",
  warning: "#7F4D00",
  warningSoft: "#B87A0014",
  info: "#4338CA",
  infoSoft: "#4338CA14",
};

const dark: typeof light = {
  bg: "#14111C",
  surface: "#1D1928",
  surfaceAlt: "#181421",
  surfaceHover: "#272235",
  border: "#2F2940",
  borderStrong: "#7A7196",
  text: "#F4F0FA",
  muted: "#BBB3CD",
  primary: "#6D3FD9",
  primaryHover: "#6236CC",
  primaryPressed: "#552DB5",
  primarySoft: "#8B5CF62E",
  onPrimary: "#FFFFFF",
  secondary: "#2C2443",
  secondaryHover: "#372D53",
  onSecondary: "#DCD0FF",
  accent: "#C4B5FD",
  coral: "#FF937F",
  focus: "#C4B5FD",
  success: "#4FD1A0",
  successSoft: "#4FD1A01F",
  danger: "#FF8F9C",
  dangerStrong: "#C42B3B",
  onDanger: "#FFFFFF",
  dangerSoft: "#FF8F9C1F",
  warning: "#F2C25B",
  warningSoft: "#F2C25B1F",
  info: "#A5B4FC",
  infoSoft: "#A5B4FC1F",
};

export const palettes: Record<ThemeName, typeof light> = { dark, light };
export type ColorToken = keyof typeof light;

const themeShadows: Record<ThemeName, Record<"card" | "primary" | "focus" | "bar", string>> = {
  dark: {
    card: "0 1px 2px rgba(0, 0, 0, 0.35)",
    primary: "0 4px 14px rgba(109, 63, 217, 0.35)",
    focus: "0 0 0 3px rgba(196, 181, 253, 0.55)",
    bar: "0 -6px 18px rgba(0, 0, 0, 0.3)",
  },
  light: {
    card: "0 1px 2px rgba(30, 22, 49, 0.05), 0 6px 18px rgba(30, 22, 49, 0.05)",
    primary: "0 4px 12px rgba(91, 33, 182, 0.22)",
    focus: "0 0 0 3px rgba(124, 58, 237, 0.4)",
    bar: "0 -4px 14px rgba(30, 22, 49, 0.06)",
  },
};
export const shadowPalettes = themeShadows;
