import { useSyncExternalStore } from "react";
import { Appearance, Platform } from "react-native";
import { storage } from "../../services/storage";
import { palettes, type ThemeName } from "./palette";
import { applyNativePalette } from "./theme";

import { otherTheme, readStoredTheme, resolveTheme, storeTheme, THEME_STORAGE_KEY } from "./themePreference";
export { otherTheme, readStoredTheme, resolveTheme, storeTheme, THEME_STORAGE_KEY } from "./themePreference";

const web = Platform.OS === "web";
const hasDocument = web && typeof document !== "undefined";
const systemQuery = () => (hasDocument && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: light)") : null);
// Native reads the saved choice asynchronously: until then Root renders only the background.
let state: { theme: ThemeName; ready: boolean } = { theme: "dark", ready: web };
let started = false;
let chosen = false;
const listeners = new Set<() => void>();

function apply(theme: ThemeName, ready = state.ready) {
  if (hasDocument) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    // Browser chrome (address bar, Android system bars in PWAs) follows the page background.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = palettes[theme].bg;
  } else applyNativePalette(theme);
  state = { theme, ready };
  listeners.forEach((listener) => listener());
}

// Called once at startup, before the first render: no flash of the wrong theme.
// First visit (nothing saved) follows the system, also live, until the person chooses.
export function initTheme() {
  if (started) return;
  started = true;
  if (web) {
    if (!hasDocument) return;
    const query = systemQuery();
    apply(resolveTheme(readStoredTheme(), Boolean(query?.matches)));
    query?.addEventListener?.("change", (event) => {
      if (!readStoredTheme()) apply(event.matches ? "light" : "dark");
    });
    return;
  }
  const system = () => Appearance.getColorScheme() === "light";
  apply(resolveTheme(null, system()), false);
  Appearance.addChangeListener(({ colorScheme }) => {
    if (!chosen) apply(colorScheme === "light" ? "light" : "dark");
  });
  void Promise.resolve()
    .then(() => storage.get(THEME_STORAGE_KEY))
    .catch(() => null)
    .then((stored) => {
      chosen = stored === "light" || stored === "dark";
      // System UI (keyboard, alerts, pickers) follows the saved choice too.
      if (chosen) Appearance.setColorScheme?.(stored as ThemeName);
      apply(resolveTheme(stored, system()), true);
    });
}
export function setTheme(theme: ThemeName) {
  chosen = true;
  if (web) storeTheme(theme);
  else {
    void Promise.resolve()
      .then(() => storage.set(THEME_STORAGE_KEY, theme))
      .catch(() => undefined); // persistence is a convenience: the theme still applies for the session
    Appearance.setColorScheme?.(theme);
  }
  apply(theme);
}

export function useThemeMode() {
  const { theme, ready } = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
  return { theme, ready, toggle: () => setTheme(otherTheme(theme)) };
}
