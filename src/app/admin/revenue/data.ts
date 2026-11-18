import { createServiceRoleClient } from "@/lib/supabase/server";
import { billingTodayStr } from "@/lib/billing-dates";

export const REVENUE_MONTHS = 12;
const PAGE = 1000;

export interface RevenueMonth {
  /** YYYY-MM, a Bangkok calendar month */
  month: string;
  /** Commission charged to wallets (positive baht). */
  commission: number;
  /** Commission given back on cancellations (positive baht, subtracted from income). */
  refunds: number;
  /** Fixed Rate invoices paid in the month. */
  fixedRate: number;
  /** Admin wallet adjustments, signed. Shown, never counted as income. */
  adjustments: number;
  /** commission − refunds + fixedRate */
  income: number;
}

export interface PlatformRevenue {
  months: RevenueMonth[];
  /** Prepaid host money the platform holds (sum of positive wallets). */
  walletHeld: number;
  /** What hosts owe through negative wallets (positive baht). */
  walletOwed: number;
  /** Pending and overdue invoices not yet paid. */
  unpaidInvoices: number;
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

// shortcut: sums in JS over paged reads (PostgREST caps one read at its row limit);
// move to a SQL RPC when 12 months of wallet rows run into the tens of thousands.
async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await read(from, from + PAGE - 1);
    const page = (data as T[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** The last REVENUE_MONTHS Bangkok months, oldest first, ending with the current one. */
export function revenueMonthKeys(now: Date = new Date()): string[] {
  const [y, m] = billingTodayStr(now).split("-").map(Number);
  return Array.from({ length: REVENUE_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (REVENUE_MONTHS - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const monthOf = (iso: string) => billingTodayStr(new Date(iso)).slice(0, 7);

/**
 * Platform income by Bangkok month: commission net of refunds, plus Fixed Rate
 * invoices paid. Wallet top-ups are host money held, not income.
 */
export async function getPlatformRevenue(now: Date = new Date()): Promise<PlatformRevenue> {
  const sc: ServiceClient = createServiceRoleClient();
  const keys = revenueMonthKeys(now);
  // Midnight Bangkok on the 1st of the oldest month.
  const since = new Date(`${keys[0]}-01T00:00:00+07:00`).toISOString();

  const [walletRows, invoiceRows, hostRows, unpaidRows] = await Promise.all([
    readAll<{ id: string; type: string; amount: number; created_at: string }>((from, to) =>
      sc
        .from("wallet_transactions")
        .select("id, type, amount, created_at")
        .in("type", ["commission", "refund", "adjustment"])
        .eq("status", "verified")
        .gte("created_at", since)
        .order("id")
        .range(from, to),
    ),
    readAll<{ id: string; amount: number; paid_at: string }>((from, to) =>
      sc
        .from("invoices")
        .select("id, amount, paid_at")
        .eq("status", "paid")
        .gte("paid_at", since)
        .order("id")
        .range(from, to),
    ),
    readAll<{ id: string; wallet_balance: number | null }>((from, to) =>
      sc.from("hosts").select("id, wallet_balance").order("id").range(from, to),
    ),
    readAll<{ id: string; amount: number }>((from, to) =>
      sc.from("invoices").select("id, amount").in("status", ["pending", "overdue"]).order("id").range(from, to),
    ),
  ]);

  const byMonth = new Map<string, RevenueMonth>(
    keys.map((month) => [month, { month, commission: 0, refunds: 0, fixedRate: 0, adjustments: 0, income: 0 }]),
  );

  for (const t of walletRows) {
    const row = byMonth.get(monthOf(t.created_at));
    if (!row) continue;
    if (t.type === "commission") row.commission += -t.amount; // stored negative
    else if (t.type === "refund") row.refunds += t.amount;
    else row.adjustments += t.amount;
  }
  for (const inv of invoiceRows) {
    const row = byMonth.get(monthOf(inv.paid_at));
    if (row) row.fixedRate += inv.amount;
  }
  for (const row of byMonth.values()) row.income = row.commission - row.refunds + row.fixedRate;

  let walletHeld = 0;
  let walletOwed = 0;
  for (const h of hostRows) {
    const b = h.wallet_balance ?? 0;
    if (b > 0) walletHeld += b;
    else walletOwed += -b;
  }

  return {
    months: keys.map((k) => byMonth.get(k)!),
    walletHeld,
    walletOwed,
    unpaidInvoices: unpaidRows.reduce((sum, r) => sum + r.amount, 0),
  };
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "2026-11" → "Nov 2026" */
export function monthLabel(key: string): string {
  return MONTH_LABEL.format(new Date(`${key}-01T00:00:00Z`));
}
