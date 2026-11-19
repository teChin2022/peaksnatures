import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: h.createServiceRoleClient,
}));

import { countGuestAiRequested, getGuestAiPlatform, getGuestAiRequests } from "./data";

const row = (host_id: string, status: string, requested_at: string, name: string | null = "บ้าน") => ({
  host_id,
  status,
  requested_at,
  decided_at: null,
  decided_by: null,
  enabled: false,
  daily_reply_cap: 50,
  host: name === null ? null : { name },
});

describe("getGuestAiRequests", () => {
  beforeEach(() => h.createServiceRoleClient.mockReset());

  it("puts waiting requests first and flattens the host name", async () => {
    // Already newest-first, as the query orders it.
    const sc = createSupabaseMock({
      tables: {
        ai_usage_daily: { data: [{ host_id: "h1", replies: 7, amount: "3.50" }] },
        host_ai_settings: {
          data: [
            row("h1", "approved", "2026-11-19T05:00:00Z", "A"),
            row("h2", "requested", "2026-11-19T04:00:00Z", "B"),
            row("h3", "rejected", "2026-11-19T03:00:00Z", null),
            row("h4", "requested", "2026-11-19T02:00:00Z", "D"),
          ],
        },
      },
    });
    h.createServiceRoleClient.mockReturnValue(sc);

    const result = await getGuestAiRequests();
    expect(result.map((r) => [r.host_id, r.status, r.host_name])).toEqual([
      ["h2", "requested", "B"],
      ["h4", "requested", "D"],
      ["h1", "approved", "A"],
      ["h3", "rejected", null],
    ]);
    expect(result[0]).not.toHaveProperty("host");
    expect(result.find((r) => r.host_id === "h1")).toMatchObject({ replies_today: 7, amount_today: 3.5 });
    expect(result.find((r) => r.host_id === "h2")?.replies_today).toBe(0);
    expect(sc.builderFor("host_ai_settings").order).toHaveBeenCalledWith("requested_at", { ascending: false });
  });

  it("returns an empty list when the read fails", async () => {
    h.createServiceRoleClient.mockReturnValue(createSupabaseMock({ tables: { host_ai_settings: { error: { message: "boom" } } } }));
    await expect(getGuestAiRequests()).resolves.toEqual([]);
  });
});

describe("countGuestAiRequested", () => {
  it("counts only the requests still waiting", async () => {
    const sc = createSupabaseMock({ tables: { host_ai_settings: { count: 3 } } });
    h.createServiceRoleClient.mockReturnValue(sc);
    await expect(countGuestAiRequested()).resolves.toBe(3);
    expect(sc.builderFor("host_ai_settings").eq).toHaveBeenCalledWith("status", "requested");
  });
});

describe("getGuestAiPlatform", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T18:00:00Z")); // 01:00 on the 20th in Bangkok
  });

  it("adds up today's replies over every host, for the Bangkok day", async () => {
    const sc = createSupabaseMock({
      tables: {
        platform_guest_ai_config: { data: { enabled: true, daily_cap: 300, price_per_reply: "0.50" } },
        ai_usage_daily: { data: [{ host_id: "h1", replies: 7 }, { host_id: "h2", replies: 5 }] },
      },
    });
    h.createServiceRoleClient.mockReturnValue(sc);
    await expect(getGuestAiPlatform()).resolves.toEqual({ enabled: true, daily_cap: 300, price_per_reply: 0.5, replies_today: 12 });
    expect(sc.builderFor("ai_usage_daily").eq).toHaveBeenCalledWith("day", "2026-11-20");
  });

  it("is null before migration 085", async () => {
    h.createServiceRoleClient.mockReturnValue(createSupabaseMock({ tables: { platform_guest_ai_config: { data: null } } }));
    await expect(getGuestAiPlatform()).resolves.toBeNull();
  });
});
