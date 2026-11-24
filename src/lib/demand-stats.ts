/**
 * Shared demand aggregation for the host and admin dashboards.
 *
 * Both routes go through here so the two funnels can never disagree. The work
 * itself happens in the get_demand_stats() RPC (migration 065) — the funnel
 * needs COUNT(DISTINCT session_id), which the Supabase query builder cannot
 * express, and doing it in Postgres also keeps the platform-wide admin query
 * from shipping every row into the serverless function.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMAND_STAGES, DemandEvent, type DemandStage } from "@/lib/demand-events";

export interface DemandFunnelStage {
  stage: DemandStage;
  sessions: number;
}

export interface DemandTopDate {
  date: string;
  requested: number;
  /** Sessions that wanted this date and found nothing bookable. */
  unavailable: number;
}

export interface DemandStats {
  funnel: DemandFunnelStage[];
  topDates: DemandTopDate[];
  totals: {
    sessions: number;
    conversions: number;
    lostDemand: number;
    /** Percent of page_view sessions that reached booking_submitted. */
    conversionPct: number;
    /** Of `conversions`, the quick bookings (no slip on the page). Null when that read failed. */
    quickConversions: number | null;
  };
}

interface RawStats {
  funnel?: { stage?: string; sessions?: number }[];
  top_dates?: { date?: string; requested?: number; unavailable?: number }[];
  totals?: { sessions?: number; conversions?: number; lost_demand?: number };
}

const EMPTY: DemandStats = {
  funnel: DEMAND_STAGES.map((stage) => ({ stage, sessions: 0 })),
  topDates: [],
  totals: { sessions: 0, conversions: 0, lostDemand: 0, conversionPct: 0, quickConversions: null },
};

export async function getDemandStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  { homestayId, days }: { homestayId?: string | null; days: number },
): Promise<DemandStats> {
  // Quick bookings carry data.quick (booking-section.tsx). The RPC does not split them, so
  // count them here over the same scope and window: distinct sessions, as the RPC counts.
  // shortcut: reads at most the API's row cap (1,000) of quick bookings; move into the RPC if the window ever holds more.
  let quickQuery = supabase
    .from("demand_events")
    .select("session_id")
    .eq("event_type", DemandEvent.BOOKING_SUBMITTED)
    .contains("data", { quick: true })
    .gte("created_at", new Date(Date.now() - Math.max(days, 1) * 86_400_000).toISOString());
  if (homestayId) quickQuery = quickQuery.eq("homestay_id", homestayId);

  const [{ data, error }, quick] = await Promise.all([
    supabase.rpc("get_demand_stats" as never, {
      p_homestay_id: homestayId ?? null,
      p_days: days,
    } as never),
    quickQuery,
  ]);

  if (error) {
    console.error("[DemandStats] rpc failed:", error.message);
    return EMPTY;
  }

  const raw = (data ?? {}) as RawStats;

  // Re-project onto DEMAND_STAGES so the UI always gets every stage in order,
  // even if the RPC ever returns a partial set.
  const bySlug = new Map((raw.funnel ?? []).map((f) => [f.stage, f.sessions ?? 0]));
  const funnel: DemandFunnelStage[] = DEMAND_STAGES.map((stage) => ({
    stage,
    sessions: bySlug.get(stage) ?? 0,
  }));

  const topDates: DemandTopDate[] = (raw.top_dates ?? [])
    .filter((d): d is { date: string; requested?: number; unavailable?: number } => !!d.date)
    .map((d) => ({
      date: d.date,
      requested: d.requested ?? 0,
      unavailable: d.unavailable ?? 0,
    }));

  const sessions = raw.totals?.sessions ?? 0;
  const conversions = raw.totals?.conversions ?? 0;
  if (quick.error) console.error("[DemandStats] quick count failed:", quick.error.message);
  const quickSessions = quick.error
    ? null
    : new Set(((quick.data ?? []) as { session_id: string }[]).map((r) => r.session_id)).size;

  return {
    funnel,
    topDates,
    totals: {
      sessions,
      conversions,
      lostDemand: raw.totals?.lost_demand ?? 0,
      conversionPct: sessions > 0 ? Math.round((conversions / sessions) * 1000) / 10 : 0,
      // The two reads see NOW() a moment apart, so never let the part exceed the whole.
      quickConversions: quickSessions === null ? null : Math.min(quickSessions, conversions),
    },
  };
}

/** Clamp the ?days= query param to the three ranges the UI offers. */
export function parseDemandDays(value: string | null): number {
  const n = Number(value);
  return n === 7 || n === 90 ? n : 30;
}
