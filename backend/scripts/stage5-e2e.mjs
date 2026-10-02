// Real API + isolated MySQL + production Expo bundle. No routes are mocked.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import express from 'express';
import { TestDatabase, registration, password } from '../tests/helpers.js';
const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium, expect } = requireFrontend('@playwright/test');
const { PNG } = requireFrontend('pngjs');
const jsQR = requireFrontend('jsqr');
const db = new TestDatabase();
let context, apiServer, webServer, browser;
const accounts = {};
before(async () => {
  await db.open(); db.env.AUTH_RATE_LIMIT_MAX = 10000; db.env.AUTH_RATE_LIMIT_WINDOW_MS = 1000; context = db.context();
  for (const [name, roles] of Object.entries({admin:['ADMIN'], organizer:['USER','ORGANIZER'], staff:['USER','STAFF']})) {
    const account = await context.auth.register({...registration,email:`${name}@e2e.example`,first_name:name});
    await context.auth.verifyEmail(context.mailer.last('verification').token);
    for (const role of roles.filter(value => value !== 'USER')) await db.rows('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?',[account.user.id,role]);
    accounts[name] = account.user.id;
  }
  await db.rows('INSERT INTO organizer_profiles(user_id,display_name) VALUES (?,?)',[accounts.organizer,'VENTI E2E']);
  // Production client uses localhost:3000. Bind only loopback.
  apiServer = await new Promise(resolve => {const server = context.app.listen(3000,'127.0.0.1',() => resolve(server));});
  const web = express(); web.use(express.static('../frontend/dist')); web.get('/{*path}',(_req,res) => res.sendFile('index.html',{root:'../frontend/dist'}));
  webServer = await new Promise(resolve => {const server = web.listen(8081,'127.0.0.1',() => resolve(server));});
  browser = await chromium.launch({channel:'msedge',headless:true});
  await mkdir('../frontend/test-results',{recursive:true});
});
after(async () => {await browser?.close(); await Promise.all([apiServer,webServer].filter(Boolean).map(server => new Promise(resolve => server.close(resolve)))); await db.close();});
async function login(page,name) {await page.goto('http://localhost:8081/login'); await page.getByLabel('Email',{exact:true}).fill(`${name}@e2e.example`); await page.getByLabel('Contraseña',{exact:true}).fill(password); await page.getByRole('button',{name:'Ingresar',exact:true}).click(); await expect(page.getByRole('heading',{name:'Encontrá tu próximo show'})).toBeVisible();}
async function logout(page) {await page.getByRole('tab',{name:'Mi cuenta',exact:true}).click(); await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click(); await expect(page.getByRole('button',{name:'Ingresar',exact:true})).toBeVisible();}
async function choose(page,label,option) {await page.getByRole('button',{name:label,exact:true}).click(); await page.getByRole('button',{name:option,exact:true}).click();}
for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) test(`full application flow at ${viewport.width}px`, {timeout:180000}, async () => {
  const suffix = String(viewport.width); const browserContext = await browser.newContext({viewport}); const page = await browserContext.newPage(); const errors = []; page.on('pageerror',error => errors.push(error.message));
  page.on('requestfailed', request => console.error('Request failed:', new URL(request.url()).pathname, request.failure()?.errorText));
  try {
    // Guards, registration and email fragment consumption.
    await page.goto('http://localhost:8081/organizer'); await expect(page.getByRole('button',{name:'Ingresar',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Registrarse',exact:true}).click();
    await page.getByLabel('Nombre',{exact:true}).fill('Comprador'); await page.getByLabel('Apellido',{exact:true}).fill('VENTI');
    await page.getByLabel('Email',{exact:true}).fill(`user${suffix}@e2e.example`); await page.getByLabel('Contraseña (mínimo 12 caracteres)',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Continuar',exact:true}).click(); await expect(page.getByText('Cuenta creada.',{exact:false})).toBeVisible();
    const verification = context.mailer.last('verification').token;
    await page.goto(`http://localhost:8081/verify-email#token=${verification}`); await expect(page.getByLabel('Token del enlace de email')).toHaveValue(verification); await page.getByRole('button',{name:'Continuar',exact:true}).click(); await expect(page.getByRole('alert')).toBeVisible();
    // All five admin catalogs created through UI.
    await login(page,'admin'); await page.getByRole('tab',{name:'Admin',exact:true}).click();
    async function catalog(tab,name,prepare) {await page.getByRole('button',{name:tab,exact:true}).click(); await page.getByRole('button',{name:`Crear en ${tab}`,exact:true}).click(); await page.getByLabel('Nombre',{exact:true}).fill(name); if (prepare) await prepare(); await page.getByRole('button',{name:'Guardar catálogo',exact:true}).click(); await expect(page.getByRole('button',{name:`Editar ${name}`,exact:true})).toBeVisible();}
    await catalog('Provincias',`Provincia ${suffix}`); await catalog('Ciudades',`Ciudad ${suffix}`,() => choose(page,'Provincia',`Provincia ${suffix}`));
    await catalog('Venues',`Sala ${suffix}`,async () => {await choose(page,'Ciudad',`Ciudad ${suffix}`); await page.getByLabel('Dirección',{exact:true}).fill('Calle Música 123');});
    await catalog('Géneros',`Rock ${suffix}`); await catalog('Artistas',`Banda ${suffix}`); await logout(page);
    // Organizer's multi-role menu and CRUD/publication.
    await login(page,'organizer'); await page.getByRole('tab',{name:'Organizer',exact:true}).click(); await page.getByRole('button',{name:'Crear concierto',exact:true}).click();
    await page.getByLabel('Nombre del concierto',{exact:true}).fill(`VENTI Live ${suffix}`); await page.getByLabel('Inicio (ISO con zona horaria)',{exact:true}).fill(new Date(Date.now()+30*86400000).toISOString());
    await choose(page,'Venue',`Sala ${suffix}`); await page.getByRole('button',{name:'Tipo de concierto',exact:true}).click(); await page.getByRole('button',{name:'Concierto',exact:true}).click();
    await choose(page,'Artistas',`Banda ${suffix}`); await choose(page,'Géneros',`Rock ${suffix}`); await page.getByRole('button',{name:'Guardar concierto',exact:true}).click();
    await expect(page.getByRole('button',{name:'Agregar tipo de entrada',exact:true})).toBeVisible();
    const concertId = new URL(page.url()).pathname.split('/').pop();
    await page.getByRole('button',{name:'Agregar tipo de entrada',exact:true}).click(); await page.getByLabel('Nombre de entrada',{exact:true}).fill('General'); await page.getByLabel('Precio',{exact:true}).fill('1200'); await page.getByLabel('Cupo total',{exact:true}).fill('20'); await page.getByRole('button',{name:'Guardar tipo de entrada',exact:true}).click(); await expect(page.getByRole('button',{name:'Editar General',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Publicar concierto',exact:true}).click(); await expect(page.getByText(`#${concertId} · PUBLISHED`,{exact:true})).toBeVisible();
    await db.rows('INSERT INTO staff_assignments(concert_id,user_id,assigned_by_user_id) VALUES (?,?,?)',[concertId,accounts.staff,accounts.organizer]);
    await logout(page);
    // User discovery, filters, persisted session, favorites, reservation and confirmation.
    await login(page,`user${suffix}`); await page.reload(); await expect(page.getByRole('heading',{name:'Encontrá tu próximo show'})).toBeVisible();
    await page.getByLabel('Buscar conciertos o artistas').fill(`VENTI Live ${suffix}`); await page.getByRole('button',{name:'Buscar',exact:true}).click(); await page.getByRole('button',{name:`Ver VENTI Live ${suffix}`,exact:true}).click();
    await page.getByRole('button',{name:'Guardar favorito',exact:true}).click(); await expect(page.getByRole('button',{name:'Quitar de favoritos',exact:true})).toBeVisible();
    const storedFavorite = await db.rows('SELECT f.user_id FROM favorites f JOIN users u ON u.id=f.user_id WHERE u.email=? AND f.concert_id=?', [`user${suffix}@e2e.example`, concertId]);
    assert.equal(storedFavorite.length, 1);
    const secondDevice = await browser.newContext({viewport});
    try {
      const otherPage = await secondDevice.newPage(); await login(otherPage,`user${suffix}`);
      await otherPage.getByRole('tab',{name:'Favoritos',exact:true}).click();
      await expect(otherPage.getByRole('button',{name:`Ver VENTI Live ${suffix}`,exact:true})).toBeVisible();
      await otherPage.getByRole('button',{name:`Quitar favorito VENTI Live ${suffix}`,exact:true}).click();
      await expect(otherPage.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
    } finally { await secondDevice.close(); }
    await page.reload(); await expect(page.getByRole('button',{name:'Guardar favorito',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'Guardar favorito',exact:true}).click(); await expect(page.getByRole('button',{name:'Quitar de favoritos',exact:true})).toBeVisible();
    // Discover honors persisted preferences and does not even request recommendations while OFF.
    let recommendationRequests = 0;
    page.on('request', req => {const url = new URL(req.url()); if (url.origin === 'http://localhost:3000' && url.pathname === '/recommendations') recommendationRequests++;});
    await page.getByRole('tab',{name:'Mi cuenta',exact:true}).click();
    await page.getByRole('switch',{name:'Recomendaciones personalizadas',exact:true}).click();
    await expect(page.getByText('OFF · No se solicitan recomendaciones personalizadas.',{exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'Venti Discover',exact:true}).click();
    await expect(page.getByText('Las recomendaciones personalizadas están desactivadas.',{exact:true})).toBeVisible();
    assert.equal(recommendationRequests,0);
    await page.reload(); await expect(page.getByText('Las recomendaciones personalizadas están desactivadas.',{exact:true})).toBeVisible();
    assert.equal(recommendationRequests,0);
    await page.getByRole('button',{name:'Ir a preferencias',exact:true}).click();
    await page.getByRole('switch',{name:'Recomendaciones personalizadas',exact:true}).click();
    await expect(page.getByText('ON · Usamos tus entradas y favoritos para sugerirte conciertos.',{exact:true})).toBeVisible();
    const discoverResponse = page.waitForResponse(res => {const url = new URL(res.url()); return url.origin === 'http://localhost:3000' && url.pathname === '/recommendations' && res.status() === 200;});
    await page.getByRole('tab',{name:'Venti Discover',exact:true}).click();
    const discovery = (await (await discoverResponse).json()).data;
    assert.equal(discovery.enabled,true); assert.ok(discovery.recommendations.some(item => item.concert.id === concertId));
    assert.ok(discovery.recommendations.every(item => !('score' in item)));
    await expect(page.getByText(/Porque guardaste este concierto en favoritos/)).toBeVisible();
    await page.screenshot({path:`../frontend/test-results/discover-${suffix}.png`,fullPage:true});
    await page.getByRole('button',{name:`Ver VENTI Live ${suffix}`,exact:true}).click();
    await page.getByLabel('Cantidad General').fill('1'); await page.getByRole('button',{name:'Reservar entradas',exact:true}).click(); await page.getByRole('button',{name:'Confirmar compra',exact:true}).click(); await page.getByRole('button',{name:'Ver mis entradas QR',exact:true}).click();
    const qr = page.locator('[aria-label^="QR de entrada"]'); await expect(qr).toBeVisible();
    const png = PNG.sync.read(await qr.screenshot()); const decoded = jsQR(new Uint8ClampedArray(png.data),png.width,png.height); assert.ok(decoded); assert.match(decoded.data,/^[a-f0-9]{64}$/);
    await page.screenshot({path:`../frontend/test-results/tickets-${suffix}.png`,fullPage:true});
    await page.getByRole('tab',{name:'Venti Discover',exact:true}).click();
    await expect(page.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
    await page.goto('http://localhost:8081/admin'); await expect(page.getByRole('heading',{name:'Sin permiso'})).toBeVisible();
    await logout(page);
    // Real validation, then replay rejection, via the web-compatible scanner input.
    await login(page,'staff'); await page.getByRole('tab',{name:'Staff',exact:true}).click();
    await expect(page.getByLabel('ID del concierto asignado')).toHaveCount(0);
    await page.getByRole('button',{name:`Seleccionar VENTI Live ${suffix}`,exact:true}).click();
    await expect(page.getByText('Comprador VENTI',{exact:true})).toBeVisible();
    await page.getByLabel('Token QR',{exact:true}).fill(decoded.data); await page.getByRole('button',{name:'Validar entrada',exact:true}).click(); await expect(page.getByText('Entrada válida · Ingreso registrado',{exact:true})).toBeVisible();
    await expect(page.getByText(/Entrada #\d+ · General · USED/)).toBeVisible();
    await page.getByRole('button',{name:'Siguiente entrada',exact:true}).click(); await page.getByLabel('Token QR',{exact:true}).fill(decoded.data); await page.getByRole('button',{name:'Validar entrada',exact:true}).click(); await expect(page.getByText('Entrada ya utilizada',{exact:true})).toBeVisible();
    await page.screenshot({path:`../frontend/test-results/staff-${suffix}.png`,fullPage:true});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
    await logout(page);
    // Editing and cancelling the concert preserve its history.
    await login(page,'organizer'); await page.goto(`http://localhost:8081/organizer/${concertId}`);
    await page.getByLabel('Nombre del concierto',{exact:true}).fill(`VENTI Editado ${suffix}`); await page.getByRole('button',{name:'Guardar concierto',exact:true}).click(); await expect(page.getByText('Concierto guardado.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Editar General',exact:true}).click(); await page.getByLabel('Precio',{exact:true}).fill('1300'); await page.getByRole('button',{name:'Guardar tipo de entrada',exact:true}).click(); await expect(page.getByText('General · $ 1300.00 · Cupo 20',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Cancelar concierto',exact:true}).click(); await page.getByRole('button',{name:'Confirmar cancelación',exact:true}).click(); await expect(page.getByText(`#${concertId} · CANCELLED`,{exact:true})).toBeVisible();
    await logout(page);
    // Password recovery from the real email outbox, through the reset form.
    await page.goto('http://localhost:8081/forgot-password'); await page.getByLabel('Email',{exact:true}).fill(`user${suffix}@e2e.example`); await page.getByRole('button',{name:'Continuar',exact:true}).click(); await expect(page.getByRole('alert')).toBeVisible();
    const reset = context.mailer.last('reset').token; await page.goto(`http://localhost:8081/reset-password#token=${reset}`); await page.getByLabel('Contraseña (mínimo 12 caracteres)',{exact:true}).fill(password); await page.getByRole('button',{name:'Continuar',exact:true}).click(); await expect(page.getByRole('alert')).toBeVisible();
    await login(page,`user${suffix}`); await logout(page);
    if (viewport.width === 1440 && !process.env.VENTI_SKIP_OAUTH_TESTS) {
      // Only the external provider authorization is controlled. Backend cookies,
      // state, fixed callback, PKCE exchange and client session all run unchanged.
      await page.route(/^http:\/\/localhost:3000\/auth\/oauth\/(google|github|facebook)\?/, async route => {
        const response = await route.fetch({maxRedirects:0});
        const url = new URL(response.headers().location); const provider = new URL(route.request().url()).pathname.split('/').pop();
        await route.fulfill({response,status:302,headers:{...response.headers(),location:`http://localhost:3000/auth/oauth/${provider}/callback?state=${url.searchParams.get('state')}&code=controlled-provider-code`}});
      });
      for (const provider of ['google','github','facebook']) {
        await page.getByRole('button',{name:provider,exact:true}).click(); await expect(page.getByRole('heading',{name:'Encontrá tu próximo show'})).toBeVisible();
        assert.equal(new URL(page.url()).search,''); await logout(page);
      }
    }
    assert.deepEqual(errors,[]);
  } finally {await browserContext.close();}
});
test('catalog update/delete, pagination, draft delete, empty and retry states', {timeout:120000}, async () => {
  const browserContext = await browser.newContext({viewport:{width:768,height:1024}}); const page = await browserContext.newPage();
  try {
    for (let index=0;index<22;index++) await db.rows('INSERT INTO provinces(name) VALUES (?)',[`Test provincia ${String(index).padStart(2,'0')}`]);
    await login(page,'admin'); await page.getByRole('tab',{name:'Admin',exact:true}).click(); await page.getByRole('button',{name:'Provincias',exact:true}).click();
    await page.getByRole('button',{name:'Siguiente',exact:true}).click(); await expect(page.getByText('2 / 2',{exact:true})).toBeVisible(); await page.getByRole('button',{name:'Anterior',exact:true}).click();
    await page.getByLabel('Buscar provincias').fill('Test provincia 00'); await page.getByRole('button',{name:'Editar Test provincia 00',exact:true}).click(); await page.getByLabel('Nombre',{exact:true}).fill('Test provincia 00 editada'); await page.getByRole('button',{name:'Guardar catálogo',exact:true}).click(); await page.getByRole('button',{name:'Editar Test provincia 00 editada',exact:true}).click(); await page.getByRole('button',{name:'Eliminar registro',exact:true}).click(); await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).click(); await expect(page.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
    await logout(page); await login(page,'organizer'); await page.goto('http://localhost:8081/organizer/new');
    await page.getByLabel('Nombre del concierto',{exact:true}).fill('Borrador para eliminar'); await page.getByLabel('Inicio (ISO con zona horaria)',{exact:true}).fill(new Date(Date.now()+30*86400000).toISOString()); await choose(page,'Venue','Sala 1440'); await choose(page,'Tipo de concierto','Concierto'); await page.getByRole('button',{name:'Guardar concierto',exact:true}).click(); await page.getByRole('button',{name:'Eliminar borrador',exact:true}).click(); await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).click(); await expect(page.getByRole('heading',{name:'Mis conciertos'})).toBeVisible();
    let fail = true;
    await page.route('**/concerts?**', async route => { if (fail) {fail=false;await route.abort();} else await route.continue(); });
    await page.getByRole('tab',{name:'Descubrir',exact:true}).click(); await page.getByRole('button',{name:'Reintentar',exact:true}).click(); await expect(page.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
  } finally {await browserContext.close();}
});
