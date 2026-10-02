import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { api } from "../services/api";
import type { Role, Session, User } from "../types/api";
interface Auth {
  user: User | null;
  roles: Role[];
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
  return (
    <Context.Provider
      value={{
        user: session?.user ?? null,
        roles: session?.roles ?? [],
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
