/**
 * A host's monthly profit summary: booking income − platform charges − the
 * expenses they record (/dashboard/expenses, /api/host/expenses).
 *
 * Import-free, like billing-dates.ts, so the client page can share the
 * categories and the month maths.
 */

/** Must match the CHECK on host_expenses.category (migration 083). */
export const EXPENSE_CATEGORIES = ["utilities", "wages", "laundry", "supplies", "maintenance", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Same income rule as the dashboard overview (src/app/dashboard/page.tsx): change both together. */
export const REVENUE_STATUSES = ["confirmed", "completed"] as const;

/** Wallet rows that are platform charges: commissions (negative) and their refunds (positive). */
export const PLATFORM_FEE_TX_TYPES = ["commission", "refund"] as const;

/** YYYY-MM, months 01–12. */
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month `delta` months from `month` (YYYY-MM). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * A Bangkok calendar month as half-open bounds: DATE columns compare against
 * from/to, TIMESTAMPTZ columns against fromTs/toTs. The timestamps carry +07:00
 * so a payment at 00:30 on the 1st lands in the new month, not the old UTC one.
 */
export function monthBounds(month: string) {
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  return { from, to, fromTs: `${from}T00:00:00+07:00`, toTs: `${to}T00:00:00+07:00` };
}

export interface MonthSummaryInput {
  bookings: { total_price: number }[];
  walletRows: { amount: number }[];
  invoices: { amount: number }[];
  expenses: { category: string; amount: number }[];
}

export interface MonthSummary {
  revenue: number;
  /** Net commission: refunds of earlier commissions lower it. */
  commission: number;
  /** Fixed Rate invoices paid this month. */
  planFees: number;
  totalExpenses: number;
  net: number;
}

// Satang precision; `+ 0` turns -0 into 0 so it never renders as "-0".
const round2 = (n: number) => Math.round(n * 100) / 100 + 0;
const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

/** Sums rows the route has already narrowed to the month. */
export function summarizeMonth({ bookings, walletRows, invoices, expenses }: MonthSummaryInput): MonthSummary {
  const revenue = round2(bookings.reduce((s, b) => s + Number(b.total_price), 0));
  const commission = round2(-sum(walletRows));
  const planFees = round2(sum(invoices));
  const totalExpenses = round2(sum(expenses));
  return {
    revenue,
    commission,
    planFees,
    totalExpenses,
    net: round2(revenue - commission - planFees - totalExpenses),
  };
}
