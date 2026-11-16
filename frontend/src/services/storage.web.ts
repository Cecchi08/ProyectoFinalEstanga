// Abstracción única de almacenamiento; nunca se guardan tokens en URLs. En web usa localStorage del mismo origen.
export const storage = {
  async get(key: string): Promise<string | null> {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(key);
  },
  async set(key: string, value: string): Promise<void> {
    window.localStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(key);
  },
};
