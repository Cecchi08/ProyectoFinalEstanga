import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { api } from "../../services/api";
import { storage } from "../../services/storage";
import type { Session } from "../../types/api";
const key = "venti.oauth.verifier";
const pending = new Map<string, Promise<Session>>();
export async function finishOAuth(code: string): Promise<Session> {
  const existing = pending.get(code);
  if (existing) return existing;
  const request = (async () => {
    const verifier =
      Platform.OS === "web"
        ? sessionStorage.getItem(key)
        : await storage.get(key);
    if (!verifier)
      throw new Error("El inicio OAuth venció. Volvé a intentarlo.");
    const { data } = await api.request<Session>("/auth/oauth/exchange", {
      method: "POST",
      body: { code, codeVerifier: verifier },
      auth: false,
    });
    if (Platform.OS === "web") sessionStorage.removeItem(key);
    else await storage.remove(key);
    await api.accept(data);
    return data;
  })();
  pending.set(code, request);
  void request
    .finally(() => {
      setTimeout(() => pending.delete(code), 60000);
    })
    .catch(() => {});
  return request;
}
export async function startOAuth(provider: "google" | "github" | "facebook") {
  const verifier = Array.from(await Crypto.getRandomBytesAsync(32), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const challenge = (
    await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 },
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (Platform.OS === "web") sessionStorage.setItem(key, verifier);
  else await storage.set(key, verifier);
  const url = `${api.base}/auth/oauth/${provider}?mode=${Platform.OS === "web" ? "web" : "mobile"}&codeChallenge=${challenge}`;
  if (Platform.OS === "web") {
    window.location.assign(url);
    return;
  }
  const result = await WebBrowser.openAuthSessionAsync(
    url,
    "venti://oauth-callback",
  );
  if (result.type !== "success") throw new Error("Inicio OAuth cancelado.");
  const code = new URL(result.url).searchParams.get("code");
  if (!code) throw new Error("No se recibió el código OAuth.");
  await finishOAuth(code);
}
