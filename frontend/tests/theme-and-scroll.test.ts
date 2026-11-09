import { test } from "node:test";
import assert from "node:assert/strict";
import { otherTheme, readStoredTheme, resolveTheme, storeTheme, THEME_STORAGE_KEY } from "../src/components/ui/themePreference";
import { palettes } from "../src/components/ui/palette";
import { BACK_TO_TOP_OFFSET, shouldShowBackToTop } from "../src/components/ui/scroll";
import { ROLES, linksForRole, mobileBottomTabs, resolveActiveRole } from "../src/types/api";
import {
  buildCalendarMonth,
  formatArgDate,
  formatArgDateTime,
  formatArgTime,
  fromArgDateTimeToUtcIso,
  quickArgDates,
  toArgDateParts,
  validateOpeningHours,
  window as slotWindow,
} from "../src/features/marketplace/time";
import { getServerNow, updateClockOffset } from "../src/services/http";

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
      ["onPrimary/primaryPressed", solid(c.onPrimary), solid(c.primaryPressed), 4.5],
      ["onDanger/danger", solid(c.onDanger), solid(c.danger), 4.5],
      ["onDanger/dangerHover", solid(c.onDanger), solid(c.dangerHover), 4.5],
      ["onDanger/dangerStrong", solid(c.onDanger), solid(c.dangerStrong), 4.5],
      ["text/bg", solid(c.text), solid(c.bg), 4.5],
      ["text/surface", solid(c.text), solid(c.surface), 4.5],
      ["text/featuredBg", solid(c.text), solid(c.featuredBg), 4.5],
      ["muted/surfaceAlt", solid(c.muted), solid(c.surfaceAlt), 4.5],
      ["muted/surface", solid(c.muted), solid(c.surface), 4.5],
      ["muted/bg", solid(c.muted), solid(c.bg), 4.5],
      ["onSecondary/secondary", solid(c.onSecondary), solid(c.secondary), 4.5],
      ["onSecondary/secondaryHover", solid(c.onSecondary), solid(c.secondaryHover), 4.5],
      ["accent/bg", solid(c.accent), solid(c.bg), 4.5],
      ["accent/surface", solid(c.accent), solid(c.surface), 4.5],
      ["accentText/accentSoft", solid(c.accentText), over(c.accentSoft, solid(c.surfaceAlt)), 4.5],
      ["accentText/surface", solid(c.accentText), solid(c.surface), 4.5],
      ["coral/surface", solid(c.coral), solid(c.surface), 4.5],
      ["coral/bg", solid(c.coral), solid(c.bg), 4.5],
      ["dangerText/surface", solid(c.dangerText), solid(c.surface), 4.5],
      ["dangerText/dangerSoft", solid(c.dangerText), over(c.dangerSoft, solid(c.surface)), 4.5],
      ["successText/successSoft", solid(c.successText), over(c.successSoft, solid(c.surface)), 4.5],
      ["warningText/warningSoft", solid(c.warningText), over(c.warningSoft, solid(c.surface)), 4.5],
      ["infoText/infoSoft", solid(c.infoText), over(c.infoSoft, solid(c.surface)), 4.5],
      ["borderStrong/surfaceAlt", solid(c.borderStrong), solid(c.surfaceAlt), 3],
      ["focus/bg", solid(c.focus), solid(c.bg), 3],
    ];
    for (const [label, fg, bg, minimum] of pairs) assert.ok(ratio(fg, bg) >= minimum, `${label}: ${ratio(fg, bg).toFixed(2)}:1 < ${minimum}:1`);
  });
}

test("navegación multi-rol (Etapa 2): funciones compartidas permanentes y eliminación de duplicado /recommendations", () => {
  const permanentPaths = ["/discover", "/search", "/tickets", "/purchases", "/notifications", "/profile"];
  for (const role of ROLES) {
    for (const staff of [false, true]) {
      const links = linksForRole(role, staff);
      const paths = links.map((link) => link.path);
      for (const required of permanentPaths) {
        assert.ok(paths.includes(required), `rol ${role} (staff=${staff}) debe conservar ${required}`);
      }
      assert.equal(paths.includes("/recommendations"), false, `rol ${role} no debe duplicar /recommendations en la barra`);
      assert.equal(paths.includes("/staff"), staff, `rol ${role} (staff=${staff}) acceso a /staff`);

      const bottom = mobileBottomTabs(role, staff);
      assert.equal(bottom.length, 5, `barra inferior móvil de ${role} tiene exactamente 5 destinos`);
      const bottomPaths = bottom.map((item) => item.path);
      for (const required of ["/discover", "/tickets", "/notifications", "/profile"]) {
        assert.ok(bottomPaths.includes(required), `barra inferior móvil de ${role} incluye ${required}`);
      }
    }
  }
});

test("activeRole (Etapa 2): siempre se valida contra los roles reales de la cuenta", () => {
  assert.equal(resolveActiveRole(["COMPRADOR", "ARTISTA"], null), "ARTISTA");
  assert.equal(resolveActiveRole(["COMPRADOR", "ARTISTA"], "COMPRADOR"), "COMPRADOR");
  assert.equal(resolveActiveRole(["COMPRADOR", "ARTISTA"], "ADMIN"), "ARTISTA", "ignora rol preferido que la cuenta no posee");
  assert.equal(resolveActiveRole([], "ARTISTA"), "COMPRADOR");
});

test("calendario y zona horaria Argentina (Etapa 3 - M-07): conversión exacta entre America/Argentina/Buenos_Aires (UTC-3) y UTC", () => {
  // Un concierto el 14/11/2026 a las 22:00 hs en Argentina cruza la medianoche en UTC (15/11/2026 01:00:00.000Z).
  const utcIso = fromArgDateTimeToUtcIso("2026-11-14", "22:00");
  assert.equal(utcIso, "2026-11-15T01:00:00.000Z");

  // Al volver a editar el registro, toArgDateParts debe recuperar día 14 y hora 22:00 en horario local argentino.
  const parts = toArgDateParts(utcIso);
  assert.deepEqual(parts, {
    year: 2026,
    month: 11,
    day: 14,
    hour: 22,
    minute: 0,
    dateStr: "2026-11-14",
    timeStr: "22:00",
  });

  assert.equal(formatArgDate("2026-11-14"), "14/11/2026");
  assert.equal(formatArgDateTime(utcIso), "14/11/2026 · 22:00 hs");
  assert.equal(formatArgTime("20:30"), "20:30 hs");

  // Atajos rápidos en hora de Argentina (miércoles 11/11/2026 23:30 hs AR = jueves 12/11/2026 02:30Z)
  const wedNightUtcMs = Date.parse("2026-11-12T02:30:00.000Z");
  const shortcuts = quickArgDates(wedNightUtcMs);
  assert.equal(shortcuts.today, "2026-11-11");
  assert.equal(shortcuts.tomorrow, "2026-11-12");
  assert.equal(shortcuts.weekend, "2026-11-14");

  // Grilla mensual alineada lunes a domingo
  const nov2026 = buildCalendarMonth(2026, 11);
  assert.equal(nov2026.length % 7, 0);
  assert.equal(nov2026.filter((c) => c.day !== null).length, 30);

  // Franjas que cruzan medianoche y validación de opening_hours
  const w = slotWindow("2026-11-14", "22:00", "02:00");
  assert.equal(w.event_start_at, "2026-11-15T01:00:00.000Z");
  assert.equal(w.event_end_at, "2026-11-15T05:00:00.000Z");
  assert.equal(validateOpeningHours([{ day_of_week: 5, opens_at: "18:00", closes_at: "23:55" }]), null);
  assert.match(validateOpeningHours([{ day_of_week: 5, opens_at: "18:00", closes_at: "18:00" }]) ?? "", /no pueden ser iguales/);
});

test("reloj de servidor (Etapa 3 - M-08): calcula clockOffset respecto de cabecera HTTP Date", () => {
  const clientNow = 1700000000000;
  const serverIso = new Date(clientNow + 45000).toUTCString();
  updateClockOffset(serverIso, clientNow);
  assert.equal(getServerNow(clientNow), clientNow + 45000);
  updateClockOffset(new Date(clientNow).toUTCString(), clientNow);
});


