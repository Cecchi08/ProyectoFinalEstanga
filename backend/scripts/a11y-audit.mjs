// Auditoría automática básica de accesibilidad sobre el bundle web de producción, la API real y la MySQL aislada.
// Sin dependencias nuevas: Playwright (ya usado por el E2E) y chequeos en el navegador.
// Cubre: nombres accesibles y alt, contraste WCAG AA, foco visible, recorrido con Tab sin trampas y uso solo con teclado.
// Las funciones pasadas a page.evaluate corren en el navegador:
/* global getComputedStyle, CSS, Node, requestAnimationFrame */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import express from 'express';
import { TestDatabase, registration, password } from '../tests/helpers.js';
import { listenLoopback, LOOPBACK_BROWSER_ARGS } from './e2e-local.mjs';
const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium, expect } = requireFrontend('@playwright/test');

const db = new TestDatabase();
let context, apiServer, webServer, browser, concertId;
const report = {};
const WEB = 'http://localhost:8081';
const PUBLIC = ['/login', '/register', '/forgot-password'];
const SIGNED_IN = ['/discover', '/search', 'concert', '/purchases', '/tickets', '/profile', '/marketplace', '/services'];

before(async () => {
  await db.open(); db.env.AUTH_RATE_LIMIT_MAX = 10000; db.env.AUTH_RATE_LIMIT_WINDOW_MS = 1000; context = db.context();
  for (const name of ['buyer', 'organizer']) {
    await context.auth.register({ ...registration, email: `${name}@a11y.example`, first_name: name });
    await context.auth.verifyEmail(context.mailer.last('verification').token);
  }
  const [organizer] = await db.rows("SELECT id FROM users WHERE email = 'organizer@a11y.example'");
  await db.rows(`INSERT INTO concerts (organizer_user_id, title, slug, artist_name, venue_name, address_line, starts_at, status, published_at)
    VALUES (?, 'Concierto Accesible', 'concierto-accesible', 'Banda A11y', 'Estadio', 'Calle 1', DATE_ADD(NOW(), INTERVAL 30 DAY), 'PUBLISHED', NOW())`, [organizer.id]);
  [{ id: concertId }] = await db.rows("SELECT CAST(id AS CHAR) AS id FROM concerts WHERE slug = 'concierto-accesible'");
  await db.rows(`INSERT INTO ticket_types (concert_id, name, price, quantity_total, sales_start_at, sales_end_at, max_per_order)
    VALUES (?, 'General', 1000, 50, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY), 4)`, [concertId]);
  apiServer = await listenLoopback(context.app, 3000);
  const web = express(); web.use(express.static('../frontend/dist')); web.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: '../frontend/dist' }));
  webServer = await listenLoopback(web, 8081);
  browser = await chromium.launch({ args: LOOPBACK_BROWSER_ARGS, ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}), headless: true });
}, { timeout: 120000 });
after(async () => {
  await mkdir('../frontend/test-results', { recursive: true });
  await writeFile('../frontend/test-results/a11y-report.json', JSON.stringify(report, null, 2));
  await browser?.close();
  await Promise.all([apiServer, webServer].filter(Boolean).map(server => new Promise(resolve => server.close(resolve))));
  await db.close();
});

// Corre dentro de la página: devuelve elementos sin nombre accesible, imágenes sin alt y texto con contraste insuficiente.
function inspect() {
  const visible = el => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[aria-hidden="true"]');
  };
  const short = text => (text || '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const describe = el => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} "${short(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder'))}"`;
  const accessibleName = el => {
    const aria = el.getAttribute('aria-label')?.trim(); if (aria) return aria;
    const by = el.getAttribute('aria-labelledby');
    if (by) { const text = by.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim(); if (text) return text; }
    if (el.id) { const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (label?.textContent.trim()) return label.textContent.trim(); }
    const wrapper = el.closest('label'); if (wrapper?.textContent.trim()) return wrapper.textContent.trim();
    // Un placeholder no es una etiqueta: los campos de texto necesitan aria-label o <label>.
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && el.textContent.trim()) return el.textContent.trim();
    if (el.tagName === 'INPUT' && ['button', 'submit'].includes(el.type) && el.value) return el.value;
    return el.getAttribute('title')?.trim() ?? '';
  };
  const selector = 'a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=radio], [tabindex]:not([tabindex="-1"])';
  const interactive = [...document.querySelectorAll(selector)].filter(visible);
  // Estilo base (sin foco) para compararlo luego con el estilo enfocado, incluso si el foco lo pinta un estado de React.
  const focusKeys = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderColor', 'backgroundColor', 'color', 'textDecorationLine'];
  interactive.forEach((el, index) => {
    el.dataset.a11yId = String(index);
    const s = getComputedStyle(el); el.dataset.a11yBase = focusKeys.map(k => s[k]).join('|');
  });
  const unlabeled = interactive.filter(el => !accessibleName(el)).map(describe);
  const images = [...document.querySelectorAll('img')].filter(visible)
    .filter(img => !img.hasAttribute('alt') && img.getAttribute('role') !== 'presentation').map(img => img.src.slice(0, 80));

  const parse = value => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const luminance = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const backgroundOf = el => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') return null; // imagen o degradé: no se puede calcular de forma fiable
      const color = parse(style.backgroundColor);
      if (color && color.a > 0) { layers.push(color); if (color.a >= 1) break; }
    }
    return layers.reverse().reduce((acc, layer) => over(layer, acc), { r: 255, g: 255, b: 255, a: 1 });
  };
  const contrast = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('[disabled], [aria-disabled="true"]')) continue;
    const text = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
    if (!text) continue;
    const style = getComputedStyle(el); const background = backgroundOf(el); const fg = parse(style.color);
    if (!background || !fg) continue;
    const color = over(fg, background);
    const [light, dark] = [luminance(color), luminance(background)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    const size = parseFloat(style.fontSize); const weight = Number(style.fontWeight) || 400;
    const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    if (ratio < required) contrast.push(`${short(text)} → ${ratio.toFixed(2)}:1 (mínimo ${required}:1, ${style.color} sobre rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)}))`);
  }
  return { interactive: interactive.length, unlabeled, images, contrast: [...new Set(contrast)] };
}

// Recorre la página con Tab: cada elemento alcanzado debe mostrar un indicador de foco distinto de su estado sin foco.
async function tabWalk(page, total) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.mouse.click(1, 1);
  const reached = new Set(); const noIndicator = []; let previous = null; let repeats = 0;
  for (let step = 0; step < total + 15; step++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(async () => {
      // Dos frames: deja aplicar estilos de foco que dependen de un re-render (onFocus -> estado de React).
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const keys = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderColor', 'backgroundColor', 'color', 'textDecorationLine'];
      const s = getComputedStyle(el); const focused = keys.map(k => s[k]).join('|');
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      const changed = el.dataset.a11yBase !== undefined && focused !== el.dataset.a11yBase;
      return { id: el.dataset.a11yId ?? null, label: (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 50), indicator: changed || outline };
    });
    if (!info) continue;
    if (previous && info.id !== null && info.id === previous) { if (++repeats >= 3) return { reached, noIndicator, trapped: info.label }; } else repeats = 0;
    previous = info.id;
    if (info.id !== null) { if (reached.has(info.id)) break; reached.add(info.id); }
    if (!info.indicator) noIndicator.push(info.label);
  }
  return { reached, noIndicator: [...new Set(noIndicator)], trapped: null };
}

// Sin transiciones ni animaciones: los colores a mitad de un fundido falsearían el estilo base y el contraste.
const freeze = page => page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });

async function audit(page, path, viewport) {
  const url = path === 'concert' ? `${WEB}/concerts/${concertId}` : WEB + path;
  await page.goto(url); await page.waitForLoadState('networkidle'); await freeze(page); await page.waitForTimeout(300);
  await page.evaluate(async () => { document.activeElement?.blur(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const result = await page.evaluate(inspect);
  const entry = { url: url.replace(WEB, ''), viewport, ...result };
  if (viewport === 'desktop') {
    const walk = await tabWalk(page, result.interactive);
    const ids = await page.evaluate(() => [...document.querySelectorAll('[data-a11y-id]')]
      .filter(el => !el.matches('[disabled], [aria-disabled="true"]') && el.tabIndex >= 0).map(el => ({ id: el.dataset.a11yId, label: (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 50) })));
    entry.unreachable = ids.filter(item => !walk.reached.has(item.id)).map(item => item.label);
    entry.noFocusIndicator = walk.noIndicator; entry.keyboardTrap = walk.trapped;
  }
  report[`${entry.url} @${viewport}`] = entry;
  return entry;
}

async function login(page) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email', { exact: true }).fill('buyer@a11y.example');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Encontrá tu próximo show' })).toBeVisible();
}

const failures = entry => [
  ...entry.unlabeled.map(item => `sin nombre accesible: ${item}`),
  ...entry.images.map(item => `imagen sin alt: ${item}`),
  ...entry.contrast.map(item => `contraste: ${item}`),
  ...(entry.unreachable ?? []).map(item => `no alcanzable con Tab: ${item}`),
  ...(entry.noFocusIndicator ?? []).map(item => `sin foco visible: ${item}`),
  ...(entry.keyboardTrap ? [`trampa de foco en: ${entry.keyboardTrap}`] : []),
];

// Both themes: the first visit follows the emulated system preference.
for (const [viewport, size, colorScheme] of [['desktop', { width: 1440, height: 1000 }, 'dark'], ['mobile', { width: 390, height: 844 }, 'dark'],
  ['desktop', { width: 1440, height: 1000 }, 'light'], ['mobile', { width: 390, height: 844 }, 'light']]) {
  test(`accesibilidad (${viewport}, tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}): etiquetas, contraste, foco y teclado en pantallas públicas y de COMPRADOR`, async () => {
    const page = await (await browser.newContext({ viewport: size, colorScheme })).newPage();
    const problems = [];
    for (const path of PUBLIC) { const entry = await audit(page, path, viewport); problems.push(...failures(entry).map(p => `${entry.url}: ${p}`)); }
    await login(page);
    for (const path of SIGNED_IN) { const entry = await audit(page, path, viewport); problems.push(...failures(entry).map(p => `${entry.url}: ${p}`)); }
    assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
  }, { timeout: 240000 });
}

// Control negativo: si se anulan los estilos de foco, la auditoría debe detectarlo (el chequeo no es vacío).
test('control: sin indicadores de foco, la auditoría reporta los elementos afectados', async () => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await page.goto(`${WEB}/login`); await page.waitForLoadState('networkidle'); await freeze(page);
  // También :focus y :focus-visible: la app pinta el anillo de los botones con una regla :focus-visible propia.
  await page.addStyleTag({ content: '*, *:focus, *:focus-visible, [role]:focus-visible, a:focus-visible, input:focus-visible { outline: none !important; box-shadow: none !important; border-color: transparent !important; background-color: transparent !important; color: inherit !important; text-decoration-line: none !important; }' });
  const result = await page.evaluate(inspect);
  const walk = await tabWalk(page, result.interactive);
  assert.ok(walk.noIndicator.includes('Email') && walk.noIndicator.includes('Contraseña') && walk.noIndicator.includes('Ingresar'),
    JSON.stringify({ noIndicator: walk.noIndicator, reached: walk.reached.size }));
  // Mismo control para etiquetas y contraste: un botón sin nombre y un texto gris sobre gris deben reportarse.
  const fresh = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await fresh.goto(`${WEB}/login`); await fresh.waitForLoadState('networkidle'); await freeze(fresh);
  await fresh.evaluate(() => {
    const button = document.createElement('button'); button.style.cssText = 'width:40px;height:40px;'; document.body.prepend(button);
    const low = document.createElement('p'); low.textContent = 'texto de bajo contraste'; low.style.cssText = 'color:#777;background:#888;font-size:14px;'; document.body.prepend(low);
  });
  const controlled = await fresh.evaluate(inspect);
  assert.ok(controlled.unlabeled.some(item => item.startsWith('button')), JSON.stringify(controlled.unlabeled));
  assert.ok(controlled.contrast.some(item => item.startsWith('texto de bajo contraste')), JSON.stringify(controlled.contrast));
}, { timeout: 60000 });

test('teclado: el inicio de sesión se completa solo con Tab, escritura y Enter', async () => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await page.goto(`${WEB}/login`); await page.waitForLoadState('networkidle');
  await page.mouse.click(1, 1);
  const focusOn = async label => {
    for (let step = 0; step < 30; step++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(name => document.activeElement?.getAttribute('aria-label') === name || document.activeElement?.textContent?.trim() === name, label)) return;
    }
    assert.fail(`"${label}" no se alcanza con Tab`);
  };
  await focusOn('Email'); await page.keyboard.type('buyer@a11y.example');
  await focusOn('Contraseña'); await page.keyboard.type(password);
  await focusOn('Ingresar'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Encontrá tu próximo show' })).toBeVisible();
}, { timeout: 60000 });
