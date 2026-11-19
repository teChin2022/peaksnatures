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
  replies_today: number;
}

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
    createServiceRoleClient().from("platform_guest_ai_config").select("enabled, daily_cap, price_per_reply").maybeSingle(),
    todaysUsage(),
  ]);
  if (!data) return null;
  const { enabled, daily_cap, price_per_reply } = data as { enabled: boolean; daily_cap: number; price_per_reply: number | string | null };
  return {
    enabled,
    daily_cap,
    // NUMERIC arrives as a string from PostgREST.
    price_per_reply: Number(price_per_reply ?? 0),
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
