import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({ signInWithPassword: vi.fn(), verifyTurnstileToken: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: h.signInWithPassword, signOut: vi.fn(async () => ({})) } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(), createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: h.verifyTurnstileToken }));

const send = async () =>
  readJson(
    await POST(
      makeRequest("/api/auth/send-otp", { body: { email: "host@example.com", password: "pw", turnstileToken: "t" }, ip: uniqueIp() }),
    ),
  );

beforeEach(() => {
  h.verifyTurnstileToken.mockResolvedValue("pass");
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
