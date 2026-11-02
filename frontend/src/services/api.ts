import { HttpClient, normalizeApiBase } from "./http";
import { storage } from "./storage";
export const api = new HttpClient(
  normalizeApiBase(
    process.env.EXPO_PUBLIC_API_URL,
    "http://localhost:3000",
    typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "",
  ),
  storage,
);
