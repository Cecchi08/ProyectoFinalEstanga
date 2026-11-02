import { HttpClient, normalizeApiBase } from "./http";
import { storage } from "./storage";
const browserHost =
  typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
export const api = new HttpClient(
  normalizeApiBase(
    process.env.EXPO_PUBLIC_API_URL,
    /vercel\.app$/i.test(browserHost) ? `${window.location.origin}/api` : "http://localhost:3000",
    browserHost,
  ),
  storage,
);
