import type { Envelope, Session } from "../types/api";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export interface TokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const statusMessage = (status: number) => {
  if (status >= 500) return "VENTI no está disponible en este momento. Intentá nuevamente más tarde.";
  const messages: Record<number, string> = {
    400: "No pudimos procesar la solicitud. Revisá los datos.",
    401: "Iniciá sesión nuevamente.",
    403: "No tenés permiso para realizar esta acción.",
    404: "No encontramos el recurso solicitado.",
    409: "El estado cambió. Actualizá la pantalla antes de continuar.",
    422: "Revisá los campos y sus formatos antes de continuar.",
    429: "Demasiadas solicitudes. Esperá unos minutos antes de reintentar.",
  };
  return messages[status] ?? "No se pudo completar la operación.";
};
export class HttpClient {
  private session: Session | null = null;
  private refreshFlight: Promise<Session> | null = null;
  private revision = 0;
  private writes: Promise<void> = Promise.resolve();
  onSession: (session: Session | null) => void = () => {};
  constructor(
    readonly base: string,
    private storage: TokenStorage,
    private transport: typeof fetch = (...args) => fetch(...args),
  ) {}
  private persist(refreshToken: string | null) {
    this.writes = this.writes
      .catch(() => {})
      .then(() =>
        refreshToken
          ? this.storage.set("venti.refresh", refreshToken)
          : this.storage.remove("venti.refresh"),
      );
    return this.writes;
  }
  async accept(session: Session) {
    const revision = ++this.revision;
    try {
      await this.persist(session.refreshToken);
    } catch (error) {
      if (revision === this.revision) await this.clear().catch(() => {});
      throw error;
    }
    if (revision !== this.revision) return;
    this.session = session;
    this.onSession(session);
  }
  async clear() {
    this.revision++;
    this.session = null;
    this.onSession(null);
    await this.persist(null);
  }
  async restore() {
    const token = await this.storage.get("venti.refresh");
    if (token) await this.refresh(token);
  }
  private refresh(token?: string): Promise<Session> {
    if (this.refreshFlight) return this.refreshFlight;
    const revision = this.revision;
    const refreshToken = token ?? this.session?.refreshToken;
    const flight = (async () => {
      try {
        if (!refreshToken)
          throw new ApiError(
            "SESSION_EXPIRED",
            "Iniciá sesión nuevamente.",
            401,
          );
        const response = await this.request<Session>("/auth/refresh", {
          method: "POST",
          body: { refreshToken },
          auth: false,
        });
        if (revision !== this.revision)
          throw new ApiError("SESSION_CHANGED", "La sesión cambió.", 401);
        await this.accept(response.data);
        return response.data;
      } catch (error) {
        if (revision === this.revision) await this.clear();
        throw error;
      }
    })();
    this.refreshFlight = flight;
    void flight
      .finally(() => {
        if (this.refreshFlight === flight) this.refreshFlight = null;
      })
      .catch(() => {});
    return flight;
  }
  async logout() {
    const token = this.session?.refreshToken;
    await this.clear();
    if (token)
      await this.request("/auth/logout", {
        method: "POST",
        body: { refreshToken: token },
        auth: false,
      });
  }
  async request<T>(
    path: string,
    options: { method?: string; body?: unknown; auth?: boolean } = {},
    retry = true,
  ): Promise<Envelope<T>> {
    const token =
      options.auth === false ? undefined : this.session?.accessToken;
    const userId = this.session?.user.id;
    let response: Response;
    try {
      response = await this.transport(this.base + path, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError(
        "NETWORK_ERROR",
        "No pudimos conectar con VENTI. Revisá tu conexión.",
      );
    }
    if (response.status === 401 && token && retry) {
      if (this.session?.user.id !== userId)
        throw new ApiError(
          "SESSION_CHANGED",
          "La sesión cambió. Volvé a intentar.",
          401,
        );
      if (this.session?.accessToken === token) await this.refresh();
      if (!this.session)
        throw new ApiError("SESSION_EXPIRED", "Iniciá sesión nuevamente.", 401);
      return this.request(path, options, false);
    }
    if (response.status === 204) return { success: true, data: undefined as T };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(
        "INVALID_RESPONSE",
        response.ok ? "Respuesta inesperada del servidor. Intentá nuevamente." : statusMessage(response.status),
        response.status,
      );
    }
    if (!response.ok) {
      const error = record(payload) && record(payload.error) ? payload.error : {};
      throw new ApiError(
        typeof error.code === "string" ? error.code : "API_ERROR",
        response.status >= 500 || error.code === "INTERNAL_ERROR" ||
        (response.status === 422 && error.code === "VALIDATION_ERROR") || typeof error.message !== "string"
          ? statusMessage(response.status)
          : error.message,
        response.status,
      );
    }
    if (!record(payload) || payload.success !== true || !("data" in payload) || payload.data === null)
      throw new ApiError("INVALID_RESPONSE", "Respuesta inesperada del servidor. Intentá nuevamente.", response.status);
    return payload as unknown as Envelope<T>;
  }
}
export const query = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return params.toString() ? `?${params}` : "";
};
