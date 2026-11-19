import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { chargeGuestAiUsage } from "./guest-ai";

type Sc = Parameters<typeof chargeGuestAiUsage>[0];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T00:00:00Z")); // the cron's 07:00 Bangkok run
});

describe("chargeGuestAiUsage", () => {
  it("charges each finished, uncharged day with something owed, once per host and day", async () => {
    const sc = createSupabaseMock({
      tables: {
        ai_usage_daily: { data: [{ host_id: "h1", day: "2026-11-19" }, { host_id: "h2", day: "2026-11-18" }] },
        guest_ai_sessions: { count: 4 },
      },
      rpc: { charge_guest_ai_usage: { data: [{ charged: 3, new_balance: 97 }] } },
    });

    await expect(chargeGuestAiUsage(sc as unknown as Sc, "2026-11-20")).resolves.toEqual({
      days: 2,
      baht: 6,
      failed: 0,
      sessionsPruned: 4,
    });
    const query = sc.builderFor("ai_usage_daily");
    // Today is still running in Bangkok: only days before it.
    expect(query.lt).toHaveBeenCalledWith("day", "2026-11-20");
    expect(query.is).toHaveBeenCalledWith("charged_at", null);
    expect(query.gt).toHaveBeenCalledWith("amount", 0);
    expect(sc.rpc).toHaveBeenCalledWith("charge_guest_ai_usage", { p_host: "h1", p_day: "2026-11-19" });
    expect(sc.rpc).toHaveBeenCalledWith("charge_guest_ai_usage", { p_host: "h2", p_day: "2026-11-18" });
    // Sessions expired over a day ago are dropped.
    expect(sc.builderFor("guest_ai_sessions").lt).toHaveBeenCalledWith("expires_at", "2026-11-19T00:00:00.000Z");
  });

  it("counts a failed day and carries on; the next run picks it up", async () => {
    const sc = createSupabaseMock({
      tables: { ai_usage_daily: { data: [{ host_id: "h1", day: "2026-11-19" }] }, guest_ai_sessions: { count: 0 } },
      rpc: { charge_guest_ai_usage: { error: { message: "HOST_NOT_FOUND" } } },
    });
    await expect(chargeGuestAiUsage(sc as unknown as Sc, "2026-11-20")).resolves.toEqual({
      days: 0,
      baht: 0,
      failed: 1,
      sessionsPruned: 0,
    });
  });

  it("throws when the days cannot be read, for the cron to report", async () => {
    const sc = createSupabaseMock({ tables: { ai_usage_daily: { error: { message: "db down" } } } });
    await expect(chargeGuestAiUsage(sc as unknown as Sc, "2026-11-20")).rejects.toThrow("db down");
    expect(sc.rpc).not.toHaveBeenCalled();
  });
});
