import type { ThemeName } from "./palette";

export const THEME_STORAGE_KEY = "venti-theme";

// First visit (nothing stored): follow the system. Afterwards the person's choice wins.
export function resolveTheme(stored: string | null | undefined, prefersLight: boolean): ThemeName {
  if (stored === "light" || stored === "dark") return stored;
  return prefersLight ? "light" : "dark";
}
export const otherTheme = (theme: ThemeName): ThemeName => (theme === "dark" ? "light" : "dark");

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
const storage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // blocked storage (private mode, policies): the theme still works for the session
  }
};
export function readStoredTheme(source: Storage | null = storage()): string | null {
  try {
    return source?.getItem(THEME_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
export function storeTheme(theme: ThemeName, source: Storage | null = storage()) {
  try {
    source?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore: persistence is a convenience
  }
}
