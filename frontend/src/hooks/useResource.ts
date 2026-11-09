import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { Envelope } from "../types/api";

const CATALOG_BASE_PATHS = [
  "/provinces",
  "/districts",
  "/cities",
  "/genres",
  "/marketplace/catalogs",
  "/services/categories",
  "/marketplace/cities",
];

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

type CacheEntry = {
  envelope: Envelope<unknown>;
  timestamp: number;
};

const catalogCache = new Map<string, CacheEntry>();

export function isCatalogEndpoint(path: string | null): boolean {
  if (!path) return false;
  const base = path.split("?")[0];
  return CATALOG_BASE_PATHS.some((catalog) => base === catalog || base.startsWith(`${catalog}/`));
}

export function invalidateCatalogCache(): void {
  catalogCache.clear();
}

export function useResource<T>(path: string | null) {
  const [result, setResult] = useState<Envelope<T> | null>(() => {
    if (path && isCatalogEndpoint(path)) {
      const cached = catalogCache.get(path);
      if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_TTL_MS) {
        return cached.envelope as Envelope<T>;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!path) return false;
    if (isCatalogEndpoint(path)) {
      const cached = catalogCache.get(path);
      if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_TTL_MS) {
        return false;
      }
    }
    return true;
  });
  const [error, setError] = useState("");
  const sequence = useRef(0);

  const reload = useCallback(async (options?: { bypassCache?: boolean }) => {
    const request = ++sequence.current;
    if (!path) {
      setLoading(false);
      setResult(null);
      setError("");
      return;
    }

    const isCatalog = isCatalogEndpoint(path);
    const bypass = options?.bypassCache ?? false;

    if (isCatalog && !bypass) {
      const cached = catalogCache.get(path);
      if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_TTL_MS) {
        setResult(cached.envelope as Envelope<T>);
        setLoading(false);
        setError("");
        return;
      }
    }

    setLoading(true);
    setError("");
    try {
      const data = await api.request<T>(path);
      if (request === sequence.current) {
        setResult(data);
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
  }, [path]);

  useEffect(() => {
    void reload();
    return () => {
      sequence.current++;
    };
  }, [reload]);

  return { result, loading, error, reload };
}
