import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  MAX_SLIP_AGE_MS,
  callEasySlipV2,
  computeSlipHash,
  extractVisibleDigits,
  matchesAccount,
  validateReceiver,
  type EasySlipV2RawSlip,
} from "@/lib/easyslip";

const ENDPOINT = "https://api.easyslip.com/v2/verify/bank";

/** A Response stand-in: callEasySlipV2 reads the body with .text(), never .json(). */
const textResponse = (status: number, body: string) =>
  ({ status, text: () => Promise.resolve(body) }) as unknown as Response;

const jsonResponse = (status: number, body: unknown) => textResponse(status, JSON.stringify(body));

function mockFetch(...responses: Array<() => Promise<Response>>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockImplementationOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const rawSlip = (receiver: Partial<EasySlipV2RawSlip["receiver"]["account"]> = {}) =>
  ({ receiver: { account: receiver } }) as EasySlipV2RawSlip;

const callWith = (fetchImpls: Array<() => Promise<Response>>, expectedAmount = 1000) => {
  mockFetch(...fetchImpls);
  return callEasySlipV2(new ArrayBuffer(8), "slip.jpg", "image/jpeg", "key-123", expectedAmount);
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("extractVisibleDigits", () => {
  it("keeps only the digits", () => {
    expect(extractVisibleDigits("xxx-x-x1105-x")).toBe("1105");
    expect(extractVisibleDigits("081-234-5678")).toBe("0812345678");
  });

  it("returns an empty string for a fully masked, empty or absent value", () => {
    for (const value of ["xxx-x-xxxx-x", "", null, undefined]) {
      expect(extractVisibleDigits(value)).toBe("");
    }
  });
});

describe("matchesAccount", () => {
  it("matches when the visible digits are the whole expected account", () => {
    expect(matchesAccount("0812345678", "0812345678")).toBe(true);
  });

  it("matches a masked slip account against the expected account it appears in", () => {
    expect(matchesAccount("xxx-x-x1105-x", "0811051234")).toBe(true);
  });

  it("does not match a different account", () => {
    expect(matchesAccount("xxx-x-x9999-x", "0811051234")).toBe(false);
  });

  it("returns false when either side is empty, absent or fully masked", () => {
    expect(matchesAccount("", "0812345678")).toBe(false);
    expect(matchesAccount(null, "0812345678")).toBe(false);
    expect(matchesAccount(undefined, "0812345678")).toBe(false);
    expect(matchesAccount("0812345678", "")).toBe(false);
    expect(matchesAccount("xxx-x-xxxx-x", "0812345678")).toBe(false);
  });

  // KNOWN GAP: matching is a substring test, so a slip revealing only a couple of
  // digits matches any account containing them. Pinned deliberately — this is
  // security-relevant and flagged for review.
  it("matches on a substring, so very few visible digits match loosely", () => {
    expect(matchesAccount("xxx-x-xx12-x", "0812345678")).toBe(true);
  });
});

describe("validateReceiver", () => {
  it("matches the receiver's PromptPay proxy account", () => {
    const slip = rawSlip({ proxy: { type: "MSISDN", account: "xxx-xxx-1105" } });
    expect(validateReceiver(slip, "0811051234", null)).toBe(true);
  });

  it("matches the receiver's bank account", () => {
    const slip = rawSlip({ bank: { type: "BANKAC", account: "xxx-x-x5678-x" } });
    expect(validateReceiver(slip, "0812345678", null)).toBe(true);
  });

  it("matches the expected bank account against either slip field", () => {
    const viaBank = rawSlip({ bank: { type: "BANKAC", account: "123-4-56789-0" } });
    expect(validateReceiver(viaBank, "0899999999", "1234567890")).toBe(true);

    const viaProxy = rawSlip({ proxy: { type: "BANKAC", account: "123-4-56789-0" } });
    expect(validateReceiver(viaProxy, "0899999999", "1234567890")).toBe(true);
  });

  it("rejects a slip paid to somebody else", () => {
    const slip = rawSlip({ proxy: { type: "MSISDN", account: "xxx-xxx-9999" } });
    expect(validateReceiver(slip, "0811051234", "5550000000")).toBe(false);
  });

  it("rejects a slip with no receiver account details at all", () => {
    expect(validateReceiver(rawSlip(), "0811051234", null)).toBe(false);
    expect(validateReceiver({} as EasySlipV2RawSlip, "0811051234", null)).toBe(false);
  });

  // KNOWN GAP: a host with no configured receiver accepts a slip paid to anyone.
  // Pinned deliberately — security-relevant and flagged for review.
  it("accepts any receiver when the host has none configured", () => {
    const slip = rawSlip({ proxy: { type: "MSISDN", account: "xxx-xxx-9999" } });
    expect(validateReceiver(slip, null, null)).toBe(true);
  });
});

describe("computeSlipHash", () => {
  it("hashes the bytes with SHA-256, hex encoded", async () => {
    const abc = new TextEncoder().encode("abc").buffer as ArrayBuffer;
    await expect(computeSlipHash(abc)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes an empty buffer to the known empty digest", async () => {
    await expect(computeSlipHash(new ArrayBuffer(0))).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("gives the same hash for the same bytes and a different one otherwise", async () => {
    const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
    const [a, b, c] = await Promise.all([enc("slip"), enc("slip"), enc("slip!")].map(computeSlipHash));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

describe("callEasySlipV2", () => {
  const success = { success: true, data: { isDuplicate: false, amountInSlip: 1000, rawSlip: {} } };

  it("returns the parsed body on success", async () => {
    await expect(callWith([() => Promise.resolve(jsonResponse(200, success))])).resolves.toEqual(success);
  });

  it("sends the API key, the image and the duplicate check", async () => {
    const fetchMock = mockFetch(() => Promise.resolve(jsonResponse(200, success)));
    await callEasySlipV2(new ArrayBuffer(8), "slip.png", "image/png", "key-123", 1500);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key-123");

    const form = init.body as FormData;
    expect(form.get("checkDuplicate")).toBe("true");
    expect(form.get("matchAmount")).toBe("1500");
    expect((form.get("image") as File).name).toBe("slip.png");
    expect((form.get("image") as File).type).toBe("image/png");
  });

  it("omits matchAmount when no amount is expected", async () => {
    const fetchMock = mockFetch(() => Promise.resolve(jsonResponse(200, success)));
    await callEasySlipV2(new ArrayBuffer(8), "slip.jpg", "image/jpeg", "key", 0);
    expect((fetchMock.mock.calls[0][1].body as FormData).get("matchAmount")).toBeNull();
  });

  it("passes a documented upstream error straight through", async () => {
    const body = { success: false, error: { code: "SLIP_NOT_FOUND", message: "Slip not found" } };
    await expect(callWith([() => Promise.resolve(jsonResponse(400, body))])).resolves.toEqual(body);
  });

  it("falls back to the code as the message when the upstream sends none", async () => {
    const body = { success: false, error: { code: "QUOTA_EXCEEDED", message: "" } };
    await expect(callWith([() => Promise.resolve(jsonResponse(400, body))])).resolves.toEqual({
      success: false,
      error: { code: "QUOTA_EXCEEDED", message: "QUOTA_EXCEEDED" },
    });
  });

  describe("never throws, whatever the upstream does", () => {
    it("reports a timeout as UPSTREAM_TIMEOUT", async () => {
      const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
      const res = await callWith([() => Promise.reject(timeout)]);
      expect(res).toMatchObject({ success: false, error: { code: "UPSTREAM_TIMEOUT" } });
    });

    it("reports a dropped connection as UPSTREAM_UNREACHABLE", async () => {
      const res = await callWith([() => Promise.reject(new TypeError("fetch failed"))]);
      expect(res).toMatchObject({ success: false, error: { code: "UPSTREAM_UNREACHABLE" } });
    });

    it("reports an HTML error page as HTTP_<status>", async () => {
      const res = await callWith([() => Promise.resolve(textResponse(502, "<html>Bad Gateway</html>"))]);
      expect(res).toMatchObject({ success: false, error: { code: "HTTP_502" } });
    });

    it("gives a rate-limit message for a non-JSON 429", async () => {
      const res = await callWith([() => Promise.resolve(textResponse(429, "Too Many Requests"))]);
      expect(res).toMatchObject({ success: false, error: { code: "HTTP_429" } });
      expect((res as { error: { message: string } }).error.message).toMatch(/rate limited/i);
    });

    it("reports an unreadable body as MALFORMED_RESPONSE", async () => {
      for (const body of [{ ok: 1 }, { success: "yes" }, null]) {
        const res = await callWith([() => Promise.resolve(jsonResponse(200, body))]);
        expect(res).toMatchObject({ success: false, error: { code: "MALFORMED_RESPONSE" } });
      }
    });

    it("reports an error body with no code as MALFORMED_RESPONSE", async () => {
      const res = await callWith([() => Promise.resolve(jsonResponse(400, { success: false, error: {} }))]);
      expect(res).toMatchObject({ success: false, error: { code: "MALFORMED_RESPONSE" } });
    });

    it("survives a body that cannot even be read as text", async () => {
      const broken = { status: 500, text: () => Promise.reject(new Error("stream closed")) } as unknown as Response;
      const res = await callWith([() => Promise.resolve(broken)]);
      expect(res).toMatchObject({ success: false, error: { code: "HTTP_500" } });
    });
  });

  describe("SLIP_PENDING", () => {
    const pending = () =>
      Promise.resolve(jsonResponse(400, { success: false, error: { code: "SLIP_PENDING", message: "Pending" } }));

    it("retries once, then gives up rather than risk being killed mid-sleep", async () => {
      vi.useFakeTimers();
      const fetchMock = mockFetch(pending, pending, pending, pending);

      const promise = callEasySlipV2(new ArrayBuffer(8), "s.jpg", "image/jpeg", "key", 1000);
      // One 15s back-off fits the 50s budget; a second round trip would not.
      await vi.advanceTimersByTimeAsync(15_000);
      const res = await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res).toMatchObject({ success: false, error: { code: "SLIP_PENDING" } });
    });

    it("returns the slip as soon as the retry succeeds", async () => {
      vi.useFakeTimers();
      const fetchMock = mockFetch(pending, () => Promise.resolve(jsonResponse(200, success)));

      const promise = callEasySlipV2(new ArrayBuffer(8), "s.jpg", "image/jpeg", "key", 1000);
      await vi.advanceTimersByTimeAsync(15_000);

      await expect(promise).resolves.toEqual(success);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe("upload constraints", () => {
  it("caps slips at 4MB", () => {
    expect(MAX_FILE_SIZE).toBe(4 * 1024 * 1024);
  });

  it("accepts the image types a phone camera produces", () => {
    expect(ALLOWED_TYPES).toContain("image/jpeg");
    expect(ALLOWED_TYPES).toContain("image/heic");
    expect(ALLOWED_TYPES.every((t) => t.startsWith("image/"))).toBe(true);
  });

  it("treats a slip as stale after an hour", () => {
    expect(MAX_SLIP_AGE_MS).toBe(60 * 60 * 1000);
  });
});
