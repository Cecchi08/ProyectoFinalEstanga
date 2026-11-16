import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { invalidateCatalogCache } from "../hooks/useResource";
import { api } from "../services/api";
import { clearResourceStore } from "../services/resourceStore";
import type { Access, Me, Permission, Role, Session, User } from "../types/api";
import { can as allows, resolveActiveRole } from "../types/api";
interface Auth {
  user: User | null;
  roles: Role[];
  activeRole: Role;
  setActiveRole(role: Role): void;
  permissions: Permission[];
  loading: boolean;
  error: string;
  // GET /auth/me: login y refresh devuelven perfiles pero no permisos,
  // por lo que las pantallas esperan esta carga antes de decidir qué mostrar.
  accessLoading: boolean;
  accessError: string;
  can(...codes: Permission[]): boolean;
  reloadAccess(): Promise<void>;
  // Reemplaza los perfiles y permisos conocidos con la respuesta directa de una escritura
  // (POST /me/profiles devuelve el acceso reconstruido).
  applyAccess: (access: Access) => void;
  login(email: string, password: string): Promise<void>;
  accept(session: Session): Promise<void>;
  logout(): Promise<void>;
}
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [access, setAccess] = useState<Access | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [preferredRole, setPreferredRole] = useState<Role | null>(null);
  const sequence = useRef(0);
  const userId = session?.user.id ?? null;
  // silent: refresca permisos en segundo plano sin desmontar pantallas protegidas; si falla conserva los actuales.
  const loadAccess = useCallback(async (silent = false) => {
    // Una recarga silenciosa no pisa una visible en curso; ambas dejan de aplicarse si cambia el usuario.
    const request = silent ? sequence.current : ++sequence.current;
    if (!userId) {
      setAccess(null);
      setAccessLoading(false);
      setAccessError("");
      return;
    }
    if (!silent) {
      setAccessLoading(true);
      setAccessError("");
    }
    try {
      const { data } = await api.request<Me>("/auth/me");
      if (request === sequence.current)
        setAccess({ roles: data.roles, permissions: data.permissions ?? [] });
    } catch (e) {
      if (request === sequence.current && !silent) {
        setAccess(null);
        setAccessError(
          e instanceof Error
            ? e.message
            : "No se pudieron cargar tus permisos.",
        );
      }
    } finally {
      if (request === sequence.current && !silent) setAccessLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    api.onSession = setSession;
    api
      .restore()
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : "No se pudo restaurar la sesión.",
        ),
      )
      .finally(() => setLoading(false));
    return () => {
      api.onSession = () => {};
    };
  }, []);
  useEffect(() => {
    setPreferredRole(null);
    void loadAccess();
    return () => {
      sequence.current++;
    };
  }, [loadAccess]);
  // Los perfiles pueden cambiar en el servidor (un ADMIN otorga o revoca uno): se vuelven a leer al volver
  // al primer plano, tras un 403 y cada minuto mientras la app esté activa (con un mínimo de 5s entre lecturas).
  const lastReload = useRef(0);
  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      if (Date.now() - lastReload.current < 5000) return;
      lastReload.current = Date.now();
      void loadAccess(true);
    };
    api.onForbidden = refresh;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    const timer = setInterval(() => { if (AppState.currentState === "active") refresh(); }, 60000);
    return () => {
      api.onForbidden = () => {};
      subscription.remove();
      clearInterval(timer);
    };
  }, [userId, loadAccess]);
  const roles = access?.roles ?? session?.roles ?? [];
  const activeRole: Role = resolveActiveRole(roles, preferredRole);
  const permissions = access?.permissions ?? [];
  return (
    <Context.Provider
      value={{
        user: session?.user ?? null,
        // /auth/me is authoritative: a profile granted after login shows up on the next load.
        roles,
        activeRole,
        setActiveRole: (nextRole) => {
          if (roles.includes(nextRole)) {
            setPreferredRole(nextRole);
          }
        },
        permissions,
        loading,
        error,
        accessLoading,
        accessError,
        // Evalúa si el usuario posee alguno de los códigos de permiso indicados.
        can: (...codes) => allows(permissions, codes),
        reloadAccess: () => loadAccess(),
        // Actualiza roles y permisos en memoria tras una escritura sin reconsultar /auth/me.
        applyAccess: (next) => {
          sequence.current++;
          setAccess({ roles: next.roles, permissions: next.permissions ?? [] });
          setAccessError("");
          setAccessLoading(false);
        },
        // Autentica con email/contraseña y persiste la sesión devuelta por el backend.
        login: async (email, password) => {
          const result = await api.request<Session>("/auth/login", {
            method: "POST",
            body: { email, password },
            auth: false,
          });
          await api.accept(result.data);
          setError("");
        },
        // Acepta una sesión ya emitida (por ejemplo, tras OAuth o registro).
        accept: (session) => api.accept(session),
        // Limpia caché de catálogos, store reactivo y revoca/elimina la sesión local.
        logout: async () => {
          invalidateCatalogCache();
          clearResourceStore();
          await api.logout();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider requerido");
  return value;
}
