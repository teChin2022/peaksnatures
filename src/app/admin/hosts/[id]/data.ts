import { createServiceRoleClient } from "@/lib/supabase/server";
import { HOST_BLOCK_COLUMNS, hostBlockStateFrom, type HostBlockRow } from "@/lib/billing";
import { isHostBlocked } from "@/lib/plan-expiry";
import { fetchHostLogs, hostLogScope } from "@/lib/host-logs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How far back each list on the page reaches. */
export const DETAIL_LIMITS = { wallet: 50, invoices: 24, bookings: 20, logs: 30 } as const;

export interface AdminHost extends HostBlockRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  is_verified: boolean;
  created_at: string;
  commission_pct_override: number | null;
  quick_commission_pct_override: number | null;
  fixed_rate_override: number | null;
  fixed_rate_term_months: number | null;
  fixed_rate_term_ends_at: string | null;
}

export interface AdminHostDetail {
  host: AdminHost;
  blocked: boolean;
  homestays: { id: string; name: string; slug: string; is_active: boolean }[];
  staff: { id: string; name: string; email: string; created_at: string }[];
  wallet: {
    id: string;
    type: string;
    amount: number;
    balance_after: number;
    description: string | null;
    status: string;
    created_at: string;
    created_by: string;
  }[];
  invoices: {
    id: string;
    amount: number;
    period_start: string;
    period_end: string;
    status: string;
    due_date: string;
    paid_at: string | null;
    term_months: number;
  }[];
  bookings: {
    id: string;
    guest_name: string;
    check_in: string;
    check_out: string;
    total_price: number;
    status: string;
    booking_source: string;
    created_at: string;
  }[];
  logs: { id: string; event_type: string; actor_type: string; created_at: string }[];
}

/**
 * Everything the admin host page shows, read with the service role. The caller
 * must already have checked isAdmin. Returns null for an unknown or malformed id.
 */
export async function getAdminHostDetail(hostId: string): Promise<AdminHostDetail | null> {
  if (!UUID.test(hostId)) return null;
  const sc = createServiceRoleClient();

  const { data: hostRow } = await sc
    .from("hosts")
    .select(
      `id, user_id, name, email, phone, status, is_verified, created_at, commission_pct_override, quick_commission_pct_override, fixed_rate_override, fixed_rate_term_months, fixed_rate_term_ends_at, ${HOST_BLOCK_COLUMNS}`,
    )
    .eq("id", hostId)
    .maybeSingle();
  if (!hostRow) return null;
  const host = hostRow as AdminHost;

  const [homestaysRes, staffRes, walletRes, invoicesRes, blockState] = await Promise.all([
    sc.from("homestays").select("id, name, slug, is_active").eq("host_id", hostId),
    sc.from("host_staff").select("id, name, email, created_at").eq("host_id", hostId).order("created_at"),
    sc
      .from("wallet_transactions")
      .select("id, type, amount, balance_after, description, status, created_at, created_by")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false })
      .limit(DETAIL_LIMITS.wallet),
    sc
      .from("invoices")
      .select("id, amount, period_start, period_end, status, due_date, paid_at, term_months")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false })
      .limit(DETAIL_LIMITS.invoices),
    // The same state the booking routes gate on, so "blocked" here means blocked there.
    hostBlockStateFrom(hostId, host, sc),
  ]);

  const homestays = (homestaysRes.data as AdminHostDetail["homestays"]) || [];
  const invoices = (invoicesRes.data as AdminHostDetail["invoices"]) || [];
  const homestayIds = homestays.map((h) => h.id);
  const logScope = hostLogScope(host, invoices.map((i) => i.id), homestayIds);

  const [bookingsRes, logsRes] = await Promise.all([
    homestayIds.length
      ? sc
          .from("bookings")
          .select("id, guest_name, check_in, check_out, total_price, status, booking_source, created_at")
          .in("homestay_id", homestayIds)
          .order("created_at", { ascending: false })
          .limit(DETAIL_LIMITS.bookings)
      : Promise.resolve({ data: [] }),
    fetchHostLogs<AdminHostDetail["logs"][number]>(sc, logScope, "id, event_type, actor_type, created_at", {
      limit: DETAIL_LIMITS.logs,
    }),
  ]);
  const logs = logsRes.rows;

  return {
    host,
    blocked: isHostBlocked(blockState),
    homestays,
    staff: (staffRes.data as AdminHostDetail["staff"]) || [],
    wallet: (walletRes.data as AdminHostDetail["wallet"]) || [],
    invoices,
    bookings: (bookingsRes.data as AdminHostDetail["bookings"]) || [],
    logs,
  };
}

