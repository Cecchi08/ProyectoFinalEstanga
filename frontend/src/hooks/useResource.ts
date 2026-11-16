import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import {
  consumeSyncFlag,
  getResourceSnapshot,
  hasFreshSnapshot,
  setResourceSnapshot,
  subscribeResourcePath,
  subscribeSilentSync,
} from "../services/resourceStore";
import type { Envelope } from "../types/api";

// Endpoints de catálogos estáticos/semiestáticos elegibles para caché en memoria.
const CATALOG_BASE_PATHS = [
  "/provinces",
  "/districts",
  "/cities",
  "/genres",
  "/marketplace/catalogs",
  "/services/categories",
  "/marketplace/cities",
];

// Tiempo de vida de la caché de catálogos en cliente.
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

type CacheEntry = {
  envelope: Envelope<unknown>;
  timestamp: number;
};

// Caché compartida en memoria indexada por ruta completa (incluye query params).
const catalogCache = new Map<string, CacheEntry>();

// Determina si una ruta corresponde a un catálogo cacheable.
export function isCatalogEndpoint(path: string | null): boolean {
  if (!path) return false;
  const base = path.split("?")[0];
  return CATALOG_BASE_PATHS.some((catalog) => base === catalog || base.startsWith(`${catalog}/`));
}

// Limpia toda la caché de catálogos (por ejemplo, al cerrar sesión).
export function invalidateCatalogCache(): void {
  catalogCache.clear();
}

function initialSnapshot<T>(path: string | null): Envelope<T> | null {
  if (!path) return null;
  const reactive = getResourceSnapshot<T>(path);
  if (reactive) return reactive;
  if (isCatalogEndpoint(path)) {
    const cached = catalogCache.get(path);
    if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_TTL_MS) {
      return cached.envelope as Envelope<T>;
    }
  }
  return null;
}

// Hook reactivo de lectura: sincroniza estado local vía useState con el store global sin mostrar
// animaciones de recarga cuando ya existen datos o cuando una mutación actualiza la vista.
export function useResource<T>(path: string | null) {
  const [result, setResult] = useState<Envelope<T> | null>(() => initialSnapshot<T>(path));
  // Solo muestra estado de carga en el primer montaje frío sin instantánea previa en memoria.
  const [loading, setLoading] = useState<boolean>(() => Boolean(path && !initialSnapshot<T>(path)));
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const resultRef = useRef(result);
  resultRef.current = result;

  // Ejecuta la carga inicial o sincroniza manualmente; si ya hay datos visibles nunca activa loading.
  const reload = useCallback(
    async (options?: { bypassCache?: boolean; silent?: boolean }) => {
      const request = ++sequence.current;
      if (!path) {
        setLoading(false);
        setResult(null);
        setError("");
        return;
      }

      const isCatalog = isCatalogEndpoint(path);
      const bypass = options?.bypassCache ?? false;
      const silent = options?.silent ?? false;

      if (isCatalog && !bypass) {
        const cached = catalogCache.get(path);
        if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_TTL_MS) {
          setResult(cached.envelope as Envelope<T>);
          setResourceSnapshot(path, cached.envelope as Envelope<T>);
          setLoading(false);
          setError("");
          return;
        }
      }

      // Nunca muestra spinner ni skeleton cuando ya hay datos renderizados o es sincronización silenciosa.
      const hasVisibleData = resultRef.current !== null || getResourceSnapshot<T>(path) !== null;
      if (!silent && !hasVisibleData) {
        setLoading(true);
      }
      setError("");
      try {
        const data = await api.request<T>(path);
        if (request === sequence.current) {
          setResult(data);
          setResourceSnapshot(path, data);
          if (isCatalog) {
            catalogCache.set(path, {
              envelope: data as Envelope<unknown>,
              timestamp: Date.now(),
            });
          }
        }
      } catch (e) {
        if (request === sequence.current) {
          setError(e instanceof Error ? e.message : "Error inesperado.");
        }
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    },
    [path],
  );

  // Al cambiar la ruta o montar: adopta al instante el estado del store reactivo sin refetch innecesario.
  useEffect(() => {
    const snap = initialSnapshot<T>(path);
    setResult(snap);
    setError("");
    if (!path) {
      setLoading(false);
      return;
    }
    if (snap && hasFreshSnapshot(path)) {
      setLoading(false);
      return;
    }
    if (snap && consumeSyncFlag(path)) {
      setLoading(false);
      void reload({ silent: true, bypassCache: true });
      return;
    }
    if (snap) {
      setLoading(false);
      return;
    }
    void reload();
    return () => {
      sequence.current++;
    };
  }, [path, reload]);

  // Suscripción reactiva: cualquier mutación sobre esta ruta actualiza useState automáticamente y re-renderiza.
  useEffect(() => {
    if (!path) return;
    return subscribeResourcePath(path, () => {
      const next = getResourceSnapshot<T>(path);
      setResult(next);
      setLoading(false);
      setError("");
    });
  }, [path]);

  // Sincronización silenciosa automática para vistas derivadas marcadas tras compras o cambios de permisos.
  useEffect(() => {
    if (!path) return;
    const base = path.split("?")[0];
    return subscribeSilentSync((prefix) => {
      if (base.startsWith(prefix) && consumeSyncFlag(path)) {
        void reload({ silent: true, bypassCache: true });
      }
    });
  }, [path, reload]);

  return { result, loading, error, reload };
}
