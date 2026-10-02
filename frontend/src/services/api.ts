import { HttpClient } from "./http";
import { storage } from "./storage";
export const api = new HttpClient(
  (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  ),
  storage,
);
