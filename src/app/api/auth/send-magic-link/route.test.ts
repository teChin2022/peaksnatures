import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { SITE_URL } from "@/lib/seo";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  generateLink: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ auth: { admin: { generateLink: h.generateLink } } }),
}));
vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send: h.send } };
  }),
}));

const ATTACKER = "https://attacker.example";

const send = (headers: Record<string, string> = {}, ip = uniqueIp()) =>
  POST(makeRequest("/api/auth/send-magic-link", { body: { email: "host@example.com" }, headers, ip }));

/** The href of the sign-in button in the email that went out. */
const sentLink = () => {
  const html = h.send.mock.calls[0][0].html as string;
  return html.match(/href="([^"]+)"/)![1];
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  h.generateLink.mockReset();
  h.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "hashed-token" } }, error: null });
  h.send.mockReset();
  h.send.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/send-magic-link", () => {
  it("emails a sign-in link on the app's own URL", async () => {
    const { status } = await readJson(await send());

    expect(status).toBe(200);
    expect(sentLink()).toBe(`${SITE_URL}/api/auth/callback?token_hash=hashed-token&type=magiclink&next=/dashboard`);
  });

  // The link carries a live token. Built from the request's Origin, anyone
  // could have the victim's real login email point at their own site.
  it("ignores the Origin header, so the token cannot be sent to another site", async () => {
    await send({ origin: ATTACKER });

    expect(sentLink().startsWith(`${SITE_URL}/`)).toBe(true);
    expect(sentLink()).not.toContain("attacker");
    expect(h.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ options: { redirectTo: `${SITE_URL}/api/auth/callback?next=/dashboard` } }),
    );
  });

  it("rate-limits one address", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 5; i++) {
      expect((await send({}, ip)).status).toBe(200);
    }
    expect((await send({}, ip)).status).toBe(429);
  });
});

// F-19: "no_account" (404) told anyone which emails have an account here.
describe("POST /api/auth/send-magic-link: unknown emails", () => {
  it("answers exactly as for a real account, and sends nothing", async () => {
    h.generateLink.mockResolvedValue({ data: null, error: { message: "User not found" } });

    const { status, body } = await readJson(await send());

    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(h.send).not.toHaveBeenCalled();
  });
});
