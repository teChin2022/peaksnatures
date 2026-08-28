import { describe, expect, it, vi } from "vitest";
import { assertCronAuthorized } from "@/lib/auth/cron-auth";
import { makeRequest } from "../../../test/helpers/request";

// Matches the value test/setup.ts exports before any module is imported.
const SECRET = "test-cron-secret-at-least-32-chars-long";

const authed = (header?: string) =>
  assertCronAuthorized(makeRequest("/api/cron/billing", {
    method: "GET",
    headers: header === undefined ? {} : { authorization: header },
  }));

describe("assertCronAuthorized", () => {
  it("authorises a request carrying the cron secret", () => {
    expect(authed(`Bearer ${SECRET}`)).toBeNull();
  });

  it("rejects a request with no authorization header", async () => {
    const res = authed();
    expect(res?.status).toBe(401);
    await expect(res?.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects an empty authorization header", () => {
    expect(authed("")?.status).toBe(401);
  });

  it("rejects the wrong secret", () => {
    expect(authed("Bearer wrong-secret-that-is-also-32-chars")?.status).toBe(401);
  });

  it("rejects the right secret without the Bearer scheme", () => {
    expect(authed(SECRET)?.status).toBe(401);
  });

  it("rejects a lower-case Bearer scheme", () => {
    expect(authed(`bearer ${SECRET}`)?.status).toBe(401);
  });

  it("still authorises when the header arrives padded, which HTTP trims for us", () => {
    expect(authed(`Bearer ${SECRET} `)).toBeNull();
  });

  it("rejects a prefix of the secret, so a truncated header cannot pass", () => {
    expect(authed(`Bearer ${SECRET.slice(0, -1)}`)?.status).toBe(401);
  });
});

describe("module load guards", () => {
  it("refuses to initialise when CRON_SECRET is unset", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", undefined);
    await expect(import("@/lib/auth/cron-auth")).rejects.toThrow(/CRON_SECRET is not set/);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("refuses to initialise when CRON_SECRET is too short to be strong", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", "short");
    await expect(import("@/lib/auth/cron-auth")).rejects.toThrow(/at least 32 characters/);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
