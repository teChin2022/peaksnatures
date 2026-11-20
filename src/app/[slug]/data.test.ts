import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../test/helpers/supabase";

const h = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  unstable_cache: vi.fn((fn: () => unknown) => fn),
}));

vi.mock("next/cache", () => ({ unstable_cache: h.unstable_cache }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("@/lib/billing", () => ({ hasPastDueInvoice: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/translation/translate-homestay", () => ({
  localizeHomestay: vi.fn(async (input: unknown) => input),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));

import { getHomestayData } from "./data";

const homestay = {
  id: "homestay-1",
  host_id: "host-1",
  slug: "retreat",
  name: "Retreat",
  description: "<p>Hi</p>",
  check_in_info: null,
  policies: null,
  is_active: true,
};

const host = (status: string) => ({
  id: "host-1",
  name: "Somchai",
  status,
  plan_type: "free",
  plan_free_expires_at: null,
  wallet_balance: 0,
  wallet_credit_limit: 0,
  wallet_negative_since: null,
});

function mockClient(status: string, over: Record<string, { data: unknown; error?: { message: string } }> = {}) {
  const client = createSupabaseMock({
    tables: {
      homestays: { data: homestay },
      hosts: { data: host(status) },
      rooms: { data: [] },
      blocked_dates: { data: [] },
      bookings: { data: [] },
      reviews: { data: [] },
      promo_codes: { data: null },
      ...over,
    },
  });
  h.createServiceRoleClient.mockReturnValue(client);
  return client;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getHomestayData: who is public", () => {
  it("serves the page of an approved host", async () => {
    mockClient("approved");
    expect(await getHomestayData("retreat", "th")).not.toBeNull();
  });

  // F-14: a newly registered host (pending) could publish a page that took
  // bookings and showed their PromptPay, before any admin approved them.
  it.each(["pending", "rejected", "suspended"])("treats a %s host's page as not found", async (status) => {
    mockClient(status);
    expect(await getHomestayData(`retreat-${status}`, "th")).toBeNull();
  });
});

describe("getHomestayData: caching", () => {
  // Every page reads the locale cookie, so `revalidate` never applies; this cache is the only one.
  it("caches each slug and locale for 30s", async () => {
    mockClient("approved");
    await getHomestayData("retreat-cached", "en");
    expect(h.unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["homestay-page", "retreat-cached", "en"], { revalidate: 30 });
  });

  it("never reads the host's secrets, which would sit in the cache", async () => {
    const client = mockClient("approved");
    await getHomestayData("retreat-columns", "th");
    const select = client.builderFor("hosts").select as ReturnType<typeof vi.fn>;
    const columns = select.mock.calls[0][0] as string;
    expect(columns).not.toContain("*");
    for (const secret of ["line_channel_access_token", "security_pin_hash", "line_user_id", "email", "user_id"]) {
      expect(columns.split(", ")).not.toContain(secret);
    }
  });

  // A cached null would 404 a live page for 30s; a throw is not cached and shows the error page once.
  it.each([
    ["homestays", "the homestay read"],
    ["hosts", "the host read"],
    ["rooms", "a parallel read"],
  ])("throws when %s fails (%s) instead of caching a missing page", async (table) => {
    mockClient("approved", { [table]: { data: null, error: { message: "timeout" } } });
    await expect(getHomestayData(`retreat-fail-${table}`, "th")).rejects.toMatchObject({ message: "timeout" });
  });
});

describe("getHomestayData: bounded booking reads", () => {
  afterEach(() => vi.useRealTimers());

  // 19 Nov 18:00 UTC is already 20 Nov in Bangkok: the filter must use the Thai day.
  it("sends only stays that end today (Bangkok) or later", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T18:00:00Z"));
    const client = mockClient("approved");
    await getHomestayData("retreat-ranges", "th");
    expect(client.builderFor("bookings", 0).gte).toHaveBeenCalledWith("check_out", "2026-11-20");
  });

  it("finds the most-booked house from the latest 500 stays, not every booking ever", async () => {
    const client = mockClient("approved");
    await getHomestayData("retreat-popular", "th");
    const rows = client.builderFor("bookings", 3);
    expect(rows.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(rows.limit).toHaveBeenCalledWith(500);
  });
});
