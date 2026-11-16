import { HttpClient, normalizeApiBase } from "./http";
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
