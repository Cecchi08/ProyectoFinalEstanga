import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";
import { ApiError } from "../services/http";
import { ensureSyncLifecycle } from "../services/syncLifecycle";
import {
  domainsForPath,
  getCachedResource,
  setCachedResource,
  subscribeDomains,
} from "../services/syncEngine";
import type { Envelope } from "../types/api";

// Hook reactivo centralizado con caché SWR por sesión e invalidación automática entre sesiones:
// - Muestra al instante snapshots válidos o en revalidación sin parpadeos ni animaciones falsas.
// - Se suscribe automáticamente a los dominios del recurso en syncEngine para reflejar cambios locales y remotos.
// - Evita sobrescribir datos más recientes con respuestas antiguas mediante secuencia por instancia.
export function useResource<T>(path: string | null) {
  const [result, setResult] = useState<Envelope<T> | null>(() => {
    const cached = getCachedResource<T>(path);
    return cached ? cached.envelope : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!path) return false;
    return getCachedResource<T>(path) === null;
  });
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const activePathRef = useRef<string | null>(path);
  const resultRef = useRef(result);
  resultRef.current = result;

  const reload = useCallback(
    async (options?: { silent?: boolean; bypassCache?: boolean }) => {
      const request = ++sequence.current;
      const targetPath = path;
      if (!targetPath) {
        setLoading(false);
        setResult(null);
        setError("");
        return;
      }

      const silent = options?.silent ?? false;
      const hasVisibleSamePath = activePathRef.current === targetPath && resultRef.current !== null;
      if (!silent && !hasVisibleSamePath) {
        setLoading(true);
      }
      setError("");

      try {
        const data = await api.request<T>(targetPath);
        if (request === sequence.current && activePathRef.current === targetPath) {
          setCachedResource(targetPath, data);
          setResult(data);
        }
      } catch (e) {
        if (request === sequence.current && activePathRef.current === targetPath) {
          if (silent && hasVisibleSamePath) {
            if (e instanceof ApiError && (e.status === 404 || e.status === 403 || e.status === 401)) {
              setResult(null);
              setError(e.message);
            }
          } else {
            setError(e instanceof Error ? e.message : "Error inesperado.");
          }
        }
      } finally {
        if (request === sequence.current && activePathRef.current === targetPath) {
          setLoading(false);
        }
      }
    },
    [path],
  );

  // Carga inicial o revalidación silenciosa al cambiar de ruta.
  useEffect(() => {
    activePathRef.current = path;
    setError("");
    if (!path) {
      sequence.current++;
      setResult(null);
      setLoading(false);
      return;
    }

    const cached = getCachedResource<T>(path);
    if (cached) {
      setResult(cached.envelope);
      setLoading(false);
      if (cached.stale) {
        void reload({ silent: true });
      }
    } else {
      setResult(null);
      setLoading(true);
      void reload();
    }

    return () => {
      sequence.current++;
    };
  }, [path, reload]);

  // Suscripción centralizada a dominios: actualiza en segundo plano ante mutaciones locales o de otras sesiones.
  useEffect(() => {
    ensureSyncLifecycle();
    if (!path) return;
    const domains = domainsForPath(path);
    if (!domains.length) return;
    return subscribeDomains(domains, () => {
      const latest = getCachedResource<T>(path);
      if (latest && !latest.stale) {
        setResult(latest.envelope);
        setError("");
        setLoading(false);
        return;
      }
      if (latest) {
        setResult(latest.envelope);
      }
      void reload({ silent: true });
    });
  }, [path, reload]);

  return useMemo(
    () => ({ result, loading, error, reload }),
    [result, loading, error, reload],
  );
}
