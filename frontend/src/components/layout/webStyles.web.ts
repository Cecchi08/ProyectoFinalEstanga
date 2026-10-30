import { cssVar, palettes, shadowPalettes, type ThemeName } from "../ui/theme";
import { initTheme } from "../ui/themeMode";

// Both themes as CSS variables; components reference var(--venti-*), so only data-theme on <html> changes.
const variables = (theme: ThemeName) =>
  [
    ...Object.entries(palettes[theme]).map(([name, value]) => `${cssVar(name)}: ${value};`),
    ...Object.entries(shadowPalettes[theme]).map(([name, value]) => `${cssVar(`shadow-${name}`)}: ${value};`),
  ].join(" ");

const css = `
:root, :root[data-theme="dark"] { ${variables("dark")} color-scheme: dark; }
:root[data-theme="light"] { ${variables("light")} color-scheme: light; }
html, body { background-color: var(--venti-bg); }
::selection { background-color: var(--venti-primary); color: var(--venti-on-primary); }
* { scrollbar-color: var(--venti-border-strong) transparent; scrollbar-width: thin; }
[role="button"], [role="tab"], [role="switch"], a, input, textarea {
  transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease,
    color 160ms ease, opacity 160ms ease, transform 120ms ease;
}
[role="button"]:focus-visible, [role="tab"]:focus-visible, [role="switch"]:focus-visible, a:focus-visible {
  outline: 2px solid var(--venti-focus) !important;
  outline-offset: 2px;
}
input:focus-visible, textarea:focus-visible { outline: none; }
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
`;

export function installWebStyles() {
  if (typeof document === "undefined") return;
  if (!document.getElementById("venti-theme")) {
    const style = document.createElement("style");
    style.id = "venti-theme";
    style.textContent = css;
    document.head.appendChild(style);
  }
  initTheme();
}
