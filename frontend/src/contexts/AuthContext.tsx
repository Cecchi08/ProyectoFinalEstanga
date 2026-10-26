import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { api } from "../services/api";
import type { Me, Role, Session, User } from "../types/api";
interface Auth {
  user: User | null;
  roles: Role[];
  // From GET /auth/me: what the API will actually allow. Empty until accessLoading is false.
  permissions: string[];
  accessLoading: boolean;
  accessError: string;
  // Reload roles/permissions after a profile change (self-service or admin on oneself).
  refreshAccess(): void;
  loading: boolean;
  error: string;
  login(email: string, password: string): Promise<void>;
  accept(session: Session): Promise<void>;
  logout(): Promise<void>;
}
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Tied to the user it was loaded for, so a stale answer never authorizes another account.
  const [access, setAccess] = useState<{ userId: string; roles: Role[]; permissions: string[] } | null>(null);
  const [accessError, setAccessError] = useState("");
  const [revision, setRevision] = useState(0);
  const userId = session?.user.id ?? null;
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
    if (!userId) {
      setAccess(null);
      setAccessError("");
      return;
    }
    let current = true;
    setAccessError("");
    api
      .request<Me>("/auth/me")
      .then(({ data }) => {
        if (current && data.user.id === userId)
          setAccess({ userId, roles: data.roles, permissions: data.permissions });
      })
      .catch((e: unknown) => {
        if (current) setAccessError(e instanceof Error ? e.message : "No se pudieron cargar tus permisos.");
      });
    return () => {
      current = false;
    };
  }, [userId, revision]);
  const loaded = access !== null && access.userId === userId;
  const refreshAccess = useCallback(() => {
    setAccess(null);
    setRevision((value) => value + 1);
  }, []);
  return (
    <Context.Provider
      value={{
        user: session?.user ?? null,
        roles: loaded ? access.roles : [],
        permissions: loaded ? access.permissions : [],
        accessLoading: Boolean(userId) && !loaded && !accessError,
        accessError,
        refreshAccess,
        loading,
        error,
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
