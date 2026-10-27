import { colors } from "../ui/theme";

// The theme is also exposed as CSS variables (--venti-primary, ...) so these rules follow it.
const variables = Object.entries(colors)
  .map(([name, value]) => `--venti-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${value};`)
  .join(" ");

const css = `
:root { ${variables} color-scheme: dark; }
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
  * { transition: none !important; animation: none !important; }
}
`;

export function installWebStyles() {
  if (typeof document === "undefined" || document.getElementById("venti-theme")) return;
  const style = document.createElement("style");
  style.id = "venti-theme";
  style.textContent = css;
  document.head.appendChild(style);
}
