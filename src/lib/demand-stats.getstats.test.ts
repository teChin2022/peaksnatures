import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDemandStats } from "@/lib/demand-stats";
import { DEMAND_STAGES } from "@/lib/demand-events";
import { createSupabaseMock, type QueryResponse } from "../../test/helpers/supabase";

type Client = Parameters<typeof getDemandStats>[0];

const clientReturning = (result: { data?: unknown; error?: unknown }, quick: QueryResponse = {}) =>
  createSupabaseMock({ rpc: { get_demand_stats: result }, tables: { demand_events: quick } }) as unknown as Client;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getDemandStats", () => {
  it("calls the aggregation RPC with the homestay and window", async () => {
    const client = clientReturning({ data: {} });
    await getDemandStats(client, { homestayId: "h-1", days: 90 });

    expect((client as unknown as SupabaseClient).rpc).toHaveBeenCalledWith("get_demand_stats", {
      p_homestay_id: "h-1",
      p_days: 90,
    });
  });

  it("passes a null homestay for the platform-wide admin view", async () => {
    const client = clientReturning({ data: {} });
    await getDemandStats(client, { homestayId: undefined, days: 30 });

    expect((client as unknown as SupabaseClient).rpc).toHaveBeenCalledWith(
      "get_demand_stats",
      expect.objectContaining({ p_homestay_id: null }),
    );
  });

  it("projects the RPC's funnel onto every stage, in order", async () => {
    const stats = await getDemandStats(
      clientReturning({ data: { funnel: [{ stage: DEMAND_STAGES[2], sessions: 12 }] } }),
      { days: 30 },
    );

    expect(stats.funnel.map((f) => f.stage)).toEqual([...DEMAND_STAGES]);
    expect(stats.funnel[2].sessions).toBe(12);
    expect(stats.funnel[0].sessions).toBe(0);
  });

  it("ignores a stage the RPC reports that the UI does not know about", async () => {
    const stats = await getDemandStats(
      clientReturning({ data: { funnel: [{ stage: "invented_stage", sessions: 99 }] } }),
      { days: 30 },
    );

    expect(stats.funnel).toHaveLength(DEMAND_STAGES.length);
    expect(stats.funnel.every((f) => f.sessions === 0)).toBe(true);
  });

  it("maps top dates and defaults their missing counts", async () => {
    const stats = await getDemandStats(
      clientReturning({
        data: {
          top_dates: [
            { date: "2026-06-01", requested: 10, unavailable: 4 },
            { date: "2026-06-02" },
            { requested: 5 }, // no date — dropped
          ],
        },
      }),
      { days: 30 },
    );

    expect(stats.topDates).toEqual([
      { date: "2026-06-01", requested: 10, unavailable: 4 },
      { date: "2026-06-02", requested: 0, unavailable: 0 },
    ]);
  });

  it("computes the conversion rate to one decimal place", async () => {
    const stats = await getDemandStats(
      clientReturning({ data: { totals: { sessions: 300, conversions: 7, lost_demand: 21 } } }),
      { days: 30 },
    );

    expect(stats.totals).toEqual({ sessions: 300, conversions: 7, lostDemand: 21, conversionPct: 2.3, quickConversions: 0 });
  });

  it("reports a zero conversion rate rather than dividing by zero", async () => {
    const stats = await getDemandStats(
      clientReturning({ data: { totals: { sessions: 0, conversions: 0 } } }),
      { days: 30 },
    );
    expect(stats.totals.conversionPct).toBe(0);
  });

  it("returns an empty funnel when the RPC fails", async () => {
    const stats = await getDemandStats(clientReturning({ error: { message: "rpc exploded" } }), { days: 30 });

    expect(stats.funnel).toHaveLength(DEMAND_STAGES.length);
    expect(stats.funnel.every((f) => f.sessions === 0)).toBe(true);
    expect(stats.topDates).toEqual([]);
    expect(stats.totals).toEqual({ sessions: 0, conversions: 0, lostDemand: 0, conversionPct: 0, quickConversions: null });
    expect(console.error).toHaveBeenCalled();
  });

  it("copes with the RPC returning nothing at all", async () => {
    const stats = await getDemandStats(clientReturning({ data: null }), { days: 30 });
    expect(stats.totals.sessions).toBe(0);
    expect(stats.funnel).toHaveLength(DEMAND_STAGES.length);
  });

  // Quick bookings upload no slip on the page, so the panel shows them apart from standard ones.
  describe("quick bookings", () => {
    it("counts distinct sessions whose booking was quick, in the same homestay and window", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-24T05:00:00Z"));
      const client = createSupabaseMock({
        rpc: { get_demand_stats: { data: { totals: { sessions: 50, conversions: 6 } } } },
        tables: { demand_events: { data: [{ session_id: "a" }, { session_id: "b" }, { session_id: "a" }] } },
      });

      const stats = await getDemandStats(client as unknown as Client, { homestayId: "h-1", days: 7 });
      vi.useRealTimers();

      expect(stats.totals.quickConversions).toBe(2);
      const q = client.builderFor("demand_events");
      expect(q.eq).toHaveBeenCalledWith("event_type", "booking_submitted");
      expect(q.contains).toHaveBeenCalledWith("data", { quick: true });
      expect(q.eq).toHaveBeenCalledWith("homestay_id", "h-1");
      expect(q.gte).toHaveBeenCalledWith("created_at", "2026-11-17T05:00:00.000Z");
    });

    it("does not narrow to a homestay for the platform-wide admin view", async () => {
      const client = createSupabaseMock({ rpc: { get_demand_stats: { data: {} } }, tables: { demand_events: { data: [] } } });
      await getDemandStats(client as unknown as Client, { homestayId: null, days: 30 });

      expect(client.builderFor("demand_events").eq).not.toHaveBeenCalledWith("homestay_id", expect.anything());
    });

    it("never reports more quick bookings than bookings", async () => {
      const stats = await getDemandStats(
        clientReturning({ data: { totals: { sessions: 9, conversions: 1 } } }, { data: [{ session_id: "a" }, { session_id: "b" }] }),
        { days: 30 },
      );
      expect(stats.totals.quickConversions).toBe(1);
    });

    it("reports the quick count as unknown, not zero, when its read fails", async () => {
      const stats = await getDemandStats(
        clientReturning({ data: { totals: { sessions: 9, conversions: 3 } } }, { error: { message: "boom" } }),
        { days: 30 },
      );
      expect(stats.totals.quickConversions).toBeNull();
      expect(stats.totals.conversions).toBe(3);
    });
  });
});
