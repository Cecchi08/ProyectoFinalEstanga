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
html, body {
  background-color: var(--venti-bg);
  font-family: "Geist", "Inter", "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
}
::selection { background-color: var(--venti-primary); color: var(--venti-on-primary); }
* { scrollbar-color: var(--venti-border-strong) transparent; scrollbar-width: thin; box-sizing: border-box; }
@keyframes ventiBentoIn {
  from { transform: translateY(5px) scale(0.992); }
  to { transform: translateY(0) scale(1); }
}
[data-bento-card="true"] {
  animation: ventiBentoIn 240ms cubic-bezier(0.22, 1, 0.36, 1);
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 180ms ease,
    background-color 180ms ease;
}
[data-bento-card="true"]:hover {
  transform: translateY(-2px);
  box-shadow: var(--venti-shadow-card-hover);
}
[data-bento-media="true"] img {
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
[data-bento-card="true"]:hover [data-bento-media="true"] img {
  transform: scale(1.025);
}
[role="button"], [role="tab"], [role="switch"], a, input, textarea {
  transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease,
    color 160ms ease, opacity 160ms ease, transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
}
[role="button"]:focus-visible, [role="tab"]:focus-visible, [role="switch"]:focus-visible, a:focus-visible {
  outline: 2px solid var(--venti-focus) !important;
  outline-offset: 2px;
}
input:focus-visible, textarea:focus-visible { outline: none; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
    transform: none !important;
  }
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
