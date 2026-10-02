import { createContext, useContext, type PropsWithChildren } from "react";
import { useResource } from "../hooks/useResource";
import { api } from "../services/api";
import { useAction } from "../components/ui";

interface Preferences {
  recommendations_enabled: boolean;
}
interface PreferencesState {
  enabled: boolean | null;
  loading: boolean;
  saving: boolean;
  error: string;
  reload(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
}
const Context = createContext<PreferencesState | null>(null);
export function PreferencesProvider({ children }: PropsWithChildren) {
  const resource = useResource<Preferences>("/preferences");
  const action = useAction();
  return (
    <Context.Provider
      value={{
        enabled: resource.result?.data.recommendations_enabled ?? null,
        loading: resource.loading,
        saving: action.busy,
        error: resource.error || action.error,
        reload: resource.reload,
        setEnabled: (enabled) =>
          action.run(async () => {
            await api.request<Preferences>("/preferences", {
              method: "PATCH",
              body: { recommendations_enabled: enabled },
            });
            await resource.reload();
          }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("PreferencesProvider requerido");
  return value;
}
