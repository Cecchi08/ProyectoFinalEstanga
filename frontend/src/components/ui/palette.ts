// Urbano Contemporáneo palette for Venti:
// - Dark base: #111113 mineral charcoal canvas, #19191D / #222227 elevated graphite surfaces.
// - Light base: #F6F5F0 warm editorial paper canvas, #FFFFFF / #ECEAE3 clean stone surfaces.
// - Primary stage spotlight: Energetic Yellow (#F5C542) with dark charcoal text (#171305) for 10.8:1 contrast.
// - Stage red emphasis & alert: #D9383A (dark) / #C8282B (light).
// WCAG 2.2 AA is verified for every pairing by tests/theme-and-scroll.test.ts and backend/scripts/a11y-audit.mjs.
export type ThemeName = "dark" | "light";

const light = {
  bg: "#F6F5F0",
  surface: "#FFFFFF",
  surfaceAlt: "#ECEAE3",
  surfaceHover: "#E2DFD5",
  featuredBg: "#FBF8EE",
  featuredBorder: "#D4B459",
  border: "#DDDAD0",
  borderStrong: "#76746D",
  text: "#161618",
  muted: "#575651",
  // Primary spotlight action: Energetic Yellow with deep charcoal text.
  primary: "#F5C542",
  primaryHover: "#E5B32E",
  primaryPressed: "#CC9B1E",
  primarySoft: "#F9EFC7",
  onPrimary: "#171305",
  // Neutral stone secondary surfaces for quiet modular actions.
  secondary: "#ECEAE3",
  secondaryHover: "#DFDDD4",
  onSecondary: "#161618",
  // Accessible dark amber/ochre accent for text, links, active tabs, and charts on light surfaces.
  accent: "#855D00",
  accentHover: "#694900",
  accentText: "#6E4C00",
  accentSoft: "#F9EFC7",
  accentBorder: "#D9B64E",
  coral: "#855D00",
  focus: "#161618",
  success: "#166534",
  successSoft: "#DCFCE7",
  successBorder: "#74C68B",
  successText: "#14532D",
  warning: "#8A5800",
  warningSoft: "#FEF3C7",
  warningBorder: "#E5B84B",
  warningText: "#784900",
  danger: "#C8282B",
  dangerHover: "#A61F22",
  dangerStrong: "#C8282B",
  onDanger: "#FFFFFF",
  dangerSoft: "#FEECEB",
  dangerBorder: "#E58587",
  dangerText: "#9E1C20",
  info: "#855D00",
  infoSoft: "#F9EFC7",
  infoBorder: "#D9B64E",
  infoText: "#6E4C00",
};

const dark: typeof light = {
  bg: "#111113",
  surface: "#19191D",
  surfaceAlt: "#222227",
  surfaceHover: "#2A2A30",
  featuredBg: "#1E1C16",
  featuredBorder: "#5C4B1B",
  border: "#2E2E34",
  borderStrong: "#787882",
  text: "#F5F5F2",
  muted: "#A8A8A2",
  primary: "#F5C542",
  primaryHover: "#FFD45E",
  primaryPressed: "#E5B32E",
  primarySoft: "#2A2412",
  onPrimary: "#171305",
  secondary: "#222227",
  secondaryHover: "#2C2C33",
  onSecondary: "#F5F5F2",
  accent: "#F5C542",
  accentHover: "#FFE082",
  accentText: "#F7CE5B",
  accentSoft: "#2A2412",
  accentBorder: "#6E581A",
  coral: "#F5C542",
  focus: "#F5C542",
  success: "#3FB950",
  successSoft: "#122919",
  successBorder: "#236331",
  successText: "#86EFAC",
  warning: "#E09F24",
  warningSoft: "#2B2110",
  warningBorder: "#785719",
  warningText: "#FCD34D",
  danger: "#D9383A",
  dangerHover: "#B82B2D",
  dangerStrong: "#D9383A",
  onDanger: "#FFFFFF",
  dangerSoft: "#2D1618",
  dangerBorder: "#7F292D",
  dangerText: "#FCA5A5",
  info: "#F5C542",
  infoSoft: "#2A2412",
  infoBorder: "#6E581A",
  infoText: "#F7CE5B",
};

export const palettes: Record<ThemeName, typeof light> = { dark, light };
export type ColorToken = keyof typeof light;

const themeShadows: Record<ThemeName, Record<"card" | "cardHover" | "primary" | "focus" | "bar", string>> = {
  dark: {
    card: "0 1px 2px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.02)",
    cardHover: "0 8px 24px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(245, 197, 66, 0.22)",
    primary: "0 4px 16px rgba(245, 197, 66, 0.28)",
    focus: "0 0 0 3px rgba(245, 197, 66, 0.45)",
    bar: "0 -4px 20px rgba(0, 0, 0, 0.6)",
  },
  light: {
    card: "0 8px 24px rgba(22, 22, 24, 0.06)",
    cardHover: "0 10px 28px rgba(22, 22, 24, 0.09), 0 2px 6px rgba(22, 22, 24, 0.04)",
    primary: "0 4px 14px rgba(245, 197, 66, 0.32)",
    focus: "0 0 0 3px rgba(22, 22, 24, 0.28)",
    bar: "0 -4px 16px rgba(22, 22, 24, 0.05)",
  },
};
export const shadowPalettes = themeShadows;
