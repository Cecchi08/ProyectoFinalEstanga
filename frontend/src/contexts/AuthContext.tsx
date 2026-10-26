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
import { api } from "../services/api";
import type { Access, Me, Permission, Role, Session, User } from "../types/api";
import { can as allows } from "../types/api";
interface Auth {
  user: User | null;
  roles: Role[];
  permissions: Permission[];
  loading: boolean;
  error: string;
  // GET /auth/me: login and refresh return the profiles but not the permissions,
  // so screens wait for this before deciding what to show.
  accessLoading: boolean;
  accessError: string;
  can(...codes: Permission[]): boolean;
  reloadAccess(): Promise<void>;
  // Replaces the known profiles and permissions with what a write already returned
  // (POST /me/profiles answers with the rebuilt access).
  applyAccess(access: Access): void;
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
  const sequence = useRef(0);
  const userId = session?.user.id ?? null;
  // silent: refresh in the background without unmounting guarded screens; a failure keeps the known access.
  const loadAccess = useCallback(async (silent = false) => {
    // A silent reload does not supersede a visible one in flight; both stop applying once the user changes.
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
    void loadAccess();
    return () => {
      sequence.current++;
    };
  }, [loadAccess]);
  // Profiles change on the server (an ADMIN grants or revokes one): permissions are read again when the
  // app comes back to the foreground and after a 403, at most once every few seconds.
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
    return () => {
      api.onForbidden = () => {};
      subscription.remove();
    };
  }, [userId, loadAccess]);
  const permissions = access?.permissions ?? [];
  return (
    <Context.Provider
      value={{
        user: session?.user ?? null,
        // /auth/me is authoritative: a profile granted after login shows up on the next load.
        roles: access?.roles ?? session?.roles ?? [],
        permissions,
        loading,
        error,
        accessLoading,
        accessError,
        can: (...codes) => allows(permissions, codes),
        reloadAccess: () => loadAccess(),
        applyAccess: (next) => {
          sequence.current++;
          setAccess({ roles: next.roles, permissions: next.permissions ?? [] });
          setAccessError("");
          setAccessLoading(false);
        },
        login: async (email, password) => {
          const result = await api.request<Session>("/auth/login", {
            method: "POST",
            body: { email, password },
            auth: false,
          });
          await api.accept(result.data);
          setError("");
        },
        accept: (session) => api.accept(session),
        logout: () => api.logout(),
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
