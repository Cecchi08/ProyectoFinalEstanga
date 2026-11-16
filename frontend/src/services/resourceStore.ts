import type { Envelope } from "../types/api";

// Almacén reactivo en memoria para sincronizar todos los recursos del frontend sin recargas ni spinners.
// Cada vista conectada vía useResource se suscribe a su ruta y se re-renderiza mediante useState al instante.
type Listener = () => void;
type UnreadListener = (unread: number) => void;
type AnyRecord = Record<string, unknown>;

interface CacheRecord {
  envelope: Envelope<unknown>;
  mutated: boolean;
  needsSync: boolean;
}

const store = new Map<string, CacheRecord>();
const pathListeners = new Map<string, Set<Listener>>();
const unreadListeners = new Set<UnreadListener>();
const silentRefreshCallbacks = new Set<(prefix: string) => void>();

const isObj = (v: unknown): v is AnyRecord =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Notifica a todos los hooks useResource suscriptos a una ruta puntual.
function notifyPath(path: string) {
  const subs = pathListeners.get(path);
  if (!subs) return;
  for (const listener of subs) listener();
}

// Notifica cambios de contador de notificaciones no leídas a NotificationsContext.
function notifyUnread(unread: number) {
  for (const listener of unreadListeners) listener(unread);
}

// Registra un listener para sincronizar el contador de notificaciones sin consultar /notifications?limit=1.
export function subscribeUnreadCount(listener: UnreadListener): () => void {
  unreadListeners.add(listener);
  return () => {
    unreadListeners.delete(listener);
  };
}

// Registra listeners globales para refrescos silenciosos puntuales (métricas agregadas o QRs recién emitidos).
export function subscribeSilentSync(cb: (prefix: string) => void): () => void {
  silentRefreshCallbacks.add(cb);
  return () => {
    silentRefreshCallbacks.delete(cb);
  };
}

function triggerSilentSync(prefix: string) {
  for (const [key, rec] of store.entries()) {
    if (key.split("?")[0].startsWith(prefix)) {
      rec.needsSync = true;
    }
  }
  for (const cb of silentRefreshCallbacks) cb(prefix);
}

// Devuelve la instantánea actual en memoria para una ruta.
export function getResourceSnapshot<T>(path: string | null): Envelope<T> | null {
  if (!path) return null;
  return (store.get(path)?.envelope as Envelope<T> | undefined) ?? null;
}

// Indica si una ruta ya fue actualizada por una mutación local o sincronizada recientemente.
export function hasFreshSnapshot(path: string | null): boolean {
  if (!path) return false;
  const rec = store.get(path);
  return Boolean(rec && !rec.needsSync);
}

// Indica si la ruta quedó marcada para sincronización silenciosa en segundo plano.
export function consumeSyncFlag(path: string): boolean {
  const rec = store.get(path);
  if (!rec?.needsSync) return false;
  rec.needsSync = false;
  return true;
}

// Guarda una respuesta recibida del backend y notifica a los componentes que la observan.
export function setResourceSnapshot<T>(path: string, envelope: Envelope<T>, mutated = false) {
  store.set(path, { envelope: envelope as Envelope<unknown>, mutated, needsSync: false });
  notifyPath(path);
}

// Suscribe un componente React a los cambios reactivos de una ruta en el store.
export function subscribeResourcePath(path: string | null, listener: Listener): () => void {
  if (!path) return () => {};
  let subs = pathListeners.get(path);
  if (!subs) {
    subs = new Set();
    pathListeners.set(path, subs);
  }
  subs.add(listener);
  return () => {
    subs?.delete(listener);
    if (subs && subs.size === 0) pathListeners.delete(path);
  };
}

// Limpia toda la memoria reactiva al cerrar sesión.
export function clearResourceStore() {
  store.clear();
  for (const key of pathListeners.keys()) notifyPath(key);
}

// Transforma todas las entradas cacheadas cuya ruta cumpla el predicado dado.
function updateMatching(
  predicate: (basePath: string, fullPath: string) => boolean,
  updater: (env: Envelope<unknown>, fullPath: string) => Envelope<unknown> | null,
) {
  for (const [fullPath, rec] of store.entries()) {
    const basePath = fullPath.split("?")[0];
    if (!predicate(basePath, fullPath)) continue;
    const next = updater(rec.envelope, fullPath);
    if (!next) continue;
    store.set(fullPath, { envelope: next, mutated: true, needsSync: false });
    notifyPath(fullPath);
  }
}

// Inserta o reemplaza un elemento dentro de listas paginadas cacheadas.
function upsertInList(env: Envelope<unknown>, item: AnyRecord, prepend = true): Envelope<unknown> | null {
  if (!Array.isArray(env.data)) return null;
  const itemId = String(item.id ?? "");
  const index = itemId ? env.data.findIndex((row) => isObj(row) && String(row.id) === itemId) : -1;
  if (index >= 0) {
    const nextData = env.data.map((row, idx) => (idx === index && isObj(row) ? { ...row, ...item } : row));
    return { ...env, data: nextData };
  }
  const nextData = prepend ? [item, ...env.data] : [...env.data, item];
  const pagination = env.pagination
    ? {
        ...env.pagination,
        total: env.pagination.total + 1,
        total_pages: Math.max(1, Math.ceil((env.pagination.total + 1) / Math.max(1, env.pagination.limit))),
      }
    : undefined;
  return { ...env, data: nextData, ...(pagination ? { pagination } : {}) };
}

// Actualiza parcialmente un elemento por ID dentro de una lista cacheada.
function patchInList(env: Envelope<unknown>, id: string, patch: AnyRecord): Envelope<unknown> | null {
  if (!Array.isArray(env.data)) return null;
  let changed = false;
  const nextData = env.data.map((row) => {
    if (isObj(row) && String(row.id) === id) {
      changed = true;
      return { ...row, ...patch };
    }
    return row;
  });
  return changed ? { ...env, data: nextData } : null;
}

// Elimina un elemento por ID de una lista cacheada ajustando la paginación.
function removeFromList(env: Envelope<unknown>, id: string): Envelope<unknown> | null {
  if (!Array.isArray(env.data)) return null;
  const nextData = env.data.filter((row) => !(isObj(row) && String(row.id) === id));
  if (nextData.length === env.data.length) return null;
  const nextTotal = Math.max(0, (env.pagination?.total ?? nextData.length) - 1);
  const pagination = env.pagination
    ? {
        ...env.pagination,
        total: nextTotal,
        total_pages: Math.max(1, Math.ceil(nextTotal / Math.max(1, env.pagination.limit))),
      }
    : undefined;
  return { ...env, data: nextData, ...(pagination ? { pagination } : {}) };
}

// Detecta rutas de escritura para distinguir mutaciones de lecturas POST.
const WRITE_SUFFIX_RE =
  /\/(create|update|delete|publish|archive|cancel|confirm|accept|reject|approve|verify|unverify|suspend|reactivate|read|read-all|roles|add|validate|payments|activate|respond)$/;
const WRITE_EXACT = new Set([
  "/purchases",
  "/me/profile-requests",
  "/preferences/update",
  "/auth/me/update",
  "/notifications/read-all",
  "/proposals/create",
  "/concerts/create",
  "/artists/create",
]);

export function isMutationRequest(path: string, body: unknown): boolean {
  const base = path.split("?")[0];
  if (WRITE_EXACT.has(base) || WRITE_SUFFIX_RE.test(base)) return true;
  if (base === "/me/profiles" && body !== undefined) return true;
  return false;
}

// Sincroniza automáticamente todo el estado reactivo del frontend usando la respuesta de cada mutación.
export function applyApiMutation(path: string, body: unknown, responseData: unknown): void {
  const base = path.split("?")[0];
  const payload = isObj(body) ? body : {};

  // ---- CONCIERTOS ----
  if (base === "/concerts/create" && isObj(responseData)) {
    const concertId = String(responseData.id ?? "");
    if (concertId) {
      setResourceSnapshot(`/concerts/${concertId}`, { success: true, data: responseData }, true);
    }
    updateMatching(
      (b, full) =>
        b === "/concerts" &&
        (full.includes("mine=true") || responseData.status === "PUBLISHED" || !full.includes("status=")),
      (env, full) => {
        if (full.includes("status=PUBLISHED") && responseData.status !== "PUBLISHED") return null;
        return upsertInList(env, responseData, true);
      },
    );
    triggerSilentSync("/organizer/statistics");
    triggerSilentSync("/admin/statistics");
    return;
  }

  const concertUpdateMatch = /^\/concerts\/(\d+)\/(update|publish|cancel)$/.exec(base);
  if (concertUpdateMatch && isObj(responseData)) {
    const concertId = concertUpdateMatch[1];
    setResourceSnapshot(`/concerts/${concertId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/concerts" || b === "/staff/assignments",
      (env, full) => {
        if (concertUpdateMatch[2] === "publish" && full.includes("status=PUBLISHED")) {
          return upsertInList(env, responseData, true);
        }
        return patchInList(env, concertId, responseData);
      },
    );
    triggerSilentSync("/organizer/statistics");
    triggerSilentSync("/admin/statistics");
    return;
  }

  const concertDeleteMatch = /^\/concerts\/(\d+)\/delete$/.exec(base);
  if (concertDeleteMatch) {
    const concertId = concertDeleteMatch[1];
    store.delete(`/concerts/${concertId}`);
    notifyPath(`/concerts/${concertId}`);
    updateMatching(
      (b) => b === "/concerts" || b === "/staff/assignments",
      (env) => removeFromList(env, concertId),
    );
    triggerSilentSync("/organizer/statistics");
    triggerSilentSync("/admin/statistics");
    return;
  }

  // ---- TIPOS DE ENTRADA Y STAFF DE CONCIERTO ----
  const ticketTypeCreateMatch = /^\/concerts\/(\d+)\/ticket-types\/create$/.exec(base);
  if (ticketTypeCreateMatch && isObj(responseData)) {
    const concertId = ticketTypeCreateMatch[1];
    updateMatching(
      (b) => b === `/concerts/${concertId}`,
      (env) => {
        if (!isObj(env.data)) return null;
        const current = Array.isArray(env.data.ticket_types) ? env.data.ticket_types : [];
        return { ...env, data: { ...env.data, ticket_types: [...current, responseData] } };
      },
    );
    return;
  }

  const ticketTypeUpdateMatch = /^\/ticket-types\/(\d+)\/update$/.exec(base);
  if (ticketTypeUpdateMatch && isObj(responseData)) {
    const typeId = ticketTypeUpdateMatch[1];
    updateMatching(
      (b) => /^\/concerts\/\d+$/.test(b),
      (env) => {
        if (!isObj(env.data) || !Array.isArray(env.data.ticket_types)) return null;
        let touched = false;
        const nextTypes = env.data.ticket_types.map((t) => {
          if (isObj(t) && String(t.id) === typeId) {
            touched = true;
            return { ...t, ...responseData };
          }
          return t;
        });
        return touched ? { ...env, data: { ...env.data, ticket_types: nextTypes } } : null;
      },
    );
    return;
  }

  const ticketTypeDeleteMatch = /^\/ticket-types\/(\d+)\/delete$/.exec(base);
  if (ticketTypeDeleteMatch) {
    const typeId = ticketTypeDeleteMatch[1];
    updateMatching(
      (b) => /^\/concerts\/\d+$/.test(b),
      (env) => {
        if (!isObj(env.data) || !Array.isArray(env.data.ticket_types)) return null;
        const nextTypes = env.data.ticket_types.filter((t) => !(isObj(t) && String(t.id) === typeId));
        if (nextTypes.length === env.data.ticket_types.length) return null;
        return { ...env, data: { ...env.data, ticket_types: nextTypes } };
      },
    );
    return;
  }

  const staffAddMatch = /^\/concerts\/(\d+)\/staff\/add$/.exec(base);
  if (staffAddMatch && Array.isArray(responseData)) {
    setResourceSnapshot(`/concerts/${staffAddMatch[1]}/staff`, { success: true, data: responseData }, true);
    return;
  }

  const staffDeleteMatch = /^\/concerts\/(\d+)\/staff\/(\d+)\/delete$/.exec(base);
  if (staffDeleteMatch) {
    const [, concertId, userId] = staffDeleteMatch;
    updateMatching(
      (b) => b === `/concerts/${concertId}/staff`,
      (env) => {
        if (!Array.isArray(env.data)) return null;
        return {
          ...env,
          data: env.data.filter((m) => !(isObj(m) && String(m.user_id) === userId)),
        };
      },
    );
    return;
  }

  // ---- PROMOCIONES ----
  if (base === "/admin/promotions/create" && isObj(responseData)) {
    updateMatching(
      (b) => b === "/admin/promotions",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const promoUpdateMatch = /^\/admin\/promotions\/(\d+)\/update$/.exec(base);
  if (promoUpdateMatch && isObj(responseData)) {
    updateMatching(
      (b) => b === "/admin/promotions",
      (env) => patchInList(env, promoUpdateMatch[1], responseData),
    );
    return;
  }

  const promoDeleteMatch = /^\/admin\/promotions\/(\d+)\/delete$/.exec(base);
  if (promoDeleteMatch && isObj(responseData)) {
    const promoId = promoDeleteMatch[1];
    updateMatching(
      (b) => b === "/admin/promotions",
      (env) =>
        responseData.deleted
          ? removeFromList(env, promoId)
          : patchInList(env, promoId, { status: "INACTIVE" }),
    );
    return;
  }

  // ---- COMPRAS Y ENTRADAS QR ----
  if (base === "/purchases" && isObj(responseData)) {
    const purchaseId = String(responseData.id ?? "");
    if (purchaseId) {
      setResourceSnapshot(`/purchases/${purchaseId}`, { success: true, data: responseData }, true);
    }
    updateMatching(
      (b) => b === "/purchases/me",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const purchaseConfirmMatch = /^\/purchases\/(\d+)\/confirm$/.exec(base);
  if (purchaseConfirmMatch && isObj(responseData)) {
    const purchaseId = purchaseConfirmMatch[1];
    setResourceSnapshot(`/purchases/${purchaseId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/purchases/me",
      (env) => patchInList(env, purchaseId, responseData),
    );
    // Descuenta localmente el cupo disponible de las entradas del concierto comprado.
    if (Array.isArray(responseData.items)) {
      const countsByType = new Map<string, number>();
      for (const item of responseData.items) {
        if (isObj(item) && item.ticket_type_id) {
          const tid = String(item.ticket_type_id);
          countsByType.set(tid, (countsByType.get(tid) ?? 0) + Number(item.quantity ?? 0));
        }
      }
      updateMatching(
        (b) => /^\/concerts\/\d+$/.test(b),
        (env) => {
          if (!isObj(env.data) || !Array.isArray(env.data.ticket_types)) return null;
          let touched = false;
          const nextTypes = env.data.ticket_types.map((t) => {
            if (!isObj(t)) return t;
            const qty = countsByType.get(String(t.id));
            if (!qty) return t;
            touched = true;
            const avail = Number(t.available ?? t.stock_total ?? 0);
            const sold = Number(t.sold ?? 0);
            return { ...t, available: Math.max(0, avail - qty), sold: sold + qty };
          });
          return touched ? { ...env, data: { ...env.data, ticket_types: nextTypes } } : null;
        },
      );
    }
    // Las entradas nuevas reciben tokens QR generados en servidor: sincroniza en segundo plano sin spinner.
    triggerSilentSync("/tickets");
    triggerSilentSync("/notifications");
    triggerSilentSync("/organizer/statistics");
    triggerSilentSync("/admin/statistics");
    return;
  }

  const purchaseCancelMatch = /^\/purchases\/(\d+)\/cancel$/.exec(base);
  if (purchaseCancelMatch && isObj(responseData)) {
    const purchaseId = purchaseCancelMatch[1];
    setResourceSnapshot(`/purchases/${purchaseId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/purchases/me",
      (env) => patchInList(env, purchaseId, responseData),
    );
    // Marca como CANCELLED en estado local las entradas pertenecientes a esta compra.
    updateMatching(
      (b) => b === "/tickets" || /^\/tickets\/\d+$/.test(b),
      (env) => {
        if (Array.isArray(env.data)) {
          let changed = false;
          const next = env.data.map((t) => {
            if (isObj(t) && String(t.purchase_id) === purchaseId) {
              changed = true;
              return { ...t, status: "CANCELLED" };
            }
            return t;
          });
          return changed ? { ...env, data: next } : null;
        }
        if (isObj(env.data) && String(env.data.purchase_id) === purchaseId) {
          return { ...env, data: { ...env.data, status: "CANCELLED" } };
        }
        return null;
      },
    );
    triggerSilentSync("/organizer/statistics");
    triggerSilentSync("/admin/statistics");
    return;
  }

  if (base === "/tickets/validate" && isObj(responseData) && responseData.result === "VALID") {
    const ticketId = String(responseData.ticket_id ?? "");
    const concertId = String(responseData.concert_id ?? "");
    const nowIso = new Date().toISOString();
    if (ticketId) {
      updateMatching(
        (b) => b === "/tickets" || b === `/tickets/${ticketId}`,
        (env) =>
          Array.isArray(env.data)
            ? patchInList(env, ticketId, { status: "USED", used_at: nowIso })
            : isObj(env.data) && String(env.data.id) === ticketId
              ? { ...env, data: { ...env.data, status: "USED", used_at: nowIso } }
              : null,
      );
      if (concertId) {
        updateMatching(
          (b) => b === `/concerts/${concertId}/attendees`,
          (env) => {
            if (!Array.isArray(env.data)) return null;
            let changed = false;
            const next = env.data.map((a) => {
              if (isObj(a) && String(a.ticket_id) === ticketId) {
                changed = true;
                return { ...a, status: "USED", used_at: nowIso };
              }
              return a;
            });
            return changed ? { ...env, data: next } : null;
          },
        );
      }
    }
    return;
  }

  // ---- NOTIFICACIONES Y PREFERENCIAS ----
  const notifReadMatch = /^\/notifications\/(\d+)\/read$/.exec(base);
  if (notifReadMatch) {
    const notifId = notifReadMatch[1];
    const nowIso = new Date().toISOString();
    let nextUnread: number | null = null;
    updateMatching(
      (b) => b === "/notifications",
      (env) => {
        if (!isObj(env.data) || !Array.isArray(env.data.items)) return null;
        let dec = 0;
        const nextItems = env.data.items.map((n) => {
          if (isObj(n) && String(n.id) === notifId && !n.read_at) {
            dec = 1;
            return { ...n, read_at: nowIso };
          }
          return n;
        });
        const prevUnread = Number(env.data.unread_count ?? 0);
        const computed = Math.max(0, prevUnread - dec);
        nextUnread = computed;
        return { ...env, data: { ...env.data, items: nextItems, unread_count: computed } };
      },
    );
    if (nextUnread !== null) notifyUnread(nextUnread);
    return;
  }

  if (base === "/notifications/read-all") {
    const nowIso = new Date().toISOString();
    updateMatching(
      (b) => b === "/notifications",
      (env) => {
        if (!isObj(env.data) || !Array.isArray(env.data.items)) return null;
        return {
          ...env,
          data: {
            ...env.data,
            unread_count: 0,
            items: env.data.items.map((n) => (isObj(n) && !n.read_at ? { ...n, read_at: nowIso } : n)),
          },
        };
      },
    );
    notifyUnread(0);
    return;
  }

  if (base === "/preferences/update" && isObj(responseData)) {
    setResourceSnapshot("/preferences", { success: true, data: responseData }, true);
    return;
  }

  // ---- CUENTA, PERFILES Y USUARIOS ADMIN ----
  if (base === "/auth/me/update" && isObj(responseData)) {
    setResourceSnapshot("/auth/me", { success: true, data: responseData }, true);
    return;
  }

  if ((base === "/me/profiles" || base === "/me/profiles/activate") && isObj(responseData)) {
    const roles = Array.isArray(responseData.roles) ? responseData.roles : undefined;
    updateMatching(
      (b) => b === "/me/profiles",
      (env) => {
        if (!isObj(env.data)) return null;
        const selfService = Array.isArray(env.data.self_service)
          ? env.data.self_service.map((r) =>
              isObj(r) && roles ? { ...r, active: roles.includes(String(r.code)) } : r,
            )
          : env.data.self_service;
        return {
          ...env,
          data: {
            ...env.data,
            ...(roles ? { roles } : {}),
            ...(Array.isArray(responseData.permissions) ? { permissions: responseData.permissions } : {}),
            self_service: selfService,
          },
        };
      },
    );
    return;
  }

  if (base === "/me/profile-requests" && isObj(responseData)) {
    updateMatching(
      (b) => b === "/me/profiles",
      (env) => {
        if (!isObj(env.data)) return null;
        const requests = Array.isArray(env.data.requests) ? [responseData, ...env.data.requests] : [responseData];
        const reqRole = String(responseData.role ?? "");
        const requestable = Array.isArray(env.data.requestable)
          ? env.data.requestable.map((r) =>
              isObj(r) && String(r.code) === reqRole ? { ...r, pending: true } : r,
            )
          : env.data.requestable;
        return { ...env, data: { ...env.data, requests, requestable } };
      },
    );
    updateMatching(
      (b) => b === "/admin/profile-requests",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const profileReqDecideMatch = /^\/admin\/profile-requests\/(\d+)\/(approve|reject)$/.exec(base);
  if (profileReqDecideMatch) {
    const reqId = profileReqDecideMatch[1];
    updateMatching(
      (b) => b === "/admin/profile-requests",
      (env) => removeFromList(env, reqId),
    );
    triggerSilentSync("/admin/users");
    triggerSilentSync("/admin/audit");
    return;
  }

  const userStatusMatch = /^\/admin\/users\/(\d+)\/(suspend|reactivate)$/.exec(base);
  if (userStatusMatch && isObj(responseData)) {
    const userId = userStatusMatch[1];
    setResourceSnapshot(`/admin/users/${userId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/admin/users",
      (env) => patchInList(env, userId, responseData),
    );
    triggerSilentSync("/admin/audit");
    return;
  }

  const userRoleMatch = /^\/admin\/users\/(\d+)\/roles(?:\/[^/]+\/delete)?$/.exec(base);
  if (userRoleMatch && isObj(responseData) && isObj(responseData.user)) {
    const userId = userRoleMatch[1];
    setResourceSnapshot(`/admin/users/${userId}`, { success: true, data: responseData.user }, true);
    updateMatching(
      (b) => b === "/admin/users",
      (env) => patchInList(env, userId, responseData.user as AnyRecord),
    );
    triggerSilentSync("/admin/audit");
    return;
  }

  // ---- CATÁLOGOS DEL SISTEMA ----
  const catalogCreateMatch = /^\/(provinces|districts|cities|genres)\/create$/.exec(base);
  if (catalogCreateMatch && isObj(responseData)) {
    const kind = catalogCreateMatch[1];
    updateMatching(
      (b) => b === `/${kind}`,
      (env) => upsertInList(env, responseData, false),
    );
    return;
  }

  const catalogUpdateMatch = /^\/(provinces|districts|cities|genres)\/(\d+)\/update$/.exec(base);
  if (catalogUpdateMatch && isObj(responseData)) {
    const [, kind, itemId] = catalogUpdateMatch;
    updateMatching(
      (b) => b === `/${kind}`,
      (env) => patchInList(env, itemId, responseData),
    );
    return;
  }

  const catalogDeleteMatch = /^\/(provinces|districts|cities|genres)\/(\d+)\/delete$/.exec(base);
  if (catalogDeleteMatch) {
    const [, kind, itemId] = catalogDeleteMatch;
    updateMatching(
      (b) => b === `/${kind}`,
      (env) => removeFromList(env, itemId),
    );
    return;
  }

  // ---- ARTISTAS Y PROPUESTAS ----
  if (base === "/artists/create" && isObj(responseData)) {
    const artistId = String(responseData.id ?? "");
    if (artistId) setResourceSnapshot(`/artists/${artistId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/artists/mine" || b === "/artists",
      (env, full) =>
        full.startsWith("/artists/mine") || responseData.status === "PUBLISHED"
          ? upsertInList(env, responseData, true)
          : null,
    );
    return;
  }

  const artistUpdateMatch = /^\/artists\/(\d+)\/(update|publish|archive)$/.exec(base);
  if (artistUpdateMatch && isObj(responseData)) {
    const artistId = artistUpdateMatch[1];
    setResourceSnapshot(`/artists/${artistId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/artists/mine" || b === "/artists",
      (env) => patchInList(env, artistId, responseData),
    );
    return;
  }

  const artistMemberMatch = /^\/artists\/(\d+)\/members\/(?:add|\d+\/(?:update|delete))$/.exec(base);
  if (artistMemberMatch && Array.isArray(responseData)) {
    const artistId = artistMemberMatch[1];
    updateMatching(
      (b) => b === `/artists/${artistId}`,
      (env) => (isObj(env.data) ? { ...env, data: { ...env.data, members: responseData } } : null),
    );
    return;
  }

  if (base === "/proposals/create" && isObj(responseData)) {
    const propId = String(responseData.id ?? "");
    if (propId) setResourceSnapshot(`/proposals/${propId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/proposals",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const proposalDecideMatch = /^\/proposals\/(\d+)\/(accept|reject|cancel)$/.exec(base);
  if (proposalDecideMatch && isObj(responseData)) {
    const propId = proposalDecideMatch[1];
    setResourceSnapshot(`/proposals/${propId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/proposals",
      (env) => patchInList(env, propId, responseData),
    );
    return;
  }

  // ---- MARKETPLACE: ORGANIZACIONES, ESTABLECIMIENTOS, ESPACIOS, BLOQUEOS, PRESUPUESTOS, RESERVAS ----
  if (base === "/marketplace/organizations/create" && isObj(responseData)) {
    updateMatching(
      (b) => b === "/marketplace/organizations/mine",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const orgMemberMatch = /^\/marketplace\/organizations\/(\d+)\/members\/(?:add|\d+\/(?:update|delete))$/.exec(base);
  if (orgMemberMatch && Array.isArray(responseData)) {
    setResourceSnapshot(`/marketplace/organizations/${orgMemberMatch[1]}/members`, { success: true, data: responseData }, true);
    return;
  }

  if (base === "/marketplace/establishments/create" && isObj(responseData)) {
    updateMatching(
      (b) => b === "/marketplace/establishments/mine",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const estUpdateMatch = /^\/marketplace\/establishments\/(\d+)\/(update|publish|archive)$/.exec(base);
  if (estUpdateMatch && isObj(responseData)) {
    updateMatching(
      (b) => b === "/marketplace/establishments/mine",
      (env) => patchInList(env, estUpdateMatch[1], responseData),
    );
    if (responseData.status === "PENDING_REVIEW") {
      updateMatching(
        (b) => b === "/marketplace/establishments/pending",
        (env) => upsertInList(env, responseData, true),
      );
    }
    return;
  }

  const estReviewMatch = /^\/marketplace\/establishments\/(\d+)\/(approve|reject)$/.exec(base);
  if (estReviewMatch) {
    const estId = estReviewMatch[1];
    const nextStatus = estReviewMatch[2] === "approve" ? "PUBLISHED" : "DRAFT";
    updateMatching(
      (b) => b === "/marketplace/establishments/pending",
      (env) => removeFromList(env, estId),
    );
    updateMatching(
      (b) => b === "/marketplace/establishments/mine",
      (env) => patchInList(env, estId, { status: nextStatus }),
    );
    return;
  }

  const venueCreateMatch = /^\/marketplace\/establishments\/(\d+)\/venues\/create$/.exec(base);
  if (venueCreateMatch && isObj(responseData)) {
    const venueId = String(responseData.id ?? "");
    if (venueId) setResourceSnapshot(`/marketplace/venues/${venueId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === `/marketplace/establishments/${venueCreateMatch[1]}/venues`,
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const venueUpdateMatch = /^\/marketplace\/venues\/(\d+)\/(update|publish|archive)$/.exec(base);
  if (venueUpdateMatch && isObj(responseData)) {
    const venueId = venueUpdateMatch[1];
    setResourceSnapshot(`/marketplace/venues/${venueId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/marketplace/venues" || /^\/marketplace\/establishments\/\d+\/venues$/.test(b),
      (env) => patchInList(env, venueId, responseData),
    );
    return;
  }

  const blockCreateMatch = /^\/marketplace\/establishments\/(\d+)\/blocks\/create$/.exec(base);
  if (blockCreateMatch && isObj(responseData)) {
    updateMatching(
      (b) => b === `/marketplace/establishments/${blockCreateMatch[1]}/blocks`,
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const blockDeleteMatch = /^\/marketplace\/blocks\/(\d+)\/delete$/.exec(base);
  if (blockDeleteMatch) {
    updateMatching(
      (b) => /^\/marketplace\/establishments\/\d+\/blocks$/.test(b),
      (env) => removeFromList(env, blockDeleteMatch[1]),
    );
    return;
  }

  if (base === "/marketplace/quotes/create" && isObj(responseData)) {
    const quoteId = String(responseData.id ?? "");
    if (quoteId) setResourceSnapshot(`/marketplace/quotes/${quoteId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/marketplace/quotes",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const mktQuoteMatch = /^\/marketplace\/quotes\/(\d+)\/(respond|reject|cancel|accept)$/.exec(base);
  if (mktQuoteMatch && isObj(responseData)) {
    const quoteId = mktQuoteMatch[1];
    const quoteObj = isObj(responseData.quote) ? responseData.quote : responseData;
    setResourceSnapshot(`/marketplace/quotes/${quoteId}`, { success: true, data: quoteObj }, true);
    updateMatching(
      (b) => b === "/marketplace/quotes",
      (env) => patchInList(env, quoteId, quoteObj),
    );
    if (isObj(responseData.reservation)) {
      const resv = responseData.reservation;
      const resvId = String(resv.id ?? "");
      if (resvId) setResourceSnapshot(`/marketplace/reservations/${resvId}`, { success: true, data: resv }, true);
      updateMatching(
        (b) => b === "/marketplace/reservations",
        (env) => upsertInList(env, resv, true),
      );
    }
    return;
  }

  if (base === "/marketplace/reservations/create" && isObj(responseData)) {
    const resvId = String(responseData.id ?? "");
    if (resvId) setResourceSnapshot(`/marketplace/reservations/${resvId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/marketplace/reservations",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const resvActionMatch = /^\/marketplace\/reservations\/(\d+)\/(accept|reject|cancel|payments)$/.exec(base);
  if (resvActionMatch && isObj(responseData)) {
    const resvId = resvActionMatch[1];
    const resvObj = isObj(responseData.reservation) ? responseData.reservation : responseData;
    setResourceSnapshot(`/marketplace/reservations/${resvId}`, { success: true, data: resvObj }, true);
    updateMatching(
      (b) => b === "/marketplace/reservations",
      (env) => patchInList(env, resvId, resvObj),
    );
    return;
  }

  // ---- SERVICIOS: EMPRESAS, OFERTAS Y COTIZACIONES ----
  const verifyMatch = /^\/services\/providers\/(\d+)\/(verify|unverify)$/.exec(base);
  if (verifyMatch) {
    const orgId = verifyMatch[1];
    const isVerified = verifyMatch[2] === "verify";
    updateMatching(
      (b) => b === "/admin/organizations",
      (env) => {
        if (!Array.isArray(env.data)) return null;
        let changed = false;
        const next = env.data.map((org) => {
          if (isObj(org) && String(org.id) === orgId && isObj(org.service_provider)) {
            changed = true;
            return { ...org, service_provider: { ...org.service_provider, is_verified: isVerified } };
          }
          return org;
        });
        return changed ? { ...env, data: next } : null;
      },
    );
    updateMatching(
      (b) => b === "/services/providers" || b === `/services/providers/${orgId}` || b === "/services/providers/mine",
      (env) =>
        Array.isArray(env.data)
          ? patchInList(env, orgId, { is_verified: isVerified })
          : isObj(env.data) && String(env.data.id) === orgId
            ? { ...env, data: { ...env.data, is_verified: isVerified } }
            : null,
    );
    return;
  }

  if (base === "/services/providers/create" && isObj(responseData)) {
    const provId = String(responseData.id ?? "");
    if (provId) setResourceSnapshot(`/services/providers/${provId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/services/providers/mine",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const provUpdateMatch = /^\/services\/providers\/(\d+)\/(update|publish|archive)$/.exec(base);
  if (provUpdateMatch && isObj(responseData)) {
    const provId = provUpdateMatch[1];
    setResourceSnapshot(`/services/providers/${provId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/services/providers/mine" || b === "/services/providers",
      (env) => patchInList(env, provId, responseData),
    );
    return;
  }

  const provMemberMatch = /^\/services\/providers\/(\d+)\/members\/(?:add|\d+\/(?:update|delete))$/.exec(base);
  if (provMemberMatch && Array.isArray(responseData)) {
    const provId = provMemberMatch[1];
    updateMatching(
      (b) => b === `/services/providers/${provId}`,
      (env) => (isObj(env.data) ? { ...env, data: { ...env.data, members: responseData } } : null),
    );
    return;
  }

  const offeringCreateMatch = /^\/services\/providers\/(\d+)\/offerings\/create$/.exec(base);
  if (offeringCreateMatch && isObj(responseData)) {
    const offId = String(responseData.id ?? "");
    if (offId) setResourceSnapshot(`/services/offerings/${offId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === `/services/providers/${offeringCreateMatch[1]}`,
      (env) => {
        if (!isObj(env.data)) return null;
        const curr = Array.isArray(env.data.offerings) ? env.data.offerings : [];
        return { ...env, data: { ...env.data, offerings: [responseData, ...curr] } };
      },
    );
    return;
  }

  const offeringUpdateMatch = /^\/services\/offerings\/(\d+)\/(update|publish|archive)$/.exec(base);
  if (offeringUpdateMatch && isObj(responseData)) {
    const offId = offeringUpdateMatch[1];
    setResourceSnapshot(`/services/offerings/${offId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/services/offerings",
      (env) => patchInList(env, offId, responseData),
    );
    updateMatching(
      (b) => /^\/services\/providers\/\d+$/.test(b),
      (env) => {
        if (!isObj(env.data) || !Array.isArray(env.data.offerings)) return null;
        let touched = false;
        const nextOfferings = env.data.offerings.map((o) => {
          if (isObj(o) && String(o.id) === offId) {
            touched = true;
            return { ...o, ...responseData };
          }
          return o;
        });
        return touched ? { ...env, data: { ...env.data, offerings: nextOfferings } } : null;
      },
    );
    return;
  }

  if (base === "/services/quotes/create" && isObj(responseData)) {
    const qId = String(responseData.id ?? "");
    if (qId) setResourceSnapshot(`/services/quotes/${qId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/services/quotes",
      (env) => upsertInList(env, responseData, true),
    );
    return;
  }

  const svcQuoteMatch = /^\/services\/quotes\/(\d+)\/(respond|reject|cancel|accept)$/.exec(base);
  if (svcQuoteMatch && isObj(responseData)) {
    const qId = svcQuoteMatch[1];
    setResourceSnapshot(`/services/quotes/${qId}`, { success: true, data: responseData }, true);
    updateMatching(
      (b) => b === "/services/quotes",
      (env) => patchInList(env, qId, responseData),
    );
    return;
  }

  // Fallback genérico si se envió una mutación sin regla explícita y devolvió una entidad con id.
  void payload;
}

