// UI checks on the production web bundle with the real API and the isolated MySQL:
// theme toggle and persistence, "Volver arriba" and responsive layout from 320 px, in both themes.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import express from 'express';
import { TestDatabase, registration, password } from '../tests/helpers.js';
import { listenLoopback, LOOPBACK_BROWSER_ARGS } from './e2e-local.mjs';
import { palettes } from '../../frontend/src/components/ui/palette.ts';
const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium, expect } = requireFrontend('@playwright/test');

const db = new TestDatabase();
let context, apiServer, webServer, browser, concertId;
const WEB = 'http://localhost:8081';
const SHOTS = '../frontend/test-results/ui';

before(async () => {
  await db.open(); db.env.AUTH_RATE_LIMIT_MAX = 10000; db.env.AUTH_RATE_LIMIT_WINDOW_MS = 1000; context = db.context();
  for (const name of ['buyer', 'organizer']) {
    await context.auth.register({ ...registration, email: `${name}@ui.example`, first_name: name });
    await context.auth.verifyEmail(context.mailer.last('verification').token);
  }
  const [organizer] = await db.rows("SELECT id FROM users WHERE email = 'organizer@ui.example'");
  // Enough published concerts for a page that scrolls well past 350 px.
  for (let index = 1; index <= 24; index++) {
    await db.rows(`INSERT INTO concerts (organizer_user_id, title, slug, artist_name, venue_name, address_line, starts_at, status, published_at)
      VALUES (?, ?, ?, 'Banda Demo', 'Estadio', 'Calle 1', DATE_ADD(NOW(), INTERVAL ? DAY), 'PUBLISHED', NOW())`, [organizer.id, `Noche ${index}`, `noche-${index}`, 10 + index]);
  }
  [{ id: concertId }] = await db.rows("SELECT CAST(id AS CHAR) AS id FROM concerts WHERE slug = 'noche-1'");
  await db.rows(`INSERT INTO ticket_types (concert_id, name, price, quantity_total, sales_start_at, sales_end_at, max_per_order)
    VALUES (?, 'General', 1000, 50, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 9 DAY), 4)`, [concertId]);
  apiServer = await listenLoopback(context.app, 3000);
  const web = express(); web.use(express.static('../frontend/dist')); web.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: '../frontend/dist' }));
  webServer = await listenLoopback(web, 8081);
  browser = await chromium.launch({ args: LOOPBACK_BROWSER_ARGS, ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}), headless: true });
  await mkdir(SHOTS, { recursive: true });
}, { timeout: 120000 });
after(async () => {
  await browser?.close();
  await Promise.all([apiServer, webServer].filter(Boolean).map(server => new Promise(resolve => server.close(resolve))));
  await db.close();
});

const theme = page => page.evaluate(() => document.documentElement.dataset.theme);
// Expected backgrounds come from the palette itself, so a palette change does not need test edits.
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const [LIGHT_BG, DARK_BG] = [rgb(palettes.light.bg), rgb(palettes.dark.bg)];
const themeColor = page => page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
const background = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor); // eslint-disable-line no-undef
async function login(page) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email', { exact: true }).fill('buyer@ui.example');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Encontrá tu próximo show' })).toBeVisible();
}

test('tema: la primera visita sigue al sistema; el botón alterna, persiste y sobrevive a la recarga', async () => {
  for (const scheme of ['light', 'dark']) {
    const page = await (await browser.newContext({ colorScheme: scheme })).newPage();
    await page.goto(`${WEB}/login`); await page.waitForLoadState('networkidle');
    assert.equal(await theme(page), scheme, `primera visita con sistema ${scheme}`);
  }
  const page = await (await browser.newContext({ colorScheme: 'light' })).newPage();
  await page.goto(`${WEB}/login`); await page.waitForLoadState('networkidle');
  assert.equal(await background(page), LIGHT_BG);
  await page.getByRole('button', { name: 'Activar tema oscuro', exact: true }).click();
  assert.equal(await theme(page), 'dark');
  assert.equal(await background(page), DARK_BG);
  assert.equal(await themeColor(page), palettes.dark.bg, 'la barra del navegador sigue al tema');
  assert.equal(await page.evaluate(() => localStorage.getItem('venti-theme')), 'dark'); // eslint-disable-line no-undef
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await theme(page), 'dark', 'la elección gana sobre el sistema (claro)');
  await expect(page.getByRole('button', { name: 'Activar tema claro', exact: true })).toBeVisible();
  // Dentro de la app el botón también está y aplica a toda la interfaz.
  await login(page);
  await page.getByRole('button', { name: 'Activar tema claro', exact: true }).click();
  assert.equal(await theme(page), 'light');
  assert.equal(await background(page), LIGHT_BG);
});

test('validación en el navegador: errores junto al campo, envío bloqueado sin pedido a la API y envío correcto al corregir', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  let posts = 0;
  page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/auth/register')) posts++; });
  await page.goto(`${WEB}/register`); await page.waitForLoadState('networkidle');
  const first = page.getByLabel('Nombre', { exact: true });
  await first.fill('Ana2'); await first.blur();
  await expect(page.getByText('Usá solo letras, espacios, apóstrofos, puntos o guiones.')).toBeVisible();
  assert.equal(await first.getAttribute('aria-invalid'), 'true');
  const describedBy = await first.getAttribute('aria-describedby');
  assert.ok(describedBy && await page.locator(`[id="${describedBy}"]`).count() === 1, 'el error está asociado al campo');
  await page.getByLabel('Email', { exact: true }).fill('ana@');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText(/Revisá los \d+ campos marcados\./)).toBeVisible();
  await expect(page.getByText('Este campo es obligatorio.').first()).toBeVisible();
  assert.equal(posts, 0, 'no se envía nada con campos inválidos');
  await first.fill('Ana María'); await page.getByLabel('Apellido', { exact: true }).fill("O'Connor");
  await page.getByLabel('Email', { exact: true }).fill('ana.valida@ui.example');
  await page.getByLabel('Contraseña (mínimo 12 caracteres)', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect.poll(() => posts, { timeout: 5000 }).toBe(1);
  await expect(page.getByText(/Revisá (el campo|los \d+ campos) marcados?\./)).toHaveCount(0);
}, { timeout: 60000 });

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`volver arriba (${reducedMotion}): oculto al inicio, visible pasados 350 px, vuelve arriba y devuelve el foco al título`, async () => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 700 }, reducedMotion })).newPage();
    await login(page);
    const button = page.getByRole('button', { name: 'Volver arriba', exact: true });
    await expect(button).toHaveCount(0);
    const scroller = page.getByRole('heading', { name: 'Encontrá tu próximo show' });
    await scroller.hover();
    const scrollTop = () => page.evaluate(() => Math.max(...[...document.querySelectorAll('div')].map(el => el.scrollTop)));
    await page.mouse.wheel(0, 300); await page.waitForTimeout(250);
    assert.ok(await scrollTop() <= 350); await expect(button).toHaveCount(0);
    await page.mouse.wheel(0, 900); await page.waitForTimeout(400);
    assert.ok(await scrollTop() > 350, `scroll ${await scrollTop()}`);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    assert.ok(box && box.x + box.width <= 390 && box.y + box.height <= 700, 'dentro de la pantalla');
    await button.click();
    if (reducedMotion === 'reduce') assert.equal(await scrollTop(), 0, 'sin animación: llega al inicio de inmediato');
    await expect.poll(scrollTop, { timeout: 3000 }).toBe(0);
    await expect(button).toHaveCount(0);
    assert.ok(await page.evaluate(() => document.activeElement?.textContent?.includes('Encontrá tu próximo show')), 'el foco queda en el encabezado');
  }, { timeout: 60000 });
}

// No horizontal scroll and no control pushed off-screen, except inside intentional horizontal scrollers (tab bar).
async function overflow(page) {
  return page.evaluate(() => {
    const scrollsX = el => { for (let node = el.parentElement; node; node = node.parentElement) { const s = getComputedStyle(node); if (['auto', 'scroll'].includes(s.overflowX) && !['auto', 'scroll'].includes(s.overflowY) && node.scrollWidth > node.clientWidth) return true; } return false; }; // eslint-disable-line no-undef
    const width = window.innerWidth;
    const cut = [...document.querySelectorAll('[role="button"], [role="tab"], input, textarea')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && !scrollsX(el) && (r.left < -1 || r.right > width + 1);
    }).map(el => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40));
    // Any visible box (cards, notices, images) sticking out of the viewport, not only controls.
    const sticking = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || scrollsX(el)) return false;
      if (r.right > width + 1) return true;
      // Also a box overflowing its own container (e.g. a card wider than its list at 320 px), unless it is positioned.
      const parent = el.parentElement; if (!parent || ['absolute', 'fixed'].includes(getComputedStyle(el).position)) return false; // eslint-disable-line no-undef
      const p = parent.getBoundingClientRect(); return p.width > 0 && r.right > p.right + 1 && getComputedStyle(parent).overflowX === 'visible'; // eslint-disable-line no-undef
    }).map(el => `${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 30)}" right=${Math.round(el.getBoundingClientRect().right)}`);
    // 2D geometric intersection check between sibling cards and interactive controls (boundingBox),
    // compatible with multi-column responsive grids and excluding intentional overlays (MusicalCover internal badges, fixed bars, modals).
    const intentionalOverlay = el => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const s = getComputedStyle(node); // eslint-disable-line no-undef
        if (['fixed', 'sticky'].includes(s.position)) return true;
        if (node.getAttribute('role') === 'dialog' || node.getAttribute('aria-modal') === 'true') return true;
        if (node.getAttribute('aria-label') === 'Volver arriba') return true;
        if (node.dataset && node.dataset.bentoMedia === 'true' && node !== el) return true;
      }
      return false;
    };
    const scrollParent = el => {
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const s = getComputedStyle(node); // eslint-disable-line no-undef
        if (['auto', 'scroll', 'hidden'].includes(s.overflowY) || ['auto', 'scroll', 'hidden'].includes(s.overflowX)) return node;
      }
      return null;
    };
    const clippedRect = (el, stopAt) => {
      let r = el.getBoundingClientRect();
      let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
      for (let node = el.parentElement; node && node !== document.body && node !== stopAt; node = node.parentElement) {
        const s = getComputedStyle(node); // eslint-disable-line no-undef
        if (['auto', 'scroll', 'hidden'].includes(s.overflowY) || ['auto', 'scroll', 'hidden'].includes(s.overflowX)) {
          const pr = node.getBoundingClientRect();
          left = Math.max(left, pr.left);
          top = Math.max(top, pr.top);
          right = Math.min(right, pr.right);
          bottom = Math.min(bottom, pr.bottom);
        }
      }
      return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    };
    const overlaps = [];
    const checkGroup = (items, kind) => {
      const visibleItems = items.filter(el => {
        const s = getComputedStyle(el); // eslint-disable-line no-undef
        if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !intentionalOverlay(el);
      });
      for (let i = 0; i < visibleItems.length; i++) {
        const elA = visibleItems[i];
        const spA = scrollParent(elA);
        for (let j = i + 1; j < visibleItems.length; j++) {
          const elB = visibleItems[j];
          if (elA.contains(elB) || elB.contains(elA)) continue;
          const spB = scrollParent(elB);
          const sameScroller = spA === spB;
          const rectA = sameScroller ? elA.getBoundingClientRect() : clippedRect(elA, null);
          const rectB = sameScroller ? elB.getBoundingClientRect() : clippedRect(elB, null);
          if (rectA.width <= 0 || rectA.height <= 0 || rectB.width <= 0 || rectB.height <= 0) continue;
          if (
            rectA.left < rectB.right - 1 &&
            rectA.right > rectB.left + 1 &&
            rectA.top < rectB.bottom - 1 &&
            rectA.bottom > rectB.top + 1
          ) {
            const labelA = (elA.getAttribute('aria-label') || elA.textContent || elA.tagName).trim().slice(0, 25);
            const labelB = (elB.getAttribute('aria-label') || elB.textContent || elB.tagName).trim().slice(0, 25);
            overlaps.push(`${kind}: "${labelA}" intersects "${labelB}"`);
          }
        }
      }
    };
    checkGroup([...document.querySelectorAll('[data-bento-card="true"]')], 'card');
    checkGroup([...document.querySelectorAll('[role="button"], [role="tab"], input, textarea')], 'control');
    return { page: document.documentElement.scrollWidth - width, cut, sticking: [...new Set(sticking)].slice(0, 5), overlaps: [...new Set(overlaps)].slice(0, 5) };
  });
}
for (const mode of ['light', 'dark']) {
  test(`responsive (${mode}): sin scroll horizontal, controles cortados ni superposiciones 2D de 320 px a escritorio`, async () => {
    const problems = [];
    for (const [width, height] of [[320, 640], [390, 844], [768, 1024], [1440, 1000]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: mode });
      const page = await ctx.newPage();
      for (const path of ['/login', '/register']) {
        await page.goto(WEB + path); await page.waitForLoadState('networkidle');
        const result = await overflow(page);
        if (result.page > 1 || result.cut.length || result.sticking.length || result.overlaps.length) problems.push(`${path}@${width}: ${JSON.stringify(result)}`);
        if (width === 320 || width === 1440) await page.screenshot({ path: `${SHOTS}/${mode}-${width}${path.replace('/', '-')}.png` });
      }
      await login(page);
      for (const path of ['/discover', `/concerts/${concertId}`, '/marketplace', '/services', '/profile', '/tickets']) {
        await page.goto(WEB + path); await page.waitForLoadState('networkidle'); await page.waitForTimeout(200);
        const result = await overflow(page);
        if (result.page > 1 || result.cut.length || result.sticking.length || result.overlaps.length) problems.push(`${path}@${width}: ${JSON.stringify(result)}`);
        if (width === 320 || width === 1440) await page.screenshot({ path: `${SHOTS}/${mode}-${width}${path.replace(/\//g, '-').replace(/-\d+$/, '')}.png` });
      }
      await ctx.close();
    }
    assert.deepEqual(problems, [], problems.join('\n'));
  }, { timeout: 240000 });
}
