import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  signUp: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { signUp: h.signUp } }),
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: h.verifyTurnstileToken }));

const body = (over: Record<string, unknown> = {}) => ({
  name: "Somchai",
  email: "somchai@example.com",
  phone: "0812345678",
  password: "Secret_1",
  turnstileToken: "token",
  ...over,
});

const register = async (payload: Record<string, unknown>) =>
  readJson(await POST(makeRequest("/api/auth/register", { body: payload })));

beforeEach(() => {
  h.verifyTurnstileToken.mockResolvedValue("pass");
  h.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null });
});

describe("POST /api/auth/register", () => {
  it("hands the phone to Supabase as user metadata, where the auth callback reads it", async () => {
    const { status } = await register(body());

    expect(status).toBe(200);
    expect(h.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ data: { name: "Somchai", phone: "0812345678" } }),
      }),
    );
  });

  it.each([
    ["missing", undefined],
    ["nine digits", "081234567"],
    ["formatted", "081-234-5678"],
  ])("rejects a phone that is %s before signing up", async (_, phone) => {
    const { status } = await register(body({ phone }));

    expect(status).toBe(400);
    expect(h.signUp).not.toHaveBeenCalled();
  });
});
