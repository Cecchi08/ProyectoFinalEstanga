import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
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
  const loadAccess = useCallback(async () => {
    const request = ++sequence.current;
    if (!userId) {
      setAccess(null);
      setAccessLoading(false);
      setAccessError("");
      return;
    }
    setAccessLoading(true);
    setAccessError("");
    try {
      const { data } = await api.request<Me>("/auth/me");
      if (request === sequence.current)
        setAccess({ roles: data.roles, permissions: data.permissions ?? [] });
    } catch (e) {
      if (request === sequence.current) {
        setAccess(null);
        setAccessError(
          e instanceof Error
            ? e.message
            : "No se pudieron cargar tus permisos.",
        );
      }
    } finally {
      if (request === sequence.current) setAccessLoading(false);
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
        reloadAccess: loadAccess,
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
