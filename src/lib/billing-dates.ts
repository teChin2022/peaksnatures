/**
 * Billing calendar helpers shared by the server and the dashboard.
 *
 * Deliberately import-free, like wallet-thresholds.ts. These are read from
 * `"use client"` pages as well as from API routes and the cron, and
 * @/lib/billing cannot be imported from the client — it reaches
 * @/lib/supabase/server (next/headers) and @/lib/notifications (ioredis), both
 * of which fail to bundle for the browser. @/lib/billing re-exports everything
 * here, so server code can keep importing it from there.
 *
 * Anything that decides what "today" is for billing belongs in this file. Two
 * copies of that question drifting apart is what let the dashboard quote a
 * host a different forfeited-days figure than the one the server logged.
 */

/**
 * The zone the platform's billing calendar runs on. Hosts, guests and the bank
 * slips are all in Thailand, so "today" has to mean today in Bangkok.
 */
export const BILLING_TIME_ZONE = "Asia/Bangkok";

const billingDateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: BILLING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Today on the billing calendar, as a Date pinned to UTC midnight.
 *
 * Callers hand this to computeImmediateFixedRateInvoice, which reads it back
 * with getUTCFullYear/getUTCMonth/getUTCDate — so the UTC parts have to *be*
 * the Bangkok calendar parts.
 *
 * Reading `now.getUTC*()` directly instead is what charged a host who paid at
 * 01:00 on 1 September a one-day proration stub for 31 August: Vercel runs in
 * UTC, where it was still August for another six hours. The browser has the
 * same hazard from the other side — `toISOString()` is UTC whatever the user's
 * clock says — so the zone is named explicitly rather than left to local time,
 * and the result is identical on both.
 */
export function billingToday(now: Date = new Date()): Date {
  const parts = billingDateParts.formatToParts(now);
  const part = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

/**
 * billingToday as YYYY-MM-DD — the form that compares directly against the
 * DATE columns (fixed_rate_term_ends_at, due_date, period_end).
 */
export function billingTodayStr(now?: Date): string {
  return billingToday(now).toISOString().split("T")[0];
}

/**
 * PostgREST filter for "this invoice is blocking the host".
 *
 * Two ways an invoice blocks:
 *  - status = 'overdue' — either the cron flipped it, or an admin marked it
 *    overdue by hand (which stays a working lever even before the due date).
 *  - status = 'pending' and the due date has passed — the block is driven by
 *    due_date directly rather than waiting on the cron, so a missed or failed
 *    cron run can't hand a non-paying host extra free days.
 *
 * `due_date < today` means an invoice due on the 5th still allows bookings on
 * the 5th and blocks them from the 6th onwards — where "the 6th" starts at
 * midnight in Bangkok, the same boundary the due date itself was written on.
 * Defaulting this to UTC instead handed the host seven extra hours past their
 * own midnight before the block took effect.
 *
 * The dashboard shell shows its blocked banner off this same filter, so the
 * banner and the actual block can never disagree about which invoices count.
 */
export function blockingInvoiceFilter(today = billingTodayStr()): string {
  return `status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`;
}
