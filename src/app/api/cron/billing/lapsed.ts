import { computeImmediateFixedRateInvoice, fixedRateStartDate } from "@/lib/billing-calc";
import type { Host, PlatformBillingConfig } from "@/types/database";
import type { CronBillingDates } from "./dates";

/**
 * The invoice the daily cron issues a Fixed Rate host whose term has run out,
 * or null when they are not due one.
 *
 * This used to run on the 1st only. A cron that missed the 1st billed no
 * monthly host that month, and a host who settled last month's overdue invoice
 * mid-month was never billed for the current one — the 1st had skipped them
 * for owing, and the next 1st billed the next month. Now any day that finds a
 * lapsed term bills it.
 *
 * Always the whole current month, whatever day the host is caught. It is
 * priced exactly like the host's own re-activation, which fixedRateStartDate
 * also puts on the 1st, so waiting for this and paying up front cost the same.
 * (The one exception is fixedRateStartDate's: a term that ended mid-month is
 * billed from the day after, never twice for days it already covered.)
 *
 * Kept out of route.ts so it is testable without the whole Supabase surface.
 */
export function lapsedTermInvoice(
  host: Pick<Host, "fixed_rate_override" | "fixed_rate_term_ends_at">,
  hasOpenInvoice: boolean,
  config: PlatformBillingConfig,
  dates: Pick<CronBillingDates, "todayDate" | "today" | "lapsedTermDueDate">,
) {
  // Mid-term hosts already paid upfront. A term is active on its last day.
  if (host.fixed_rate_term_ends_at && host.fixed_rate_term_ends_at >= dates.today) return null;
  // Never stack a second bill on an unpaid one: that invoice already blocks
  // them, and the month they settle it in is billed the day after.
  if (hasOpenInvoice) return null;

  return {
    ...computeImmediateFixedRateInvoice(
      host,
      config,
      1,
      fixedRateStartDate({ ...host, plan_type: "fixed_rate" }, dates.todayDate),
    ),
    due_date: dates.lapsedTermDueDate,
  };
}
