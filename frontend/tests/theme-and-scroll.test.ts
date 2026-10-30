import { test } from "node:test";
import assert from "node:assert/strict";
import { otherTheme, readStoredTheme, resolveTheme, storeTheme, THEME_STORAGE_KEY } from "../src/components/ui/themePreference";
import { palettes } from "../src/components/ui/palette";
import { BACK_TO_TOP_OFFSET, shouldShowBackToTop } from "../src/components/ui/scroll";

const memory = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
};

test("tema: la primera visita sigue la preferencia del sistema", () => {
  assert.equal(resolveTheme(null, true), "light");
  assert.equal(resolveTheme(null, false), "dark");
  assert.equal(resolveTheme("cualquier-cosa", true), "light", "un valor guardado inválido no cuenta como elección");
});

test("tema: la elección guardada gana sobre el sistema y la alternancia se persiste", () => {
  const storage = memory();
  storeTheme(otherTheme("light"), storage);
  assert.equal(storage.values.get(THEME_STORAGE_KEY), "dark");
  assert.equal(resolveTheme(readStoredTheme(storage), true), "dark");
  storeTheme(otherTheme("dark"), storage);
  assert.equal(resolveTheme(readStoredTheme(storage), false), "light");
});

test("tema: un almacenamiento bloqueado no rompe la app", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readStoredTheme(blocked), null);
  assert.doesNotThrow(() => storeTheme("light", blocked));
  assert.equal(resolveTheme(readStoredTheme(blocked), true), "light");
});

test("volver arriba: oculto hasta 350 px, visible después", () => {
  assert.equal(BACK_TO_TOP_OFFSET, 350);
  for (const y of [0, 120, 350]) assert.equal(shouldShowBackToTop(y), false, `y=${y}`);
  for (const y of [351, 800, 5000]) assert.equal(shouldShowBackToTop(y), true, `y=${y}`);
});

// Regression for the palette: every text pairing the components use must keep WCAG AA in both themes.
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const alpha = (hex: string) => (hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1);
const over = (top: string, bottom: number[]) => rgb(top).map((value, i) => value * alpha(top) + bottom[i] * (1 - alpha(top)));
const luminance = (color: number[]) =>
  color.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: number[], b: number[]) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
for (const name of ["dark", "light"] as const) {
  test(`contraste (${name}): texto AA y bordes de controles 3:1`, () => {
    const c = palettes[name];
    const solid = (hex: string) => rgb(hex);
    const pairs: [string, number[], number[], number][] = [
      ["onPrimary/primary", solid(c.onPrimary), solid(c.primary), 4.5],
      ["onPrimary/primaryHover", solid(c.onPrimary), solid(c.primaryHover), 4.5],
      ["onDanger/dangerStrong", solid(c.onDanger), solid(c.dangerStrong), 4.5],
      ["text/bg", solid(c.text), solid(c.bg), 4.5],
      ["text/surface", solid(c.text), solid(c.surface), 4.5],
      ["muted/surfaceAlt", solid(c.muted), solid(c.surfaceAlt), 4.5],
      ["muted/bg", solid(c.muted), solid(c.bg), 4.5],
      ["onPrimary/primaryPressed", solid(c.onPrimary), solid(c.primaryPressed), 4.5],
      ["onSecondary/secondary", solid(c.onSecondary), solid(c.secondary), 4.5],
      ["onSecondary/secondaryHover", solid(c.onSecondary), solid(c.secondaryHover), 4.5],
      ["accent/bg", solid(c.accent), solid(c.bg), 4.5],
      ["accent/surface", solid(c.accent), solid(c.surface), 4.5],
      ["accent/primarySoft", solid(c.accent), over(c.primarySoft, solid(c.surfaceAlt)), 4.5],
      ["coral/surface", solid(c.coral), solid(c.surface), 4.5],
      ["coral/bg", solid(c.coral), solid(c.bg), 4.5],
      ["danger/surface", solid(c.danger), solid(c.surface), 4.5],
      ["danger/dangerSoft", solid(c.danger), over(c.dangerSoft, solid(c.surface)), 4.5],
      ["success/successSoft", solid(c.success), over(c.successSoft, solid(c.surface)), 4.5],
      ["warning/warningSoft", solid(c.warning), over(c.warningSoft, solid(c.surface)), 4.5],
      ["info/infoSoft", solid(c.info), over(c.infoSoft, solid(c.surface)), 4.5],
      ["borderStrong/surfaceAlt", solid(c.borderStrong), solid(c.surfaceAlt), 3],
      ["focus/bg", solid(c.focus), solid(c.bg), 3],
    ];
    for (const [label, fg, bg, minimum] of pairs) assert.ok(ratio(fg, bg) >= minimum, `${label}: ${ratio(fg, bg).toFixed(2)}:1 < ${minimum}:1`);
  });
}
