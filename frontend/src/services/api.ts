import { HttpClient, normalizeApiBase } from "./http";
import { applyApiMutation, isMutationRequest } from "./resourceStore";
import { storage } from "./storage";

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

// Sincroniza automáticamente el estado reactivo global cada vez que una mutación responde con éxito.
api.onSuccess = (path, options, payload) => {
  if (isMutationRequest(path, options.body)) {
    applyApiMutation(path, options.body, payload.data);
  }
};
