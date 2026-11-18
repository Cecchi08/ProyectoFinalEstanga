import type { Envelope } from "../types/api";

// Dominios lógicos de sincronización alineados con POST /sync/versions.
export type SyncDomain =
  | "provinces"
  | "districts"
  | "cities"
  | "genres"
  | "concerts"
  | "artists"
  | "marketplace"
  | "marketplace_ops"
  | "services"
  | "services_ops"
  | "proposals"
  | "purchases"
  | "tickets"
  | "staff"
  | "notifications"
  | "preferences"
  | "me"
  | "statistics"
  | "admin_promotions"
  | "admin_users"
  | "admin_organizations"
  | "admin_establishments"
  | "promotions_sig";

export interface SyncVersionsResponse {
  server_time?: string;
  versions: Record<string, string>;
}

export type UnreadEvent =
  | { mode: "delta"; delta: number }
  | { mode: "set"; value: number }
  | { mode: "sync" };

type DomainListener = () => void;
type UnreadListener = (event: UnreadEvent) => void;
type SyncFetcher = () => Promise<SyncVersionsResponse>;

interface CacheEntry {
  envelope: Envelope<unknown>;
  stamp: string;
  updatedAt: number;
}

const POLL_INTERVAL_MS = 4000;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Estado centralizado único del motor de sincronización y caché SWR por sesión.
let sessionScope = "anon";
let syncEpoch = 0;
let knownVersions: Record<string, string> = {};
const domainBumps: Record<string, number> = {};
const resourceCache = new Map<string, CacheEntry>();

const domainSubscribers = new Map<SyncDomain, Set<DomainListener>>();
const unreadSubscribers = new Set<UnreadListener>();

let fetcher: SyncFetcher | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let syncInFlight: Promise<void> | null = null;
let pendingSync = false;
let canPollCheck: () => boolean = () => true;

export function configureSyncEnvironment(check: () => boolean): void {
  canPollCheck = check;
  updatePollingSchedule();
}

// Mapea una ruta GET/POST de lectura a los dominios de sincronización que la afectan.
export function domainsForPath(path: string | null): SyncDomain[] {
  if (!path) return [];
  const base = path.split("?")[0];

  if (base === "/provinces" || base.startsWith("/provinces/")) return ["provinces"];
  if (base === "/districts" || base.startsWith("/districts/")) return ["districts", "provinces"];
  if (base === "/cities" || base.startsWith("/cities/")) return ["cities", "districts", "provinces"];
  if (base === "/genres" || base.startsWith("/genres/")) return ["genres"];

  if (base === "/marketplace/cities") return ["cities", "marketplace"];
  if (base === "/marketplace/catalogs") return ["marketplace"];
  if (base === "/venues" || base.startsWith("/venues/") || base === "/marketplace/venues" || base.startsWith("/marketplace/venues/")) {
    return ["marketplace", "marketplace_ops", "cities"];
  }
  if (base === "/marketplace/establishments/pending") {
    return ["admin_establishments", "marketplace_ops", "cities"];
  }
  if (base.startsWith("/marketplace/")) {
    return ["marketplace_ops", "marketplace", "cities"];
  }

  if (base === "/concerts" || base.startsWith("/concerts/")) {
    if (base.endsWith("/attendees")) return ["staff", "tickets", "purchases"];
    if (base.endsWith("/staff")) return ["staff", "concerts"];
    return ["concerts", "cities", "genres", "marketplace", "artists"];
  }
  if (base === "/staff/assignments") return ["staff", "concerts"];

  if (base === "/recommendations") return ["concerts", "preferences", "purchases", "cities", "genres"];
  if (base === "/preferences") return ["preferences"];
  if (base === "/auth/me" || base === "/me/profiles" || base === "/me/profile-requests/mine") return ["me"];
  if (base === "/notifications") return ["notifications"];

  if (base === "/purchases/me" || base.startsWith("/purchases/")) return ["purchases", "concerts", "tickets"];
  if (base === "/tickets" || base.startsWith("/tickets/")) return ["tickets", "concerts", "purchases"];

  if (base === "/artists" || base.startsWith("/artists/")) return ["artists", "genres", "cities", "concerts"];
  if (base === "/proposals" || base.startsWith("/proposals/")) return ["proposals", "artists", "concerts", "marketplace_ops"];

  if (base === "/services/categories") return ["services"];
  if (base === "/services/quotes" || base.startsWith("/services/quotes/")) return ["services_ops", "services"];
  if (base.startsWith("/services/")) return ["services", "services_ops", "cities"];

  if (base === "/admin/promotions" || base.startsWith("/admin/promotions/")) return ["admin_promotions", "concerts"];
  if (
    base === "/admin/users" ||
    base.startsWith("/admin/users/") ||
    base === "/admin/profile-requests" ||
    base === "/admin/audit"
  ) {
    return ["admin_users"];
  }
  if (base === "/admin/organizations") return ["admin_organizations", "marketplace_ops", "services_ops"];

  if (base === "/organizer/statistics" || base.endsWith("/statistics") || base === "/admin/statistics") {
    return ["statistics", "concerts", "purchases", "tickets"];
  }

  return [];
}

// Detecta endpoints de escritura para no confundir lecturas POST con mutaciones.
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
  if (base === "/promotions/validate") return false;
  if (WRITE_EXACT.has(base) || WRITE_SUFFIX_RE.test(base)) return true;
  if (base === "/me/profiles" && body !== undefined) return true;
  if (base === "/admin/promotions" && isObj(body) && typeof body.code === "string") return true;
  return false;
}

// Mapea una ruta de mutación exitosa a todos los dominios afectados en backend/frontend.
export function domainsForMutation(path: string): SyncDomain[] {
  const base = path.split("?")[0];

  if (base.startsWith("/provinces/")) return ["provinces", "districts", "cities", "concerts", "marketplace"];
  if (base.startsWith("/districts/")) return ["districts", "cities", "concerts", "marketplace"];
  if (base.startsWith("/cities/")) return ["cities", "concerts", "marketplace", "artists", "services"];
  if (base.startsWith("/genres/")) return ["genres", "concerts", "artists"];

  if (base.startsWith("/concerts/") && base.includes("/staff")) return ["staff", "concerts"];
  if (base.startsWith("/concerts") || base.startsWith("/ticket-types/")) {
    return ["concerts", "tickets", "statistics", "proposals"];
  }

  if (base.startsWith("/admin/promotions")) return ["admin_promotions", "promotions_sig", "concerts"];
  if (base.startsWith("/purchases")) return ["purchases", "concerts", "tickets", "statistics", "notifications", "admin_promotions", "promotions_sig"];
  if (base === "/tickets/validate") return ["tickets", "staff", "statistics"];

  if (base.startsWith("/notifications/")) return ["notifications"];
  if (base === "/preferences/update") return ["preferences"];
  if (base === "/auth/me/update" || base.startsWith("/me/profiles")) return ["me"];
  if (base === "/me/profile-requests") return ["me", "admin_users"];

  if (base.startsWith("/admin/profile-requests/") || base.startsWith("/admin/users/")) {
    return ["admin_users", "me"];
  }

  if (base.startsWith("/artists")) return ["artists", "concerts", "proposals"];
  if (base.startsWith("/proposals")) return ["proposals", "concerts", "marketplace_ops", "notifications"];

  if (base.startsWith("/marketplace/establishments/") && (base.endsWith("/approve") || base.endsWith("/reject"))) {
    return ["admin_establishments", "marketplace_ops", "marketplace", "admin_organizations", "notifications"];
  }
  if (base.startsWith("/marketplace/")) {
    return ["marketplace_ops", "marketplace", "concerts", "admin_establishments", "admin_organizations", "notifications"];
  }

  if (base.startsWith("/services/providers/") && (base.endsWith("/verify") || base.endsWith("/unverify"))) {
    return ["services", "services_ops", "admin_organizations"];
  }
  if (base.startsWith("/services/")) {
    return ["services", "services_ops", "admin_organizations", "notifications"];
  }

  return [];
}

function computeStamp(domains: readonly SyncDomain[]): string {
  if (!domains.length) return "static";
  return domains
    .map((d) => `${d}=${knownVersions[d] ?? "?"}#${domainBumps[d] ?? 0}`)
    .join(";");
}

function cacheKey(path: string): string {
  return `${sessionScope}::${path}`;
}

export function getCachedResource<T>(path: string | null): { envelope: Envelope<T>; stale: boolean } | null {
  if (!path) return null;
  const entry = resourceCache.get(cacheKey(path));
  if (!entry) return null;
  const expectedStamp = computeStamp(domainsForPath(path));
  return {
    envelope: entry.envelope as Envelope<T>,
    stale: entry.stamp !== expectedStamp,
  };
}

export function setCachedResource<T>(path: string, envelope: Envelope<T>): void {
  const stamp = computeStamp(domainsForPath(path));
  resourceCache.set(cacheKey(path), {
    envelope: envelope as Envelope<unknown>,
    stamp,
    updatedAt: Date.now(),
  });
}

function invalidateCacheDomains(domains: readonly SyncDomain[]): void {
  if (!domains.length) return;
  const set = new Set<SyncDomain>(domains);
  const prefix = `${sessionScope}::`;
  for (const key of Array.from(resourceCache.keys())) {
    if (!key.startsWith(prefix)) continue;
    const path = key.slice(prefix.length);
    const pathDomains = domainsForPath(path);
    if (pathDomains.some((d) => set.has(d))) {
      // Mantiene el snapshot marcado como stale (stamp distinto) en lugar de borrarlo para evitar parpadeos;
      // useResource lo mostrará mientras revalida silenciosamente.
      const existing = resourceCache.get(key);
      if (existing) {
        resourceCache.set(key, { ...existing, stamp: "stale" });
      }
    }
  }
}

function notifyDomains(domains: readonly SyncDomain[]): void {
  if (!domains.length) return;
  const listeners = new Set<DomainListener>();
  for (const domain of domains) {
    const subs = domainSubscribers.get(domain);
    if (subs) {
      for (const fn of subs) listeners.add(fn);
    }
  }
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // Evita que un listener con error detenga la propagación al resto de la app.
    }
  }
}

function totalSubscribers(): number {
  let count = 0;
  for (const set of domainSubscribers.values()) count += set.size;
  return count;
}

function isForegroundAndOnline(): boolean {
  return canPollCheck();
}

function updatePollingSchedule(): void {
  const shouldRun = Boolean(fetcher) && totalSubscribers() > 0 && isForegroundAndOnline();
  if (shouldRun && !pollTimer) {
    pollTimer = setInterval(() => {
      if (isForegroundAndOnline()) void syncNow();
    }, POLL_INTERVAL_MS);
  } else if (!shouldRun && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function setSyncFetcher(fn: SyncFetcher): void {
  fetcher = fn;
}

export function setSessionScope(userId: string | null): void {
  const nextScope = userId ? String(userId) : "anon";
  if (nextScope === sessionScope) return;
  sessionScope = nextScope;
  syncEpoch++;
  knownVersions = {};
  resourceCache.clear();
  for (const key of Object.keys(domainBumps)) delete domainBumps[key];
  if (totalSubscribers() > 0) void syncNow();
}

export function subscribeDomains(domains: readonly SyncDomain[], listener: DomainListener): () => void {
  if (!domains.length) return () => {};
  for (const domain of domains) {
    let set = domainSubscribers.get(domain);
    if (!set) {
      set = new Set();
      domainSubscribers.set(domain, set);
    }
    set.add(listener);
  }
  updatePollingSchedule();
  // Si aún no tenemos línea base de versiones, solicita una verificación inicial.
  if (Object.keys(knownVersions).length === 0 && isForegroundAndOnline()) {
    void syncNow();
  }
  return () => {
    for (const domain of domains) {
      const set = domainSubscribers.get(domain);
      if (set) {
        set.delete(listener);
        if (set.size === 0) domainSubscribers.delete(domain);
      }
    }
    updatePollingSchedule();
  };
}

export function subscribeUnreadEvents(listener: UnreadListener): () => void {
  unreadSubscribers.add(listener);
  return () => {
    unreadSubscribers.delete(listener);
  };
}

// Consulta /sync/versions de forma deduplicada y propaga únicamente los dominios que cambiaron en MySQL.
export async function syncNow(options?: { skipNotifyFor?: readonly SyncDomain[]; force?: boolean }): Promise<void> {
  if (!fetcher || !isForegroundAndOnline()) return;
  if (syncInFlight) {
    if (options?.force) pendingSync = true;
    return syncInFlight;
  }

  const epoch = syncEpoch;
  const skipSet = new Set<SyncDomain>(options?.skipNotifyFor ?? []);

  const flight = (async () => {
    try {
      const payload = await fetcher();
      if (epoch !== syncEpoch || !payload?.versions) return;

      const nextVersions = payload.versions;
      const changed: SyncDomain[] = [];
      const hadBaseline = Object.keys(knownVersions).length > 0;

      for (const [rawDomain, version] of Object.entries(nextVersions)) {
        const domain = rawDomain as SyncDomain;
        const prev = knownVersions[domain];
        if (prev !== undefined && prev !== version && !skipSet.has(domain)) {
          changed.push(domain);
        }
        knownVersions[domain] = version;
      }

      if (hadBaseline && changed.length > 0) {
        invalidateCacheDomains(changed);
        notifyDomains(changed);
      }
    } catch {
      // Silencioso ante fallos transitorios de red; se reintentará en el próximo tick o al reconectar.
    }
  })();

  syncInFlight = flight;
  try {
    await flight;
  } finally {
    if (syncInFlight === flight) syncInFlight = null;
    if (pendingSync) {
      pendingSync = false;
      if (isForegroundAndOnline()) void syncNow();
    }
  }
}

// Propaga inmediatamente mutaciones locales sin esperar al próximo intervalo de sondeo.
export function handleApiMutation(path: string, body: unknown, responseData: unknown): void {
  if (!isMutationRequest(path, body)) return;
  const base = path.split("?")[0];

  // Notificaciones locales inmediatas.
  if (/^\/notifications\/\d+\/read$/.test(base)) {
    for (const l of unreadSubscribers) l({ mode: "delta", delta: -1 });
  } else if (base === "/notifications/read-all") {
    for (const l of unreadSubscribers) l({ mode: "set", value: 0 });
  } else if (
    /^\/purchases\/\d+\/(confirm|cancel)$/.test(base) ||
    /^\/concerts\/\d+\/cancel$/.test(base) ||
    base === "/proposals/create" ||
    /^\/proposals\/\d+\/(accept|reject|cancel)$/.test(base) ||
    /^\/services\/quotes\/\d+\/(respond|reject|cancel|accept)$/.test(base) ||
    /^\/marketplace\/quotes\/\d+\/(respond|reject|cancel|accept)$/.test(base) ||
    /^\/marketplace\/reservations\/\d+\/(accept|reject|cancel)$/.test(base) ||
    /^\/marketplace\/establishments\/\d+\/(publish|approve|reject)$/.test(base)
  ) {
    for (const l of unreadSubscribers) l({ mode: "sync" });
  }

  const affected = domainsForMutation(path);
  if (!affected.length) return;

  for (const domain of affected) {
    domainBumps[domain] = (domainBumps[domain] ?? 0) + 1;
  }

  // Parche inmediato de detalle exacto si la respuesta devuelve el objeto entidad actualizado.
  const detailMatch = /^(\/(?:concerts|artists|proposals|purchases|admin\/users|marketplace\/quotes|marketplace\/reservations|marketplace\/venues|services\/providers|services\/offerings|services\/quotes)\/\d+)(?:\/[a-z-]+)?$/.exec(base);
  if (detailMatch && isObj(responseData)) {
    const detailPath = detailMatch[1];
    const detailKey = cacheKey(detailPath);
    const existing = resourceCache.get(detailKey);
    const mergedData =
      existing && isObj(existing.envelope.data)
        ? { ...existing.envelope.data, ...responseData }
        : responseData;
    resourceCache.set(detailKey, {
      envelope: { success: true, data: mergedData },
      stamp: computeStamp(domainsForPath(detailPath)),
      updatedAt: Date.now(),
    });
  }

  invalidateCacheDomains(affected);
  notifyDomains(affected);

  // Actualiza línea base de versiones en servidor para evitar un doble reload en el próximo tick.
  void syncNow({ skipNotifyFor: affected, force: true });
}
