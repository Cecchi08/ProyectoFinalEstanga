// Single source of the visual identity. The app is dark only (app.json userInterfaceStyle).
// Brand: electric violet. Contrast was checked against the backgrounds below:
// white on primary 5.7:1, accent on bg 7.2:1, muted on surface 7.7:1, white on dangerStrong 4.8:1.
export const palette = {
  violet50: "#F5F3FF",
  violet200: "#DDD6FE",
  violet300: "#C4B5FD",
  violet400: "#A78BFA",
  violet600: "#7C3AED",
  violet700: "#6D28D9",
  violet800: "#5B21B6",
};

export const colors = {
  bg: "#0B0A12",
  surface: "#15131F",
  surfaceAlt: "#100E19",
  surfaceHover: "#1E1A2D",
  border: "#2B2741",
  borderStrong: "#3D3759",
  text: "#F5F3FF",
  muted: "#ABA5C2",
  // Brand base and its states; accent is the light variant for text and icons on dark surfaces.
  primary: palette.violet600,
  primaryHover: palette.violet700,
  primaryPressed: palette.violet800,
  primarySoft: "#7C3AED2E",
  accent: palette.violet400,
  onPrimary: "#FFFFFF",
  focus: palette.violet300,
  success: "#34D399",
  successSoft: "#34D3991F",
  danger: "#F87171",
  dangerStrong: "#DC2626",
  dangerSoft: "#F871711F",
  warning: "#FBBF24",
  warningSoft: "#FBBF241F",
  info: palette.violet200,
  infoSoft: "#A78BFA1F",
};

export const radius = { sm: 10, md: 12, lg: 18, xl: 22, pill: 999 };

export const shadows = {
  card: "0 1px 2px rgba(0, 0, 0, 0.35), 0 12px 32px rgba(10, 6, 28, 0.38)",
  primary: "0 6px 18px rgba(124, 58, 237, 0.35)",
  focus: "0 0 0 3px rgba(196, 181, 253, 0.55)",
  bar: "0 -8px 24px rgba(0, 0, 0, 0.35)",
};

export const type = {
  title: { fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.6 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 21 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.2 },
} as const;
