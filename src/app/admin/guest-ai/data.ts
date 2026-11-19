import { createServiceRoleClient } from "@/lib/supabase/server";
import { billingTodayStr } from "@/lib/billing-dates";
import type { HostAiStatus } from "@/types/database";

export interface GuestAiRequest {
  host_id: string;
  host_name: string | null;
  status: HostAiStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  enabled: boolean;
  daily_reply_cap: number;
  /** Replies its guests got today (Bangkok day), migration 085. */
  replies_today: number;
  /** Baht accrued today, charged tomorrow (086). */
  amount_today: number;
}

export interface GuestAiPlatform {
  enabled: boolean;
  daily_cap: number;
  price_per_reply: number;
  /** The admin's estimate of Gemini's price, baht per 1M tokens (087). */
  cost_in_per_mtok: number;
  cost_out_per_mtok: number;
  replies_today: number;
}

/** One host's guest AI over the report window (087): usage, estimated model cost, money in. */
export interface GuestAiReportRow {
  host_id: string;
  host_name: string | null;
  replies: number;
  input_tokens: number;
  output_tokens: number;
  /** Estimated Gemini cost in baht at the admin's rates; null while no rate is set. */
  est_cost: number | null;
  /** Baht taken from the wallet for finished days. */
  charged: number;
  /** Baht accrued on days not charged yet (today, or a failed charge). */
  accrued: number;
}

export const REPORT_DAYS = 30;

/** Waiting requests first, then the rest; newest request first within each. */
const STATUS_ORDER: Record<HostAiStatus, number> = { requested: 0, approved: 1, suspended: 2, rejected: 3 };

/** Every host's guest AI assistant row (migration 084). Caller must have checked isAdmin. */
export async function getGuestAiRequests(): Promise<GuestAiRequest[]> {
  const sc = createServiceRoleClient();
  const [{ data }, usage] = await Promise.all([
    sc
      .from("host_ai_settings")
      .select("host_id, status, requested_at, decided_at, decided_by, enabled, daily_reply_cap, host:hosts(name)")
      .order("requested_at", { ascending: false }),
    todaysUsage(),
  ]);

  type Row = Omit<GuestAiRequest, "host_name" | "replies_today" | "amount_today"> & { host: { name: string | null } | null };
  return ((data ?? []) as Row[])
    .map(({ host, ...r }) => {
      const today = usage.get(r.host_id);
      return { ...r, host_name: host?.name ?? null, replies_today: today?.replies ?? 0, amount_today: today?.amount ?? 0 };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

/** Replies and accrued baht per host today. */
async function todaysUsage(): Promise<Map<string, { replies: number; amount: number }>> {
  const { data } = await createServiceRoleClient()
    .from("ai_usage_daily")
    .select("host_id, replies, amount")
    .eq("day", billingTodayStr());
  return new Map(
    ((data ?? []) as { host_id: string; replies: number; amount: number | string | null }[]).map((r) => [
      r.host_id,
      { replies: r.replies, amount: Number(r.amount ?? 0) },
    ]),
  );
}

/** The kill switch, the platform cap and today's total; null before migration 085. */
export async function getGuestAiPlatform(): Promise<GuestAiPlatform | null> {
  const [{ data }, usage] = await Promise.all([
    createServiceRoleClient()
      .from("platform_guest_ai_config")
      .select("enabled, daily_cap, price_per_reply, cost_in_per_mtok, cost_out_per_mtok")
      .maybeSingle(),
    todaysUsage(),
  ]);
  if (!data) return null;
  const row = data as {
    enabled: boolean;
    daily_cap: number;
    price_per_reply: number | string | null;
    cost_in_per_mtok?: number | string | null;
    cost_out_per_mtok?: number | string | null;
  };
  return {
    enabled: row.enabled,
    daily_cap: row.daily_cap,
    // NUMERIC arrives as a string from PostgREST.
    price_per_reply: Number(row.price_per_reply ?? 0),
    cost_in_per_mtok: Number(row.cost_in_per_mtok ?? 0),
    cost_out_per_mtok: Number(row.cost_out_per_mtok ?? 0),
    replies_today: [...usage.values()].reduce((a, b) => a + b.replies, 0),
  };
}

/** Requests waiting for an admin, for the sidebar badge. */
export async function countGuestAiRequested(): Promise<number> {
  const { count } = await createServiceRoleClient()
    .from("host_ai_settings")
    .select("host_id", { count: "exact", head: true })
    .eq("status", "requested");
  return count ?? 0;
}

/**
 * The last REPORT_DAYS Bangkok days per host, busiest first (the page adds the platform total).
 * `rates` are baht per 1M input / output tokens; both 0 means "not set", and the cost is null.
 */
export async function getGuestAiReport(rates: { in: number; out: number }): Promise<GuestAiReportRow[]> {
  const today = billingTodayStr();
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (REPORT_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const { data } = await createServiceRoleClient()
    .from("ai_usage_daily")
    .select("host_id, replies, input_tokens, output_tokens, amount, charged_amount, charged_at, host:hosts(name)")
    .gte("day", from);

  type Row = {
    host_id: string;
    replies: number;
    input_tokens: number | string | null;
    output_tokens: number | string | null;
    amount: number | string | null;
    charged_amount: number | null;
    charged_at: string | null;
    host: { name: string | null } | null;
  };
  const byHost = new Map<string, GuestAiReportRow>();
  for (const r of (data ?? []) as Row[]) {
    const acc =
      byHost.get(r.host_id) ??
      { host_id: r.host_id, host_name: r.host?.name ?? null, replies: 0, input_tokens: 0, output_tokens: 0, est_cost: null, charged: 0, accrued: 0 };
    acc.replies += r.replies;
    acc.input_tokens += Number(r.input_tokens ?? 0);
    acc.output_tokens += Number(r.output_tokens ?? 0);
    if (r.charged_at) acc.charged += r.charged_amount ?? 0;
    else acc.accrued += Number(r.amount ?? 0);
    byHost.set(r.host_id, acc);
  }
  const rated = rates.in > 0 || rates.out > 0;
  return [...byHost.values()]
    .map((r) => ({
      ...r,
      est_cost: rated ? Math.round(((r.input_tokens * rates.in + r.output_tokens * rates.out) / 1_000_000) * 100) / 100 : null,
      accrued: Math.round(r.accrued * 100) / 100,
    }))
    .sort((a, b) => b.replies - a.replies);
}
