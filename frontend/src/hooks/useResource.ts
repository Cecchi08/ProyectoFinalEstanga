import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { Envelope } from "../types/api";
export function useResource<T>(path: string | null) {
  const [result, setResult] = useState<Envelope<T> | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    if (!path) {
      setLoading(false);
      setResult(null);
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await api.request<T>(path);
      if (request === sequence.current) setResult(data);
    } catch (e) {
      if (request === sequence.current)
        setError(e instanceof Error ? e.message : "Error inesperado.");
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
