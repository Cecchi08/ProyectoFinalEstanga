import { AppState, Platform } from "react-native";
import { configureSyncEnvironment, syncNow } from "./syncEngine";

let installed = false;

// Registra una única vez los listeners de primer plano, visibilidad web y conectividad.
export function ensureSyncLifecycle(): void {
  if (installed) return;
  installed = true;

  configureSyncEnvironment(() => {
    if (AppState.currentState && AppState.currentState !== "active") return false;
    if (Platform.OS === "web" && typeof document !== "undefined" && document.visibilityState === "hidden") {
      return false;
    }
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false) {
      return false;
    }
    return true;
  });

  AppState.addEventListener("change", (state) => {
    if (state === "active") void syncNow({ force: true });
    else configureSyncEnvironment(() => AppState.currentState === "active" && isWebVisibleAndOnline());
  });

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const onActive = () => void syncNow({ force: true });
    window.addEventListener("focus", onActive);
    window.addEventListener("online", onActive);
    window.addEventListener("offline", () => {
      // Actualiza el estado de sondeo cuando se pierde la red.
      void syncNow();
    });
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void syncNow({ force: true });
      });
    }
  }
}

function isWebVisibleAndOnline(): boolean {
  if (Platform.OS !== "web") return true;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return true;
}
