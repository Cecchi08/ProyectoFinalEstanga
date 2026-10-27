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
  // Registration grants COMPRADOR. Staff is not a profile: the staff account is a COMPRADOR assigned in concert_staff.
  // Only the first ADMIN is seeded in SQL (nobody can grant it yet); every other profile goes through the UI below.
  for (const name of ['admin','organizer','staff','artist','services','crew','producer']) {
    const account = await context.auth.register({...registration,email:`${name}@e2e.example`,first_name:name});
    await context.auth.verifyEmail(context.mailer.last('verification').token);
    if (name === 'admin') await db.rows("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='ADMIN'",[account.user.id]);
    accounts[name] = account.user.id;
  }
  // Production client uses localhost:3000. Bind only loopback.
  apiServer = await new Promise(resolve => {const server = context.app.listen(3000,'127.0.0.1',() => resolve(server));});
  const web = express(); web.use(express.static('../frontend/dist')); web.get('/{*path}',(_req,res) => res.sendFile('index.html',{root:'../frontend/dist'}));
  webServer = await new Promise(resolve => {const server = web.listen(8081,'127.0.0.1',() => resolve(server));});
  browser = await chromium.launch({...(process.env.E2E_BROWSER_CHANNEL ? {channel:process.env.E2E_BROWSER_CHANNEL} : {}),headless:true});
  await mkdir('../frontend/test-results',{recursive:true});
  const browserContext = await browser.newContext({viewport:{width:1440,height:1000}}); const page = await browserContext.newPage();
  try {
    // ADMIN assigns the reviewed profiles from /admin/users; each change lands in the audit log.
    await login(page,'admin');
    await grant(page,'organizer',['Organizador','Espacios']);
    await grant(page,'services',['Empresa de servicios']);
    await grant(page,'crew',['Empresa de servicios']);
    await grant(page,'producer',['Organizador']);
    await logout(page);
    // ARTISTA is self-service from /profiles; the artist then creates and publishes the profile billed in the concerts.
    await login(page,'artist'); await page.getByRole('tab',{name:'Mi cuenta',exact:true}).click();
    await page.getByRole('button',{name:'Mis perfiles',exact:true}).click();
    await page.getByRole('button',{name:'Activar Artista',exact:true}).click(); await expect(page.getByText('Perfil Artista activado.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Gestionar mis perfiles de artista',exact:true}).click();
    await page.getByRole('button',{name:'Crear perfil de artista',exact:true}).click();
    await page.getByLabel('Nombre artístico',{exact:true}).fill(ARTIST); await page.getByRole('button',{name:'Crear perfil',exact:true}).click();
    await page.getByRole('button',{name:'Publicar perfil',exact:true}).click(); await expect(page.getByText('Perfil publicado.',{exact:true})).toBeVisible();
    await logout(page);
  } finally {await browserContext.close();}
}, {timeout:180000});
after(async () => {await browser?.close(); await Promise.all([apiServer,webServer].filter(Boolean).map(server => new Promise(resolve => server.close(resolve)))); await db.close();});
async function login(page,name) {await page.goto('http://localhost:8081/login'); await page.getByLabel('Email',{exact:true}).fill(`${name}@e2e.example`); await page.getByLabel('Contraseña',{exact:true}).fill(password); await page.getByRole('button',{name:'Ingresar',exact:true}).click(); await expect(page.getByRole('heading',{name:'Encontrá tu próximo show'})).toBeVisible();}
async function logout(page) {await page.getByRole('tab',{name:'Mi cuenta',exact:true}).click(); await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click(); await expect(page.getByRole('button',{name:'Ingresar',exact:true})).toBeVisible();}
const ARTIST = 'Los Prismas E2E';
// Signed in as ADMIN: assigns profiles (labels as in ROLE_LABELS) and checks the audit trail of the account.
async function grant(page,name,labels) {
  await page.goto('http://localhost:8081/admin/users'); await page.getByLabel('Buscar por nombre o email',{exact:true}).fill(`${name}@e2e.example`);
  await page.getByRole('button',{name:`Gestionar cuenta de ${name} ${registration.last_name}`,exact:true}).click();
  for (const label of labels) {
    await page.getByRole('button',{name:`Asignar ${label}`,exact:true}).click(); await expect(page.getByText(`Perfil ${label} asignado.`,{exact:true})).toBeVisible();
    await expect(page.getByText(new RegExp(`Perfil asignado · ${label} · por #${accounts.admin}$`))).toBeVisible();
  }
}
// Seeded catalogs (24 provinces, 15 genres) exceed one Select page: search before choosing.
async function choose(page,label,option) {
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.getByLabel(`Buscar ${label.toLowerCase()}`,{exact:true}).fill(option);
  await page.getByRole('button',{name:option,exact:true}).click();
}
for (const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:390,height:844}]) test(`full application flow at ${viewport.width}px`, {timeout:180000}, async () => {
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
    // The four admin catalogs created through UI (artists and venues are no longer catalogs).
    await login(page,'admin'); await page.getByRole('tab',{name:'Admin',exact:true}).click();
    async function catalog(tab,name,prepare) {await page.getByRole('button',{name:tab,exact:true}).click(); await page.getByRole('button',{name:`Crear en ${tab}`,exact:true}).click(); await page.getByLabel('Nombre',{exact:true}).fill(name); if (prepare) await prepare(); await page.getByRole('button',{name:'Guardar catálogo',exact:true}).click(); await expect(page.getByRole('button',{name:`Editar ${name}`,exact:true})).toBeVisible();}
    await catalog('Provincias',`Provincia ${suffix}`,() => page.getByLabel('Código',{exact:true}).fill(`E2E-${suffix}`));
    await catalog('Distritos',`Distrito ${suffix}`,() => choose(page,'Provincia',`Provincia ${suffix}`));
    await catalog('Ciudades',`Ciudad ${suffix}`,async () => {await choose(page,'Provincia',`Provincia ${suffix}`); await choose(page,'Distrito',`Distrito ${suffix}`);});
    await catalog('Géneros',`Rock ${suffix}`); await logout(page);
    // ORGANIZADOR (with VENUE): concert CRUD and publication.
    await login(page,'organizer'); await page.getByRole('tab',{name:'Organizador',exact:true}).click(); await page.getByRole('button',{name:'Crear concierto',exact:true}).click();
    await page.getByLabel('Nombre del concierto',{exact:true}).fill(`VENTI Live ${suffix}`); await page.getByLabel('Inicio (ISO con zona horaria)',{exact:true}).fill(new Date(Date.now()+30*86400000).toISOString());
    // Free-text place in the city created above; marketplace spaces and reservations are optional.
    await page.getByLabel('Artista (texto del cartel)',{exact:true}).fill(`Banda ${suffix}`); await page.getByLabel('Lugar',{exact:true}).fill(`Sala ${suffix}`);
    // The published artist profile is billed as headliner; the lineup then shows it instead of the free text.
    await page.getByRole('button',{name:'Agregar perfil de artista',exact:true}).click(); await page.getByLabel('Buscar perfil de artista',{exact:true}).fill(ARTIST);
    await page.getByRole('button',{name:`Agregar ${ARTIST}`,exact:true}).click(); await expect(page.getByText(`1. ${ARTIST}`,{exact:true})).toBeVisible();
    await page.getByLabel('Dirección (opcional)',{exact:true}).fill('Calle Música 123'); await choose(page,'Ciudad',`Ciudad ${suffix}`);
    await choose(page,'Géneros',`Rock ${suffix}`); await page.getByRole('button',{name:'Guardar concierto',exact:true}).click();
    await expect(page.getByRole('button',{name:'Agregar tipo de entrada',exact:true})).toBeVisible();
    const concertId = new URL(page.url()).pathname.split('/').pop();
    await page.getByRole('button',{name:'Agregar tipo de entrada',exact:true}).click(); await page.getByLabel('Nombre de entrada',{exact:true}).fill('General'); await page.getByLabel('Precio',{exact:true}).fill('1200'); await page.getByLabel('Cupo total',{exact:true}).fill('20'); await page.getByRole('button',{name:'Guardar tipo de entrada',exact:true}).click(); await expect(page.getByRole('button',{name:'Editar General',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Publicar concierto',exact:true}).click(); await expect(page.getByText(`#${concertId} · PUBLISHED`,{exact:true})).toBeVisible();
    // Staff is assigned per concert from the editor (POST /concerts/:id/staff); it grants no global role.
    await page.getByLabel('Email del staff',{exact:true}).fill('staff@e2e.example'); await page.getByRole('button',{name:'Asignar staff',exact:true}).click();
    await expect(page.getByRole('button',{name:'Quitar staff staff@e2e.example',exact:true})).toBeVisible();
    await logout(page);
    // User discovery, filters, persisted session, reservation and confirmation (the schema has no favorites).
    await login(page,`user${suffix}`); await page.reload(); await expect(page.getByRole('heading',{name:'Encontrá tu próximo show'})).toBeVisible();
    await page.getByLabel('Buscar conciertos').fill(`VENTI Live ${suffix}`); await page.getByRole('button',{name:'Buscar',exact:true}).click();
    // Price filter: a concert matches when one of its ticket types (General, $ 1200) falls inside the range.
    await page.getByRole('button',{name:'Filtros',exact:true}).click();
    await page.getByLabel('Precio mínimo',{exact:true}).fill('1300'); await page.getByLabel('Precio máximo',{exact:true}).fill('1000');
    await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click(); await expect(page.getByText('El precio mínimo no puede superar al máximo.',{exact:true})).toBeVisible();
    await page.getByLabel('Precio máximo',{exact:true}).fill('5000'); await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
    await expect(page.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Filtros',exact:true}).click(); await page.getByLabel('Precio mínimo',{exact:true}).fill('1000');
    await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click(); await expect(page.getByText('Desde $ 1.200,00',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:`Ver VENTI Live ${suffix}`,exact:true}).click();
    await expect(page.getByText(`Artistas: ${ARTIST}`,{exact:true})).toBeVisible();
    await expect(page.getByText(`Sala ${suffix} · Ciudad ${suffix}, Provincia ${suffix}`,{exact:true})).toBeVisible();
    // The artist's public profile lists the concert among its upcoming performances.
    await page.getByRole('button',{name:`Principal: ${ARTIST}`,exact:true}).click(); await expect(page.getByText('Presentaciones',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:`Ver VENTI Live ${suffix}`,exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Volver',exact:true}).click(); await expect(page.getByRole('button',{name:'Reservar entradas',exact:true})).toBeVisible();
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
    await expect(page.getByText('ON · Usamos tus entradas para sugerirte conciertos.',{exact:true})).toBeVisible();
    const discoverResponse = page.waitForResponse(res => {const url = new URL(res.url()); return url.origin === 'http://localhost:3000' && url.pathname === '/recommendations' && res.status() === 200;});
    await page.getByRole('tab',{name:'Venti Discover',exact:true}).click();
    const discovery = (await (await discoverResponse).json()).data;
    assert.equal(discovery.enabled,true); assert.ok(discovery.recommendations.some(item => item.concert.id === concertId));
    assert.ok(discovery.recommendations.every(item => !('score' in item)));
    // A new account has no history: Discover falls back to upcoming published concerts.
    await expect(page.getByText('Un próximo concierto publicado para descubrir.',{exact:true}).first()).toBeVisible();
    await page.screenshot({path:`../frontend/test-results/discover-${suffix}.png`,fullPage:true});
    await page.getByRole('button',{name:`Ver VENTI Live ${suffix}`,exact:true}).click();
    // The purchase starts PENDING; the simulated payment confirms it. No card data is ever requested.
    await page.getByLabel('Cantidad General').fill('1'); await page.getByRole('button',{name:'Reservar entradas',exact:true}).click();
    await expect(page.getByText('Pago simulado: no se cobra dinero ni se piden datos de tarjeta.',{exact:true})).toBeVisible();
    assert.equal(await page.locator('input[aria-label*="tarjeta" i], input[autocomplete^="cc-"]').count(),0);
    await page.getByRole('button',{name:'Simular pago aprobado',exact:true}).click();
    await expect(page.getByText('Pago aprobado y compra confirmada. Tus QR están en Entradas.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Ver mis entradas QR',exact:true}).click();
    const qr = page.locator('[aria-label^="QR de entrada"]'); await expect(qr).toBeVisible();
    const png = PNG.sync.read(await qr.screenshot()); const decoded = jsQR(new Uint8ClampedArray(png.data),png.width,png.height); assert.ok(decoded); assert.match(decoded.data,/^[a-f0-9]{64}$/);
    await page.screenshot({path:`../frontend/test-results/tickets-${suffix}.png`,fullPage:true});
    // Stage 7: real transaction notifications, read state, badge, preference and related purchase.
    await expect(page.getByRole('tab',{name:/Notificaciones/})).toContainText('(2)');
    await page.getByRole('tab',{name:/Notificaciones/}).click();
    await expect(page.getByText('Compra confirmada',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Marcar como leída: Compra confirmada',exact:true}).click();
    await expect(page.getByText('1 sin leer',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Marcar todas como leídas',exact:true}).click();
    await expect(page.getByText('0 sin leer',{exact:true})).toBeVisible();
    await page.getByRole('switch',{name:'Notificaciones opcionales',exact:true}).click();
    await expect(page.getByText('OFF · No se generan avisos de Venti Discover.',{exact:true})).toBeVisible();
    await page.reload(); await expect(page.getByRole('switch',{name:'Notificaciones opcionales',exact:true})).not.toBeChecked();
    await page.screenshot({path:`../frontend/test-results/notifications-${suffix}.png`,fullPage:true});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
    await page.getByRole('button',{name:'Ver compra',exact:true}).click();
    await expect(page.getByRole('button',{name:'Ver mis entradas QR',exact:true})).toBeVisible();
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
    await page.getByRole('tab',{name:'Organizador',exact:true}).click();
    await page.getByRole('button',{name:'Ver estadísticas',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Mis estadísticas',exact:true})).toBeVisible();
    await page.getByLabel('ID de concierto (opcional)').fill(concertId);
    await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
    await expect(page.getByText('$ 1.200,00',{exact:true})).toBeVisible();
    await expect(page.getByText('Vendidas: 1 · Utilizadas: 1 · Pendientes: 0',{exact:true})).toBeVisible();
    await expect(page.getByText('Ocupación: 5% · Capacidad: 20',{exact:true})).toBeVisible();
    if (viewport.width === 1440) assert.ok((await page.getByRole('tablist').boundingBox()).width <= 220);
    await page.screenshot({path:`../frontend/test-results/organizer-statistics-${suffix}.png`,fullPage:true});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
    await logout(page);
    // Password recovery from the real email outbox, through the reset form.
    await page.goto('http://localhost:8081/forgot-password'); await page.getByLabel('Email',{exact:true}).fill(`user${suffix}@e2e.example`); await page.getByRole('button',{name:'Continuar',exact:true}).click(); await expect(page.getByRole('alert')).toBeVisible();
    const reset = context.mailer.last('reset').token; await page.goto(`http://localhost:8081/reset-password#token=${reset}`); await page.getByLabel('Contraseña (mínimo 12 caracteres)',{exact:true}).fill(password); await page.getByRole('button',{name:'Continuar',exact:true}).click(); await expect(page.getByRole('alert')).toBeVisible();
    await login(page,`user${suffix}`);
    await page.getByRole('tab',{name:/Notificaciones/}).click();
    await expect(page.getByText('Concierto cancelado',{exact:true})).toBeVisible();
    await expect(page.getByText('Información del concierto',{exact:true})).toBeVisible();
    await logout(page);
    await login(page,'admin'); await page.getByRole('tab',{name:'Admin',exact:true}).click();
    await page.getByRole('button',{name:'Estadísticas globales',exact:true}).click();
    await expect(page.getByText('Usuarios',{exact:true})).toBeVisible();
    await expect(page.getByText('Organizadores',{exact:true})).toBeVisible();
    await page.getByLabel('ID de concierto (opcional)').fill(concertId);
    await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
    await expect(page.getByText('$ 1.200,00',{exact:true})).toBeVisible();
    await page.screenshot({path:`../frontend/test-results/admin-statistics-${suffix}.png`,fullPage:true});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
    await logout(page);
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
    for (let index=0;index<22;index++) await db.rows('INSERT INTO provinces(code,name) VALUES (?,?)',[`TP-${String(index).padStart(2,'0')}`,`Test provincia ${String(index).padStart(2,'0')}`]);
    // 24 seeded provinces + 3 created by the flows + 22 here = 49 rows, 20 per page.
    await login(page,'admin'); await page.getByRole('tab',{name:'Admin',exact:true}).click(); await page.getByRole('button',{name:'Provincias',exact:true}).click();
    await page.getByRole('button',{name:'Siguiente',exact:true}).click(); await expect(page.getByText('2 / 3',{exact:true})).toBeVisible(); await page.getByRole('button',{name:'Anterior',exact:true}).click();
    await page.getByLabel('Buscar provincias').fill('Test provincia 00'); await page.getByRole('button',{name:'Editar Test provincia 00',exact:true}).click(); await page.getByLabel('Nombre',{exact:true}).fill('Test provincia 00 editada'); await page.getByRole('button',{name:'Guardar catálogo',exact:true}).click(); await page.getByRole('button',{name:'Editar Test provincia 00 editada',exact:true}).click(); await page.getByRole('button',{name:'Eliminar registro',exact:true}).click(); await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).click(); await expect(page.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
    await logout(page); await login(page,'organizer'); await page.goto('http://localhost:8081/organizer/new');
    await page.getByLabel('Nombre del concierto',{exact:true}).fill('Borrador para eliminar'); await page.getByLabel('Inicio (ISO con zona horaria)',{exact:true}).fill(new Date(Date.now()+30*86400000).toISOString()); await page.getByLabel('Artista (texto del cartel)',{exact:true}).fill('Banda borrador'); await page.getByRole('button',{name:'Guardar concierto',exact:true}).click(); await page.getByRole('button',{name:'Eliminar borrador',exact:true}).click(); await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).click(); await expect(page.getByRole('heading',{name:'Mis conciertos'})).toBeVisible();
    let fail = true;
    await page.route('**/concerts?**', async route => { if (fail) {fail=false;await route.abort();} else await route.continue(); });
    await page.getByRole('tab',{name:'Descubrir',exact:true}).click(); await page.getByRole('button',{name:'Reintentar',exact:true}).click(); await expect(page.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
  } finally {await browserContext.close();}
});

test('stage 7: notification loading/empty/error, statistics filters and role guards', {timeout:120000}, async () => {
  const browserContext = await browser.newContext({viewport:{width:390,height:844}});
  const page = await browserContext.newPage();
  try {
    await login(page,'staff');
    let release; const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/notifications?page=*',async route => { await gate; await route.continue(); });
    await page.getByRole('tab',{name:/Notificaciones/}).click();
    await expect(page.getByLabel('Cargando',{exact:true}).first()).toBeVisible();
    release();
    await expect(page.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
    await page.unroute('**/notifications?page=*');
    await page.route('**/notifications?page=*',route => route.abort());
    await page.getByRole('button',{name:'Actualizar',exact:true}).click();
    await expect(page.getByRole('button',{name:'Reintentar',exact:true})).toBeVisible();
    await page.unroute('**/notifications?page=*');
    await page.getByRole('button',{name:'Reintentar',exact:true}).click();
    await expect(page.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
    for (const path of ['/organizer/statistics','/admin/statistics']) {
      await page.goto(`http://localhost:8081${path}`);
      await expect(page.getByRole('heading',{name:'Sin permiso',exact:true})).toBeVisible();
    }
    await logout(page); await login(page,'organizer');
    await page.goto('http://localhost:8081/organizer/statistics');
    await page.getByLabel('Desde (AAAA-MM-DD)').fill('2025-01-02');
    await page.getByLabel('Hasta (AAAA-MM-DD)').fill('2025-01-01');
    await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel('Desde (AAAA-MM-DD)').fill('2025-01-01');
    await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
    await expect(page.getByText('No hay ventas confirmadas en este período.',{exact:true})).toBeVisible();
    await expect(page.getByText('Sin ventas en el período.',{exact:true})).toBeVisible();
  } finally { await browserContext.close(); }
});

test('stage 8: malformed responses remain recoverable and desktop navigation scrolls', {timeout:120000}, async () => {
  const browserContext = await browser.newContext({viewport:{width:1440,height:420}});
  const page = await browserContext.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await login(page,'admin');
    const adminTab = page.getByRole('tab',{name:'Admin',exact:true});
    await adminTab.scrollIntoViewIfNeeded();
    await expect(adminTab).toBeInViewport();
    await adminTab.click();
    await expect(page.getByRole('heading',{name:'Administración',exact:true})).toBeVisible();
    assert.ok((await page.getByRole('tablist').boundingBox()).width <= 220);
    await page.getByRole('tab',{name:/Notificaciones/}).click();
    for (const status of [400,403,404,409,422,429,500,200]) {
      await page.route('**/notifications?page=*', route => route.fulfill({status,contentType:'application/json',body:'null'}));
      await page.getByRole('button',{name:'Actualizar',exact:true}).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('button',{name:'Reintentar',exact:true})).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
      await page.unroute('**/notifications?page=*');
      await page.getByRole('button',{name:'Reintentar',exact:true}).click();
      await expect(page.getByText('No hay resultados para mostrar.',{exact:true})).toBeVisible();
    }
    assert.deepEqual(errors,[]);
  } finally { await browserContext.close(); }
});

test('marketplace: gestión del establecimiento, búsqueda, disponibilidad, reserva y pago simulado', {timeout:180000}, async () => {
  const browserContext = await browser.newContext({viewport:{width:1440,height:1000}}); const page = await browserContext.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Ten days ahead, as a calendar date in Argentina (the marketplace's time zone).
  const date = new Date(Date.now()+10*86400000).toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
  try {
    await login(page,'organizer'); await page.getByRole('tab',{name:'Espacios',exact:true}).click();
    await page.getByRole('button',{name:'Gestionar establecimientos',exact:true}).click();
    await page.getByLabel('Nombre de la organización',{exact:true}).fill('Salas E2E'); await page.getByRole('button',{name:'Crear organización',exact:true}).click();
    await expect(page.getByRole('button',{name:'Salas E2E (Dueño)',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Nuevo establecimiento',exact:true}).click();
    await page.getByRole('button',{name:'Salas E2E',exact:true}).click(); await page.getByRole('button',{name:'Mar del Plata',exact:true}).click();
    await page.getByLabel('Nombre del establecimiento',{exact:true}).fill('Complejo E2E'); await page.getByLabel('Dirección',{exact:true}).fill('Av. Test 100');
    await page.getByRole('button',{name:'Guardar establecimiento',exact:true}).click(); await expect(page.getByText('Complejo E2E · DRAFT',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Espacios de Complejo E2E',exact:true}).click(); await page.getByRole('button',{name:'Nuevo espacio en Complejo E2E',exact:true}).click();
    await page.getByRole('button',{name:'Sala de ensayo',exact:true}).click(); await page.getByLabel('Nombre del espacio',{exact:true}).fill('Sala E2E');
    await page.getByLabel('Precio por hora',{exact:true}).fill('1500'); await page.getByRole('button',{name:'Backline',exact:true}).click();
    await page.getByRole('button',{name:'Guardar espacio',exact:true}).click();
    await page.getByRole('button',{name:'Publicar espacio Sala E2E',exact:true}).click(); await expect(page.getByRole('button',{name:'Archivar espacio Sala E2E',exact:true})).toBeVisible();
    // The owner sends the establishment to review; it is not public until an ADMIN approves it.
    await page.getByRole('button',{name:'Enviar a revisión Complejo E2E',exact:true}).click(); await expect(page.getByText('Complejo E2E · PENDING_REVIEW',{exact:true})).toBeVisible();
    await logout(page);
    await login(page,'admin'); await page.goto('http://localhost:8081/admin/establishments');
    await page.getByRole('button',{name:'Aprobar Complejo E2E',exact:true}).click(); await expect(page.getByText('Complejo E2E aprobado y publicado.',{exact:true})).toBeVisible();
    await logout(page);
    // An artist finds the space, checks the slot, books it (HOLD) and approves the simulated payment.
    // Booking needs marketplace.reservations.create: the buyer activates the ARTISTA profile on its own from /profiles.
    await login(page,'user1440'); await page.getByRole('tab',{name:'Mi cuenta',exact:true}).click();
    await page.getByRole('button',{name:'Mis perfiles',exact:true}).click();
    await page.getByRole('button',{name:'Activar Artista',exact:true}).click(); await expect(page.getByText('Perfil Artista activado.',{exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'Espacios',exact:true}).click();
    await page.getByLabel('Buscar espacios',{exact:true}).fill('Sala E2E'); await page.getByRole('button',{name:'Backline',exact:true}).click();
    await page.getByRole('button',{name:'Aplicar búsqueda',exact:true}).click(); await page.getByRole('button',{name:'Ver Sala E2E',exact:true}).click();
    await page.getByLabel('Fecha (AAAA-MM-DD)',{exact:true}).fill(date);
    await page.getByLabel('Inicio del evento (HH:MM)',{exact:true}).fill('18:00'); await page.getByLabel('Fin del evento (HH:MM)',{exact:true}).fill('20:00');
    await page.getByRole('button',{name:'Consultar disponibilidad',exact:true}).click(); await expect(page.getByText('La franja está libre.',{exact:true})).toBeVisible();
    await page.getByLabel('Nombre del evento',{exact:true}).fill('Ensayo E2E'); await page.getByRole('button',{name:'Reservar al precio de lista',exact:true}).click();
    await expect(page.getByText('Ensayo E2E · HOLD · pendiente de pago',{exact:true})).toBeVisible();
    await expect(page.getByText(/no se cobra dinero ni se piden datos de tarjeta/)).toBeVisible();
    assert.equal(await page.locator('input[aria-label*="tarjeta" i], input[autocomplete^="cc-"]').count(),0);
    // A direct booking stays HOLD after the payment: it is confirmed when the venue accepts it.
    await page.getByRole('button',{name:'Simular pago aprobado',exact:true}).click();
    await expect(page.getByText(/^Pago simulado: no se cobró dinero real.*APPROVED\.$/)).toBeVisible();
    await expect(page.getByText('Ensayo E2E · HOLD · pagada, espera aceptación del espacio',{exact:true})).toBeVisible();
    await expect(page.getByText(/Total \$ 3\.000,00/)).toBeVisible();
    await page.screenshot({path:'../frontend/test-results/marketplace-reservation-1440.png',fullPage:true});
    await logout(page);
    // The venue accepts the paid booking among those received by its spaces, and then cannot cancel it.
    await login(page,'organizer'); await page.goto('http://localhost:8081/marketplace/reservations');
    await page.getByRole('button',{name:'Recibidos en mis espacios',exact:true}).click();
    await expect(page.getByText('Ensayo E2E · HOLD · pagada, espera aceptación del espacio',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:/^Ver reserva /}).click();
    await page.getByRole('button',{name:'Aceptar reserva',exact:true}).click(); await expect(page.getByText('Reserva aceptada y confirmada.',{exact:true})).toBeVisible();
    await expect(page.getByText('Ensayo E2E · CONFIRMED',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Cancelar reserva',exact:true})).toHaveCount(0);
    await expect(page.getByText('Una reserva confirmada solo la puede cancelar el cliente.',{exact:true})).toBeVisible();
    await logout(page);
    // The client still can cancel its confirmed booking.
    await login(page,'user1440'); await page.goto('http://localhost:8081/marketplace/reservations');
    await expect(page.getByText('Ensayo E2E · CONFIRMED',{exact:true})).toBeVisible(); await page.getByRole('button',{name:/^Ver reserva /}).click();
    await expect(page.getByRole('button',{name:'Cancelar reserva',exact:true})).toBeVisible();
    await logout(page);
    assert.deepEqual(errors,[]);
  } finally { await browserContext.close(); }
});

test('servicios: empresa, integrantes, catálogo, cotización, contratación y disponibilidad', {timeout:180000}, async () => {
  const browserContext = await browser.newContext({viewport:{width:1440,height:1000}}); const page = await browserContext.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Argentina calendar dates: the quote must expire before the event starts.
  const day = offset => new Date(Date.now()+offset*86400000).toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
  const [eventDate, validDate] = [day(20), day(5)];
  try {
    // EMPRESA_SERVICIOS (granted by ADMIN) creates the company, adds a teammate and publishes a service and the company.
    await login(page,'services'); await page.getByRole('tab',{name:'Servicios',exact:true}).click();
    await page.getByRole('button',{name:'Mis empresas de servicios',exact:true}).click();
    await page.getByRole('button',{name:'Nueva empresa de servicios',exact:true}).click();
    await page.getByLabel('Nombre comercial',{exact:true}).fill('Sonido E2E'); await page.getByRole('button',{name:'Crear empresa',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Sonido E2E',exact:true})).toBeVisible();
    await page.getByLabel('Email del miembro (cuenta con perfil EMPRESA_SERVICIOS)',{exact:true}).fill('crew@e2e.example');
    await page.getByRole('button',{name:'Agregar miembro',exact:true}).click(); await expect(page.getByText('Miembro agregado.',{exact:true})).toBeVisible();
    await expect(page.getByText(`crew ${registration.last_name} · crew@e2e.example · Staff`,{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Nuevo servicio',exact:true}).click();
    await page.getByRole('button',{name:'Sonido',exact:true}).click(); await page.getByLabel('Nombre del servicio',{exact:true}).fill('PA E2E');
    await page.getByRole('button',{name:'Crear servicio',exact:true}).click();
    await page.getByRole('button',{name:'Publicar PA E2E',exact:true}).click(); await expect(page.getByText('Servicio publicado.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Publicar empresa',exact:true}).click(); await expect(page.getByText('Empresa publicada.',{exact:true})).toBeVisible();
    await logout(page);
    // The organizer finds the service in the public catalog and asks for a quote.
    async function openService() {
      await page.getByRole('tab',{name:'Servicios',exact:true}).click();
      await page.getByLabel('Buscar',{exact:true}).fill('PA E2E'); await page.getByRole('button',{name:'Buscar servicios',exact:true}).click();
      await page.getByRole('button',{name:'Ver servicio PA E2E',exact:true}).click();
    }
    await login(page,'organizer'); await openService();
    await page.getByLabel('Nombre del evento',{exact:true}).fill('Show E2E');
    // The availability lookup also has a date field: the quote form is the second one.
    await page.getByLabel('Fecha (AAAA-MM-DD)',{exact:true}).last().fill(eventDate);
    await page.getByLabel('Desde (HH:MM)',{exact:true}).fill('20:00'); await page.getByLabel('Hasta (HH:MM)',{exact:true}).fill('23:00');
    await page.getByRole('button',{name:'Enviar pedido de cotización',exact:true}).click();
    await expect(page.getByText('Show E2E · Pedida',{exact:true})).toBeVisible();
    await logout(page);
    // The company answers with an itemized quote.
    await login(page,'services'); await page.goto('http://localhost:8081/services/quotes');
    await page.getByRole('button',{name:/^Ver cotización /}).click();
    await page.getByLabel('Ítem 1',{exact:true}).fill('Sistema PA'); await page.getByLabel('Precio unitario 1',{exact:true}).fill('50000');
    await page.getByLabel('Válida hasta (AAAA-MM-DD)',{exact:true}).fill(validDate);
    await page.getByRole('button',{name:'Enviar cotización',exact:true}).click(); await expect(page.getByText('Cotización enviada.',{exact:true})).toBeVisible();
    await expect(page.getByText('Show E2E · Cotizada',{exact:true})).toBeVisible();
    await logout(page);
    // The organizer accepts it; the contracted window then shows as busy in the service's availability.
    await login(page,'organizer'); await page.goto('http://localhost:8081/services/quotes');
    await page.getByRole('button',{name:/^Ver cotización /}).click();
    await expect(page.getByText('Total $ 50.000,00 ARS',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Aceptar y contratar',exact:true}).click(); await expect(page.getByText('Servicio contratado.',{exact:true})).toBeVisible();
    await expect(page.getByText('Show E2E · Contratada',{exact:true})).toBeVisible();
    await openService();
    await page.getByLabel('Fecha (AAAA-MM-DD)',{exact:true}).first().fill(eventDate); await page.getByRole('button',{name:'Consultar disponibilidad',exact:true}).click();
    await expect(page.getByText(/^Contratado: /)).toBeVisible();
    await page.screenshot({path:'../frontend/test-results/services-quote-1440.png',fullPage:true});
    await logout(page);
    assert.deepEqual(errors,[]);
  } finally { await browserContext.close(); }
});

test('flujo completo: espacio aprobado, reserva, concierto en el espacio, compra con pago simulado, reembolso y auditoría', {timeout:180000}, async () => {
  const browserContext = await browser.newContext({viewport:{width:1440,height:1000}}); const page = await browserContext.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Same Argentine calendar day as the marketplace test, a later slot of the space it approved (Sala E2E).
  const date = new Date(Date.now()+10*86400000).toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
  try {
    // A producer (ORGANIZADOR) books the approved space and pays; the venue accepts the booking.
    await login(page,'producer'); await page.getByRole('tab',{name:'Espacios',exact:true}).click();
    await page.getByLabel('Buscar espacios',{exact:true}).fill('Sala E2E'); await page.getByRole('button',{name:'Aplicar búsqueda',exact:true}).click();
    await page.getByRole('button',{name:'Ver Sala E2E',exact:true}).click();
    await page.getByLabel('Fecha (AAAA-MM-DD)',{exact:true}).fill(date);
    await page.getByLabel('Inicio del evento (HH:MM)',{exact:true}).fill('21:00'); await page.getByLabel('Fin del evento (HH:MM)',{exact:true}).fill('23:00');
    await page.getByLabel('Nombre del evento',{exact:true}).fill('Show Productora'); await page.getByRole('button',{name:'Reservar al precio de lista',exact:true}).click();
    await expect(page.getByText('Show Productora · HOLD · pendiente de pago',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Simular pago aprobado',exact:true}).click();
    await expect(page.getByText('Show Productora · HOLD · pagada, espera aceptación del espacio',{exact:true})).toBeVisible();
    await logout(page);
    await login(page,'organizer'); await page.goto('http://localhost:8081/marketplace/reservations');
    await page.getByRole('button',{name:'Recibidos en mis espacios',exact:true}).click(); await page.getByRole('button',{name:'HOLD',exact:true}).click();
    await page.getByRole('button',{name:/^Ver reserva /}).click();
    await page.getByRole('button',{name:'Aceptar reserva',exact:true}).click(); await expect(page.getByText('Reserva aceptada y confirmada.',{exact:true})).toBeVisible();
    await logout(page);
    // The producer bills the concert on that confirmed booking: the place comes from the space, and it can be published.
    await login(page,'producer'); await page.getByRole('tab',{name:'Organizador',exact:true}).click(); await page.getByRole('button',{name:'Crear concierto',exact:true}).click();
    await page.getByLabel('Nombre del concierto',{exact:true}).fill('Show Productora E2E'); await page.getByLabel('Inicio (ISO con zona horaria)',{exact:true}).fill(`${date}T21:30:00-03:00`);
    await page.getByLabel('Artista (texto del cartel)',{exact:true}).fill('Productora Live');
    await page.getByRole('button',{name:'Reserva confirmada (opcional)',exact:true}).click(); await page.getByRole('button',{name:/^Show Productora · Sala E2E · /}).click();
    await choose(page,'Géneros','Rock 1440'); await page.getByRole('button',{name:'Guardar concierto',exact:true}).click();
    await expect(page.getByRole('button',{name:'Agregar tipo de entrada',exact:true})).toBeVisible();
    const concertId = new URL(page.url()).pathname.split('/').pop();
    await page.getByRole('button',{name:'Agregar tipo de entrada',exact:true}).click(); await page.getByLabel('Nombre de entrada',{exact:true}).fill('General'); await page.getByLabel('Precio',{exact:true}).fill('1500'); await page.getByLabel('Cupo total',{exact:true}).fill('10'); await page.getByRole('button',{name:'Guardar tipo de entrada',exact:true}).click();
    await page.getByRole('button',{name:'Publicar concierto',exact:true}).click(); await expect(page.getByText(`#${concertId} · PUBLISHED`,{exact:true})).toBeVisible();
    // While the concert is billed on it, the booking cannot be cancelled (option A).
    await page.goto('http://localhost:8081/marketplace/reservations'); await page.getByRole('button',{name:/^Ver reserva /}).click();
    await page.getByRole('button',{name:'Cancelar reserva',exact:true}).click(); await page.getByRole('button',{name:'Confirmar cancelación de la reserva',exact:true}).click();
    await expect(page.getByText(/Primero cancelá el concierto o desvinculalo/)).toBeVisible();
    await expect(page.getByText('Show Productora · CONFIRMED',{exact:true})).toBeVisible();
    await logout(page);
    // A buyer purchases with the simulated payment, then cancels: the purchase is refunded.
    await login(page,'user390');
    await page.getByLabel('Buscar conciertos').fill('Show Productora E2E'); await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await page.getByRole('button',{name:'Ver Show Productora E2E',exact:true}).click();
    await page.getByLabel('Cantidad General').fill('1'); await page.getByRole('button',{name:'Reservar entradas',exact:true}).click();
    await page.getByRole('button',{name:'Simular pago aprobado',exact:true}).click();
    await expect(page.getByText('Pago aprobado y compra confirmada. Tus QR están en Entradas.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Cancelar compra',exact:true}).click(); await page.getByRole('button',{name:'Sí, cancelar la compra',exact:true}).click();
    await expect(page.getByText('Compra cancelada.',{exact:true})).toBeVisible();
    await expect(page.getByText('Pagos (simulados) · reembolsada',{exact:true})).toBeVisible();
    await logout(page);
    // The ADMIN sees the concert status change and the refund in the audit log.
    await login(page,'admin'); await page.goto('http://localhost:8081/admin/audit');
    await page.getByRole('button',{name:'Conciertos',exact:true}).click(); await expect(page.getByText('Concierto publicado',{exact:true}).first()).toBeVisible();
    await page.getByRole('button',{name:'Compras',exact:true}).click(); await expect(page.getByText('Compra reembolsada',{exact:true}).first()).toBeVisible();
    await page.screenshot({path:'../frontend/test-results/full-flow-audit-1440.png',fullPage:true});
    await logout(page);
    assert.deepEqual(errors,[]);
  } finally { await browserContext.close(); }
});
