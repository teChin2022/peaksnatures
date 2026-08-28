import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "@/lib/turnstile";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function mockFetch(impl: (...args: unknown[]) => unknown) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const respondWith = (body: unknown) => () =>
  Promise.resolve({ json: () => Promise.resolve(body) } as Response);

beforeEach(() => {
  // The module logs on every non-pass path; keep the suite output readable.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verifyTurnstileToken", () => {
  it("passes when Cloudflare confirms the token", async () => {
    mockFetch(respondWith({ success: true }));
    await expect(verifyTurnstileToken("tok")).resolves.toBe("pass");
  });

  it("fails when Cloudflare rejects the token", async () => {
    mockFetch(respondWith({ success: false, "error-codes": ["invalid-input-response"] }));
    await expect(verifyTurnstileToken("tok")).resolves.toBe("fail");
  });

  it("fails on any response that does not say success is exactly true", async () => {
    for (const body of [{}, { success: "true" }, { success: 1 }]) {
      mockFetch(respondWith(body));
      await expect(verifyTurnstileToken("tok")).resolves.toBe("fail");
    }
  });

  it("posts the secret and token as form-encoded data", async () => {
    const fetchMock = mockFetch(respondWith({ success: true }));
    await verifyTurnstileToken("tok-123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SITEVERIFY);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect((init.body as URLSearchParams).get("secret")).toBe("test-secret");
    expect((init.body as URLSearchParams).get("response")).toBe("tok-123");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  describe("fail-open contract", () => {
    it("skips without calling Cloudflare when the widget supplied no token", async () => {
      const fetchMock = mockFetch(respondWith({ success: true }));
      await expect(verifyTurnstileToken("")).resolves.toBe("skip");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("skips without calling Cloudflare when no secret is configured", async () => {
      vi.stubEnv("TURNSTILE_SECRET_KEY", "");
      const fetchMock = mockFetch(respondWith({ success: true }));
      await expect(verifyTurnstileToken("tok")).resolves.toBe("skip");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("skips when Cloudflare is unreachable", async () => {
      mockFetch(() => Promise.reject(new TypeError("fetch failed")));
      await expect(verifyTurnstileToken("tok")).resolves.toBe("skip");
    });

    it("skips when the request times out", async () => {
      mockFetch(() => Promise.reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
      await expect(verifyTurnstileToken("tok")).resolves.toBe("skip");
    });

    it("skips when Cloudflare returns a null body, which cannot be inspected", async () => {
      mockFetch(respondWith(null));
      await expect(verifyTurnstileToken("tok")).resolves.toBe("skip");
    });

    it("skips when Cloudflare returns a body that is not JSON", async () => {
      mockFetch(() => Promise.resolve({ json: () => Promise.reject(new SyntaxError("bad json")) } as unknown as Response));
      await expect(verifyTurnstileToken("tok")).resolves.toBe("skip");
    });
  });
});
