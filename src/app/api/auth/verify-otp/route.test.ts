import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
  logEvent: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("@/lib/admin", () => ({ isAdmin: h.isAdmin }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));

let emailSeq = 0;
const freshEmail = () => `host${++emailSeq}@example.com`;

const verify = async (email: string, ip = uniqueIp()) =>
  readJson(await POST(makeRequest("/api/auth/verify-otp", { body: { email, password: "pw", otp: "000000" }, ip })));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockReset().mockResolvedValue(undefined);
  h.isAdmin.mockReset().mockResolvedValue(false);
  // No OTP row matches: every try is a wrong code.
  h.createServiceRoleClient.mockReturnValue(createSupabaseMock({ tables: { login_otps: { data: null } } }));
});

describe("POST /api/auth/verify-otp: guessing the code", () => {
  // F-11: there was no limit at all, so a 6-digit code could be walked.
  it("stops a sixth try at one email's code, even from new addresses each time", async () => {
    const email = freshEmail();

    for (let i = 0; i < 5; i++) {
      expect((await verify(email)).status).toBe(401);
    }
    expect((await verify(email)).status).toBe(429);
  });

  it("treats the email the same whatever its case or spaces", async () => {
    const email = freshEmail();

    for (let i = 0; i < 5; i++) await verify(email);

    expect((await verify(` ${email.toUpperCase()} `)).status).toBe(429);
  });

  it("does not let one email's lockout touch another's", async () => {
    const locked = freshEmail();
    for (let i = 0; i < 6; i++) await verify(locked);

    expect((await verify(freshEmail())).status).toBe(401);
  });

  it("stops one address trying many emails", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 20; i++) {
      expect((await verify(freshEmail(), ip)).status).toBe(401);
    }
    expect((await verify(freshEmail(), ip)).status).toBe(429);
  });
});

describe("POST /api/auth/verify-otp: a refused sign-in after a right code", () => {
  it("answers INVALID_CREDENTIALS, not Supabase's own message", async () => {
    h.createServiceRoleClient.mockReturnValue(
      createSupabaseMock({ tables: { login_otps: { data: { id: "otp-1", expires_at: "2999-01-01T00:00:00Z" } } } }),
    );
    h.createServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword: vi.fn(async () => ({ error: { message: "Invalid login credentials" } })) },
    });

    await expect(verify(freshEmail())).resolves.toEqual({ status: 401, body: { error: "INVALID_CREDENTIALS" } });
  });
});

describe("POST /api/auth/verify-otp: the login audit entry", () => {
  const signedIn = (access: { host?: unknown; staff?: unknown; admin: boolean }) => {
    h.createServiceRoleClient.mockReturnValue(
      createSupabaseMock({
        tables: {
          login_otps: [{ data: { id: "otp-1", expires_at: "2999-01-01T00:00:00Z" } }, {}],
          hosts: { data: access.host ?? null },
          host_staff: { data: access.staff ?? null },
        },
      }),
    );
    h.createServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword: vi.fn(async () => ({ data: { user: { id: "user-9" } }, error: null })) },
    });
    h.isAdmin.mockResolvedValue(access.admin);
  };
  const loggedEvents = async () => {
    for (const cb of h.afterCallbacks.splice(0)) await cb();
    return h.logEvent.mock.calls.map(([p]) => (p as { eventType: string }).eventType);
  };

  it("records HOST_LOGIN for a host owner", async () => {
    signedIn({ host: { id: "host-1" }, admin: false });
    expect((await verify(freshEmail())).status).toBe(200);
    expect(await loggedEvents()).toEqual(["HOST_LOGIN"]);
  });

  it("records HOST_LOGIN for a staff login", async () => {
    signedIn({ staff: { host_id: "host-1" }, admin: false });
    await verify(freshEmail());
    expect(await loggedEvents()).toEqual(["HOST_LOGIN"]);
  });

  // The admin sign-in used to read as a host login in the audit trail;
  // /api/admin/auth/verify records ADMIN_LOGIN for it instead.
  it("records no HOST_LOGIN for a platform admin who is not a host", async () => {
    signedIn({ admin: true });
    expect((await verify(freshEmail())).status).toBe(200);
    expect(await loggedEvents()).toEqual([]);
  });

  it("still records HOST_LOGIN for an admin who also owns a host", async () => {
    signedIn({ host: { id: "host-1" }, admin: true });
    await verify(freshEmail());
    expect(await loggedEvents()).toEqual(["HOST_LOGIN"]);
  });
});
