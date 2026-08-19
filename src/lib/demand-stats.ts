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
import { DEMAND_STAGES, type DemandStage } from "@/lib/demand-events";

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
  totals: { sessions: 0, conversions: 0, lostDemand: 0, conversionPct: 0 },
};

export async function getDemandStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  { homestayId, days }: { homestayId?: string | null; days: number },
): Promise<DemandStats> {
  const { data, error } = await supabase.rpc("get_demand_stats" as never, {
    p_homestay_id: homestayId ?? null,
    p_days: days,
  } as never);

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

  return {
    funnel,
    topDates,
    totals: {
      sessions,
      conversions,
      lostDemand: raw.totals?.lost_demand ?? 0,
      conversionPct: sessions > 0 ? Math.round((conversions / sessions) * 1000) / 10 : 0,
    },
  };
}

/** Clamp the ?days= query param to the three ranges the UI offers. */
export function parseDemandDays(value: string | null): number {
  const n = Number(value);
  return n === 7 || n === 90 ? n : 30;
}
