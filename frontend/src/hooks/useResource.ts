import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
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

// Hook genérico de lectura GET con manejo de loading, error, caché de catálogos y cancelación por secuencia.
export function useResource<T>(path: string | null) {
  // Inicializa con datos cacheados si el catálogo sigue vigente.
  const [result, setResult] = useState<Envelope<T> | null>(() => {
    if (path && isCatalogEndpoint(path)) {
      const cached = catalogCache.get(path);
      if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_TTL_MS) {
        return cached.envelope as Envelope<T>;
      }
    }
    return null;
  });
  // Evita mostrar spinner si ya hay caché válida disponible.
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
  // Contador incremental para descartar respuestas de requests obsoletos.
  const sequence = useRef(0);

  // Ejecuta o recarga la consulta al backend (opcionalmente omitiendo la caché).
  const reload = useCallback(async (options?: { bypassCache?: boolean }) => {
    const request = ++sequence.current;
    // Si la ruta es null, limpia el estado sin consultar a la API.
    if (!path) {
      setLoading(false);
      setResult(null);
      setError("");
      return;
    }

    const isCatalog = isCatalogEndpoint(path);
    const bypass = options?.bypassCache ?? false;

    // Responde desde caché si aplica y no expiró.
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
      // Solo aplica el resultado si sigue siendo la petición más reciente.
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

  // Dispara la carga inicial o cuando cambia la ruta, e invalida al desmontar.
  useEffect(() => {
    void reload();
    return () => {
      sequence.current++;
    };
  }, [reload]);

  return { result, loading, error, reload };
}
