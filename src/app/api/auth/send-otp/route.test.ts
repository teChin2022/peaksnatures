import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

const h = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn(), verifyTurnstileToken: vi.fn(), sendMail: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: h.signInWithPassword, signOut: h.signOut } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(), createServiceRoleClient: vi.fn() }));
vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send: h.sendMail } };
  }),
}));
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

// Thai is the default language, but the login code used to go out in English
// whatever the user had chosen. It follows the `locale` cookie, like the magic link.
describe("POST /api/auth/send-otp: the code email's language", () => {
  const sent = () => h.sendMail.mock.calls[0][0] as { subject: string; html: string };
  const sendWithCookie = (cookie?: string) =>
    POST(
      makeRequest("/api/auth/send-otp", {
        body: { email: "host@example.com", password: "pw", turnstileToken: "t" },
        headers: cookie ? { cookie } : {},
        ip: uniqueIp(),
      }),
    );

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    h.sendMail.mockReset().mockResolvedValue({ data: {}, error: null });
    h.signInWithPassword.mockResolvedValue({ data: { user: { id: "login-1" } }, error: null });
    vi.mocked(createServiceRoleClient).mockReturnValue(
      createSupabaseMock({ tables: { hosts: { data: null }, login_otps: {} } }) as never,
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is in Thai by default, with the code and its 5-minute life", async () => {
    await sendWithCookie();
    expect(sent().subject).toBe("รหัสเข้าสู่ระบบ Peaksnature");
    expect(sent().html).toContain("5 นาที");
    expect(sent().html).toMatch(/>\d{6}</);
    expect(sent().html).not.toContain("verification code");
  });

  it("uses the brand Forest for its header, not Tailwind green", async () => {
    await sendWithCookie();
    expect(sent().html).toContain("background: #2F5D50");
    expect(sent().html).not.toContain("#166534");
  });

  it("is in English when the locale cookie says so", async () => {
    await sendWithCookie("locale=en");
    expect(sent().subject).toBe("Your Peaksnature Login Code");
    expect(sent().html).toContain("5 minutes");
  });

  // /admin is English-only; its login sent a Thai code email to an English page.
  it("is in English for an admin login, whatever the locale cookie says", async () => {
    await POST(
      makeRequest("/api/auth/send-otp", {
        body: { email: "admin@example.com", password: "pw", turnstileToken: "t", source: "admin" },
        headers: { cookie: "locale=th" },
        ip: uniqueIp(),
      }),
    );
    expect(sent().subject).toBe("Your Peaksnature Login Code");
    expect(sent().html).not.toContain("นาที");
  });
});
