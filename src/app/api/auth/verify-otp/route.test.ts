import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));

let emailSeq = 0;
const freshEmail = () => `host${++emailSeq}@example.com`;

const verify = async (email: string, ip = uniqueIp()) =>
  readJson(await POST(makeRequest("/api/auth/verify-otp", { body: { email, password: "pw", otp: "000000" }, ip })));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
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
