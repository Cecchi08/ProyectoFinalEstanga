import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HttpClient,
  ApiError,
  query,
  type TokenStorage,
} from "../src/services/http";
import { hasRoles, type Session } from "../src/types/api";
import { scanMessage } from "../src/features/staff/validation";
test('storage failure during rotation also logs the user out', async () => {
  let failWrites = false;
  const {storage, values} = memory();
  const client = new HttpClient('', {...storage, set: async (key, value) => {
    if (failWrites) throw new Error('Storage unavailable');
    await storage.set(key, value);
  }}, async url => String(url).endsWith('/refresh') ? response({...session, accessToken:'rotated'}) : response({code:'EXPIRED'},401));
  await client.accept(session); failWrites = true;
  let cleared = false; client.onSession = value => {cleared = value === null;};
  await assert.rejects(client.request('/tickets'));
  assert.equal(cleared, true); assert.equal(values.size,0);
});
const session: Session = {
  user: {
    id: "1",
    first_name: "Ana",
    last_name: "Pérez",
    email: "ana@example.com",
    email_verified_at: null,
  },
  roles: ["USER", "STAFF"],
  accessToken: "old",
  refreshToken: "refresh",
  expiresIn: 900,
};
const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(
      status >= 400 ? { success: false, error: data } : { success: true, data },
    ),
    { status, headers: { "Content-Type": "application/json" } },
  );
function memory() {
  const values = new Map<string, string>();
  const storage: TokenStorage = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
  return { values, storage };
}
test("concurrent expired requests share one refresh, retry with rotated bearer, persist only refresh", async () => {
  const { storage, values } = memory();
  let refreshes = 0;
  const headers: string[] = [];
  const client = new HttpClient("http://api", storage, async (url, init) => {
    if (String(url).endsWith("/auth/refresh")) {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return response({
        ...session,
        accessToken: "new",
        refreshToken: "rotated",
      });
    }
    const bearer = new Headers(init?.headers).get("Authorization") ?? "";
    headers.push(bearer);
    return bearer === "Bearer new"
      ? response(["concert"])
      : response({ code: "EXPIRED", message: "Expired" }, 401);
  });
  await client.accept(session);
  const result = await Promise.all(
    Array.from({ length: 8 }, () => client.request("/concerts")),
  );
  assert.equal(refreshes, 1);
  assert.equal(result.length, 8);
  assert.equal(values.get("venti.refresh"), "rotated");
  assert.equal(values.size, 1);
  assert.equal(headers.filter((h) => h === "Bearer new").length, 8);
});
test("refresh failure clears storage and auth once", async () => {
  const { storage, values } = memory();
  const client = new HttpClient("", storage, async () =>
    response({ code: "REVOKED", message: "Venció la sesión" }, 401),
  );
  await client.accept(session);
  let cleared = 0;
  client.onSession = (next) => {
    if (!next) cleared++;
  };
  await assert.rejects(client.request("/tickets"), ApiError);
  assert.equal(values.size, 0);
  assert.equal(cleared, 1);
});
test("restore rotates persisted refresh and rebuilds roles/user", async () => {
  const { storage } = memory();
  await storage.set("venti.refresh", "saved");
  const client = new HttpClient("", storage, async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { refreshToken: "saved" });
    return response(session);
  });
  let restored: Session | null = null;
  client.onSession = (value) => {
    restored = value;
  };
  await client.restore();
  assert.deepEqual(restored, session);
});
test("login 401 does not attempt refresh", async () => {
  const { storage } = memory();
  let calls = 0;
  const client = new HttpClient("", storage, async () => {
    calls++;
    return response(
      { code: "INVALID_CREDENTIALS", message: "Credenciales inválidas" },
      401,
    );
  });
  await assert.rejects(
    client.request("/auth/login", { auth: false, method: "POST", body: {} }),
    { code: "INVALID_CREDENTIALS" },
  );
  assert.equal(calls, 1);
});
test("logout removes local session even when network fails", async () => {
  const { storage, values } = memory();
  const client = new HttpClient("", storage, async () => {
    throw new Error("offline");
  });
  await client.accept(session);
  await assert.rejects(client.logout(), { code: "NETWORK_ERROR" });
  assert.equal(values.size, 0);
});
test("logout during refresh cannot resurrect session", async () => {
  const { storage, values } = memory();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = new HttpClient("", storage, async (url) => {
    if (String(url).endsWith("/refresh")) {
      await gate;
      return response({ ...session, accessToken: "new" });
    }
    if (String(url).endsWith("/logout")) return response({});
    return response({ code: "EXPIRED" }, 401);
  });
  await client.accept(session);
  const pending = client.request("/tickets");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await client.logout();
  release();
  await assert.rejects(pending);
  assert.equal(values.size, 0);
});
test("204, network errors and query encoding", async () => {
  const { storage } = memory();
  const client = new HttpClient(
    "",
    storage,
    async () => new Response(null, { status: 204 }),
  );
  assert.equal(
    (await client.request("/genres/1", { method: "DELETE" })).data,
    undefined,
  );
  assert.equal(
    query({ q: "rock & pop", page: 2, empty: "" }),
    "?q=rock+%26+pop&page=2",
  );
});
test("multi-role access uses membership, admin and ordinary user stay distinct", () => {
  assert.equal(hasRoles(["USER", "STAFF"], ["STAFF", "ADMIN"]), true);
  assert.equal(hasRoles(["USER", "ORGANIZER"], ["ORGANIZER", "ADMIN"]), true);
  assert.equal(hasRoles(["USER"], ["ADMIN"]), false);
  assert.equal(hasRoles([], ["USER"]), false);
});
test("scanner has separate human-readable results for every backend outcome", () => {
  const codes = [
    "VALID",
    "ALREADY_USED",
    "INVALID",
    "WRONG_CONCERT",
    "STAFF_NOT_ASSIGNED",
    "FORBIDDEN",
    "CANCELLED",
    "VALIDATION_ERROR",
  ];
  assert.equal(new Set(codes.map(scanMessage)).size, codes.length);
});
