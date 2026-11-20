import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../test/helpers/supabase";

const h = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  fetchPastDueHostIds: vi.fn(),
  unstable_cache: vi.fn((fn: () => unknown) => fn),
}));

vi.mock("next/cache", () => ({ unstable_cache: h.unstable_cache }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("@/lib/billing", () => ({ fetchPastDueHostIds: h.fetchPastDueHostIds }));

import { loadLandingRows } from "./landing-data";

// Recorded at import: clearMocks wipes call history before each test.
const cacheCalls = [...h.unstable_cache.mock.calls];

function mockClient(over: Record<string, { data: unknown; count?: number; error?: { message: string } }> = {}) {
  h.createServiceRoleClient.mockReturnValue(
    createSupabaseMock({
      tables: {
        homestays: { data: [{ id: "homestay-1", host_id: "host-1" }] },
        rooms: { data: [] },
        hosts: { data: [{ id: "host-1" }] },
        reviews: { data: [] },
        bookings: { data: null, count: 7 },
        ...over,
      },
    }),
  );
}

beforeEach(() => {
  h.fetchPastDueHostIds.mockResolvedValue(new Set(["host-1"]));
});

describe("landing data", () => {
  // Every page reads the locale cookie, so `revalidate` never applies; this cache is the only one.
  it("is cached for 60s", () => {
    expect(cacheCalls).toEqual([[loadLandingRows, ["landing-rows"], { revalidate: 60 }]]);
  });

  // The cache stores JSON: a Set would come back as {} and list a past-due host as payable.
  it("hands past-due hosts back as an array", async () => {
    mockClient();
    const rows = await loadLandingRows();
    expect(rows.pastDueHostIds).toEqual(["host-1"]);
    expect(rows.confirmedBookings).toBe(7);
  });

  // A failed read would otherwise be cached as an empty landing for 60s.
  it.each(["homestays", "rooms", "hosts", "reviews", "bookings"])("throws when the %s read fails", async (table) => {
    mockClient({ [table]: { data: null, error: { message: "timeout" } } });
    await expect(loadLandingRows()).rejects.toMatchObject({ message: "timeout" });
  });
});
