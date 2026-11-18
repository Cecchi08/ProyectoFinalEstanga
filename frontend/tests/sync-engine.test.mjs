import test from 'node:test';
import assert from 'node:assert/strict';
import {
  domainsForMutation,
  domainsForPath,
  getCachedResource,
  handleApiMutation,
  isMutationRequest,
  setCachedResource,
  setSessionScope,
  setSyncFetcher,
  subscribeDomains,
  subscribeUnreadEvents,
  syncNow,
} from '../src/services/syncEngine.ts';

test('isMutationRequest distingue escrituras de lecturas y excluye /promotions/validate', () => {
  assert.equal(isMutationRequest('/cities/create', { name: 'Necochea' }), true);
  assert.equal(isMutationRequest('/cities/4/update', { name: 'Batán' }), true);
  assert.equal(isMutationRequest('/cities/4/delete', undefined), true);
  assert.equal(isMutationRequest('/concerts/12/publish', {}), true);
  assert.equal(isMutationRequest('/purchases', { concertId: '1' }), true);
  assert.equal(isMutationRequest('/tickets/validate', { qrToken: 'abc' }), true);
  assert.equal(isMutationRequest('/me/profiles', { role: 'ARTISTA' }), true);
  assert.equal(isMutationRequest('/promotions/validate', { code: 'VENTI10' }), false);
  assert.equal(isMutationRequest('/concerts?status=PUBLISHED', undefined), false);
  assert.equal(isMutationRequest('/cities?page=1', undefined), false);
  assert.equal(isMutationRequest('/me/profiles', undefined), false);
});

test('domainsForPath y domainsForMutation mapean todos los recursos dinámicos', () => {
  assert.ok(domainsForPath('/concerts?status=PUBLISHED&city_id=1').includes('cities'));
  assert.ok(domainsForPath('/concerts?status=PUBLISHED&city_id=1').includes('concerts'));
  assert.ok(domainsForPath('/marketplace/venues?page=1').includes('cities'));
  assert.ok(domainsForPath('/admin/promotions').includes('admin_promotions'));
  assert.ok(domainsForMutation('/cities/create').includes('cities'));
  assert.ok(domainsForMutation('/cities/create').includes('concerts'));
  assert.ok(domainsForMutation('/admin/promotions/1/update').includes('promotions_sig'));
});

test('syncNow deduplica llamadas concurrentes, detecta cambios de versión y notifica solo dominios afectados', async () => {
  setSessionScope('user-1');
  let versionCities = '1:100';
  let versionConcerts = '2:200';
  let fetchCount = 0;

  setSyncFetcher(async () => {
    fetchCount++;
    await new Promise(r => setTimeout(r, 20));
    return {
      server_time: new Date().toISOString(),
      versions: {
        cities: versionCities,
        concerts: versionConcerts,
      },
    };
  });

  let cityNotifications = 0;
  let concertNotifications = 0;
  let promoNotifications = 0;

  const u1 = subscribeDomains(['cities'], () => { cityNotifications++; });
  const u2 = subscribeDomains(['concerts'], () => { concertNotifications++; });
  const u3 = subscribeDomains(['admin_promotions'], () => { promoNotifications++; });

  try {
    // Baseline inicial (subscribeDomains dispara syncNow inicial)
    await Promise.all([syncNow(), syncNow()]);
    assert.equal(fetchCount, 1, 'Llamadas concurrentes deben deduplicarse en un único request');

    setCachedResource('/cities?page=1', { success: true, data: [{ id: '1', name: 'Mar del Plata' }] });
    assert.equal(getCachedResource('/cities?page=1')?.stale, false);

    // Simula cambio remoto en otra sesión (Admin crea Necochea)
    versionCities = '2:999';
    await syncNow();

    assert.equal(cityNotifications, 1);
    assert.equal(concertNotifications, 0);
    assert.equal(promoNotifications, 0);
    assert.equal(getCachedResource('/cities?page=1')?.stale, true, 'La caché del dominio afectado debe marcarse stale');
  } finally {
    u1();
    u2();
    u3();
  }
});

test('setSessionScope aísla la caché entre sesiones y descarta respuestas en vuelo de la sesión anterior', async () => {
  setSessionScope('user-A');
  setCachedResource('/purchases/me?page=1', { success: true, data: [{ id: '99' }] });
  assert.ok(getCachedResource('/purchases/me?page=1'));

  setSessionScope('user-B');
  assert.equal(getCachedResource('/purchases/me?page=1'), null, 'El cambio de sesión nunca debe exponer datos de la sesión anterior');
});

test('handleApiMutation propaga actualizaciones inmediatas y eventos de unread', () => {
  setSessionScope('user-C');
  let concertHits = 0;
  let unreadEvent = null;

  const u1 = subscribeDomains(['concerts'], () => { concertHits++; });
  const u2 = subscribeUnreadEvents((ev) => { unreadEvent = ev; });

  try {
    handleApiMutation('/concerts/10/update', { name: 'Nuevo Nombre' }, { id: '10', name: 'Nuevo Nombre' });
    assert.equal(concertHits, 1);
    const cachedDetail = getCachedResource('/concerts/10');
    assert.equal(cachedDetail?.envelope.data.name, 'Nuevo Nombre');

    handleApiMutation('/notifications/5/read', undefined, {});
    assert.deepEqual(unreadEvent, { mode: 'delta', delta: -1 });
  } finally {
    u1();
    u2();
  }
});

