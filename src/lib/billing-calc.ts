/**
 * Fixed-rate pricing arithmetic, shared by the server and the dashboards.
 *
 * Deliberately import-free apart from types (erased at build), like
 * billing-dates.ts and wallet-thresholds.ts. These are read from `"use client"`
 * pages as well as from API routes and the cron, and @/lib/billing cannot be
 * imported from the client — it reaches @/lib/supabase/server (next/headers)
 * and @/lib/notifications (ioredis), both of which fail to bundle for the
 * browser. @/lib/billing re-exports everything here, so server code can keep
 * importing it from there.
 *
 * Anything that decides what a host is charged belongs in this file. The admin
 * "Set Plan" dialog and the host's own term picker both quote a term before it
 * is bought; a second copy of the formula drifting from the one the route
 * invoices with is exactly the bug this placement prevents.
 */

import type { FixedRateTermTier, Host, PlatformBillingConfig } from "@/types/database";

/**
 * Get the effective commission percentage for a host.
 * Uses per-host override if set, otherwise falls back to global config.
 */
export function getEffectiveCommissionPct(
  host: Pick<Host, "commission_pct_override">,
  config: PlatformBillingConfig,
): number {
  return host.commission_pct_override || config.commission_pct;
}

/**
 * Get the effective fixed rate for a host.
 * Uses per-host override if set, otherwise falls back to global config.
 */
export function getEffectiveFixedRate(
  host: Pick<Host, "fixed_rate_override">,
  config: PlatformBillingConfig,
): number {
  return host.fixed_rate_override || config.fixed_rate_amount;
}

function getTermTiers(config: PlatformBillingConfig): FixedRateTermTier[] {
  return Array.isArray(config.fixed_rate_term_tiers)
    ? (config.fixed_rate_term_tiers as FixedRateTermTier[])
    : [];
}

export function getFixedRateDiscount(
  months: number,
  config: PlatformBillingConfig,
): number {
  const tier = getTermTiers(config).find((t) => Number(t.months) === months);
  return tier ? Number(tier.discount_pct) : 0;
}

export function isValidTermMonths(
  months: number,
  config: PlatformBillingConfig,
): boolean {
  return getTermTiers(config).some((t) => Number(t.months) === months);
}

/**
 * Compute one upfront invoice covering `months` calendar months starting at
 * `startDate`. The amount is `monthly_rate × months × (1 − discount%)`.
 * `period_end` is the last day of the (startDate.month + months - 1) month.
 */
export function computeFixedRateInvoice(
  host: Pick<Host, "fixed_rate_override">,
  config: PlatformBillingConfig,
  months: number,
  startDate: Date,
): {
  amount: number;
  period_start: string;
  period_end: string;
  term_months: number;
  discount_pct: number;
} {
  const monthly = getEffectiveFixedRate(host, config);
  const discount = getFixedRateDiscount(months, config);
  const amount = Math.round(monthly * months * (1 - discount / 100));
  const period_start = startDate.toISOString().split("T")[0];
  const end = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months, 0),
  );
  const period_end = end.toISOString().split("T")[0];
  return { amount, period_start, period_end, term_months: months, discount_pct: discount };
}

/**
 * Compute the single upfront invoice for a plan change that takes effect TODAY.
 *
 * Unlike computeFixedRateInvoice — which anchors a term to its own start date
 * and is still what a renewal uses — this splits the charge in two so the host
 * always lands back on the platform's calendar-month billing cycle:
 *
 *   stub — `startDate` through the end of that month, prorated by day and
 *          charged at the undiscounted monthly rate.
 *   term — whole discounted months, starting the 1st of the next month.
 *
 * `months === 1` means "put me on monthly billing", not "sell me one prepaid
 * month": it buys the stub alone, and the 1st-of-month cron run then issues the
 * next month's invoice as it does for every other fixed-rate host. Only
 * months > 1 prepays, which is also the only case carrying a term discount.
 *
 * Starting on the 1st there is no partial period at all, so it is an ordinary
 * term — delegated to computeFixedRateInvoice so the discount applies to every
 * month rather than being lost on a full-month "stub".
 */
export function computeImmediateFixedRateInvoice(
  host: Pick<Host, "fixed_rate_override">,
  config: PlatformBillingConfig,
  months: number,
  startDate: Date,
): {
  amount: number;
  stub_amount: number;
  term_amount: number;
  period_start: string;
  period_end: string;
  term_months: number;
  discount_pct: number;
  /** Days in the prorated stub. 0 when startDate is the 1st (no stub at all). */
  prorated_days: number;
  days_in_month: number;
} {
  const year = startDate.getUTCFullYear();
  const month = startDate.getUTCMonth();
  const dayOfMonth = startDate.getUTCDate();
  const days_in_month = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  if (dayOfMonth === 1) {
    const base = computeFixedRateInvoice(host, config, months, startDate);
    return {
      ...base,
      stub_amount: 0,
      term_amount: base.amount,
      prorated_days: 0,
      days_in_month,
    };
  }

  const monthly = getEffectiveFixedRate(host, config);
  const prorated_days = days_in_month - dayOfMonth + 1;
  const stub_amount = Math.round((monthly * prorated_days) / days_in_month);

  const prepaidMonths = months === 1 ? 0 : months;
  const discount_pct = prepaidMonths > 0 ? getFixedRateDiscount(months, config) : 0;
  const term_amount = Math.round(monthly * prepaidMonths * (1 - discount_pct / 100));

  // prepaidMonths === 0 collapses to the last day of startDate's own month, so
  // one expression covers both shapes.
  const end = new Date(Date.UTC(year, month + 1 + prepaidMonths, 0));

  return {
    amount: stub_amount + term_amount,
    stub_amount,
    term_amount,
    period_start: startDate.toISOString().split("T")[0],
    period_end: end.toISOString().split("T")[0],
    term_months: months,
    discount_pct,
    prorated_days,
    days_in_month,
  };
}
