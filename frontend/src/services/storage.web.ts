// A single abstraction; no tokens in URLs. Web storage is accessible to same-origin JS.
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
