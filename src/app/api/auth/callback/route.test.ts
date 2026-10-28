import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { makeRequest } from "../../../../../test/helpers/request";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  notifyAdminsNewHostRegistration: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: () => Promise.resolve({ error: null }),
      getUser: h.getUser,
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("@/lib/notifications", () => ({
  notifyAdminsNewHostRegistration: h.notifyAdminsNewHostRegistration,
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));

/**
 * A first-time email verification: not an admin, no host row yet, and the
 * insert succeeds. Returns what was written to `hosts`.
 */
const verify = async (metadata: Record<string, unknown>) => {
  h.getUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "somchai@example.com", user_metadata: { name: "Somchai", ...metadata } } },
  });
  const db = createSupabaseMock({ tables: { platform_admins: {}, hosts: [{}, {}] } });
  h.createServiceRoleClient.mockReturnValue(db);

  await GET(makeRequest("/api/auth/callback", { method: "GET", searchParams: { code: "pkce-code" } }));
  await Promise.all(h.afterCallbacks.map((cb) => cb()));

  return (db.builderFor("hosts", 1).insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
};

beforeEach(() => {
  h.afterCallbacks.length = 0;
  h.notifyAdminsNewHostRegistration.mockResolvedValue(undefined);
});

describe("GET /api/auth/callback, creating the host", () => {
  it("stores the phone given at registration and sends it to the admins", async () => {
    const inserted = await verify({ phone: "0812345678" });

    expect(inserted).toMatchObject({ phone: "0812345678" });
    expect(h.notifyAdminsNewHostRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ hostPhone: "0812345678" }),
    );
  });

  // signUp can be called straight from the browser with the public anon key,
  // so the metadata is whatever the caller sent, not what /register validated.
  it.each([
    ["markup", "<b>x</b>"],
    ["an array that stringifies to a valid number", ["0812345678"]],
    ["missing", undefined],
  ])("stores no phone when the metadata phone is %s", async (_, phone) => {
    const inserted = await verify({ phone });

    expect(inserted).toMatchObject({ phone: null });
    expect(h.notifyAdminsNewHostRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ hostPhone: null }),
    );
  });
});
