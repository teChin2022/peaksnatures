import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

const h = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn(), verifyTurnstileToken: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: h.signInWithPassword, signOut: h.signOut } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(), createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: h.verifyTurnstileToken }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));

const send = async () =>
  readJson(
    await POST(
      makeRequest("/api/auth/send-otp", { body: { email: "host@example.com", password: "pw", turnstileToken: "t" }, ip: uniqueIp() }),
    ),
  );

beforeEach(() => {
  h.verifyTurnstileToken.mockResolvedValue("pass");
  h.signOut.mockReset().mockResolvedValue({ error: null });
});

// F-19: Supabase's own message used to go back as-is (and in English to Thai
// users). One code for "wrong email or password", whichever it was.
describe("POST /api/auth/send-otp: a refused sign-in", () => {
  it.each(["Invalid login credentials", "User not found", "Some other auth failure"])(
    "answers INVALID_CREDENTIALS for %j",
    async (message) => {
      h.signInWithPassword.mockResolvedValue({ data: null, error: { message } });
      await expect(send()).resolves.toEqual({ status: 401, body: { error: "INVALID_CREDENTIALS" } });
    },
  );

  // Supabase says this only when the password was right, so it reveals nothing new.
  it("says when the email is not confirmed yet", async () => {
    h.signInWithPassword.mockResolvedValue({ data: null, error: { message: "Email not confirmed" } });
    await expect(send()).resolves.toEqual({ status: 401, body: { error: "EMAIL_NOT_CONFIRMED" } });
  });
});

// The OTP opt-out is the owner's. It used to be read by hosts.email, which the
// owner can edit and set to a staff login's address (migration 081), letting
// that staff login skip the code. Now it is read by the login's own user id.
describe("POST /api/auth/send-otp: who may skip the login code", () => {
  function service(hostRow: unknown) {
    const sc = createSupabaseMock({ tables: { hosts: { data: hostRow }, login_otps: {} } });
    vi.mocked(createServiceRoleClient).mockReturnValue(sc as never);
    return sc;
  }

  beforeEach(() => {
    h.signInWithPassword.mockResolvedValue({ data: { user: { id: "login-1" } }, error: null });
  });

  it("reads the setting by the login's user id, never by email", async () => {
    const sc = service(null);
    await send();
    expect(sc.builderFor("hosts").eq).toHaveBeenCalledWith("user_id", "login-1");
    expect(sc.builderFor("hosts").eq).not.toHaveBeenCalledWith("email", expect.anything());
  });

  it("asks a login with no hosts row (a staff login) for the code", async () => {
    service(null);
    await expect(send()).resolves.toEqual({ status: 200, body: { success: true, otpRequired: true } });
  });

  it("lets an owner who turned the code off straight in", async () => {
    service({ require_otp: false });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { signInWithPassword: vi.fn(async () => ({ error: null })) },
    } as never);
    await expect(send()).resolves.toEqual({ status: 200, body: { success: true, otpRequired: false } });
  });
});

// The password check signs in on a throwaway client and then signs it out.
// signOut() defaults to the global scope, which revokes every session the
// user has: each login attempt signed them out on their other devices (and
// could race the session it was about to create).
describe("POST /api/auth/send-otp: ending the throwaway sign-in", () => {
  beforeEach(() => {
    h.signInWithPassword.mockResolvedValue({ data: { user: { id: "login-1" } }, error: null });
    vi.mocked(createServiceRoleClient).mockReturnValue(
      createSupabaseMock({ tables: { hosts: { data: null }, login_otps: {} } }) as never,
    );
  });

  it("ends only that one session", async () => {
    await send();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
