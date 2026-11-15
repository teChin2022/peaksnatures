import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { SITE_URL } from "@/lib/seo";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { resetPasswordForEmail: h.resetPasswordForEmail } }),
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: h.verifyTurnstileToken }));

beforeEach(() => {
  h.verifyTurnstileToken.mockResolvedValue("pass");
  h.resetPasswordForEmail.mockReset();
  h.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("POST /api/auth/forgot-password", () => {
  it("points the reset link at the app's own URL, whatever Origin the request claims", async () => {
    const { status } = await readJson(
      await POST(
        makeRequest("/api/auth/forgot-password", {
          body: { email: "host@example.com", turnstileToken: "tok" },
          headers: { origin: "https://attacker.example" },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(h.resetPasswordForEmail).toHaveBeenCalledWith("host@example.com", {
      redirectTo: `${SITE_URL}/api/auth/callback?next=/reset-password`,
    });
  });
});
