import { HttpClient, normalizeApiBase } from "./http";
import { storage } from "./storage";
import { handleApiMutation, setSyncFetcher, type SyncVersionsResponse } from "./syncEngine";

// Cliente HTTP único del frontend: resuelve la URL base del backend y persiste tokens en storage.
export const api = new HttpClient(
  normalizeApiBase(
    process.env.EXPO_PUBLIC_API_URL,
    "http://localhost:3000",
    // En web se usa el hostname actual para permitir acceso desde red local si no hay URL pública.
    typeof window !== "undefined" ? (window.location?.hostname ?? "").toLowerCase() : "",
  ),
  storage,
);

// Conecta el motor centralizado de sincronización de versiones al cliente HTTP.
setSyncFetcher(async () => {
  const response = await api.request<SyncVersionsResponse>("/sync/versions", { method: "POST" });
  return response.data;
});

// Propaga mutaciones exitosas a todos los recursos y contextos montados de forma inmediata.
api.onSuccess = (path, options, payload) => {
  if (path.split("?")[0] === "/sync/versions") return;
  handleApiMutation(path, options.body, payload.data);
};
