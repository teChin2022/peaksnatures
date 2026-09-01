import { billingToday } from "@/lib/billing-dates";

/**
 * Every date the daily billing cron works from, derived once from one instant.
 *
 * Split out of route.ts so the arithmetic is testable on its own: the route
 * needs a service-role client, notifications and the whole Supabase surface
 * mocked before it will run, which is why these fifteen dates went unexercised
 * for as long as they did.
 *
 * All of them are anchored to `billingToday()` — the Bangkok calendar — not to
 * `now.getUTC*()`. The two agree only because vercel.json runs this at
 * `0 0 * * *` UTC, which is 07:00 the same day in Bangkok; moving the schedule
 * past 17:00 UTC would have shifted every window, both invoice periods and the
 * monthly trigger by a day, with nothing here to catch it. Anchoring to the
 * billing calendar makes the schedule a scheduling decision again.
 */
export interface CronBillingDates {
  /** UTC-midnight Date on the Bangkok calendar. The anchor for everything else. */
  todayDate: Date;
  today: string;
  tomorrow: string;
  /** Free-plan expiry warning window: [in3Days, in3DaysNext). */
  in3Days: string;
  in3DaysNext: string;
  /** Fixed-rate term pre-expiry window: [in7Days, in7DaysNext). */
  in7Days: string;
  in7DaysNext: string;
  /** Grace-period reminder window: [ago5Days, ago5DaysNext). */
  ago5Days: string;
  ago5DaysNext: string;
  /** Invoices due in 2 days get the "pay now" warning. */
  dueWarnDay: string;
  /** due_date for an invoice raised today. */
  dueInFiveDays: string;
  isFirstOfMonth: boolean;
  /** 1st of the current month — monthly invoice period_start. */
  monthStart: string;
  /** Last day of the current month — monthly invoice period_end. */
  monthEnd: string;
  /** 5th of the current month — monthly invoice due_date. */
  monthDueDate: string;
}

/** `base` shifted by whole days, as YYYY-MM-DD. */
function dayStr(base: Date, offset: number): string {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset),
  )
    .toISOString()
    .split("T")[0];
}

/** A fixed day-of-month in `base`'s month, shifted by whole months. */
function monthDayStr(base: Date, monthOffset: number, day: number): string {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, day))
    .toISOString()
    .split("T")[0];
}

export function cronBillingDates(now: Date = new Date()): CronBillingDates {
  const todayDate = billingToday(now);

  return {
    todayDate,
    today: dayStr(todayDate, 0),
    tomorrow: dayStr(todayDate, 1),
    in3Days: dayStr(todayDate, 3),
    in3DaysNext: dayStr(todayDate, 4),
    in7Days: dayStr(todayDate, 7),
    in7DaysNext: dayStr(todayDate, 8),
    ago5Days: dayStr(todayDate, -5),
    ago5DaysNext: dayStr(todayDate, -4),
    dueWarnDay: dayStr(todayDate, 2),
    dueInFiveDays: dayStr(todayDate, 5),
    isFirstOfMonth: todayDate.getUTCDate() === 1,
    monthStart: monthDayStr(todayDate, 0, 1),
    // Day 0 of next month is the last day of this one.
    monthEnd: monthDayStr(todayDate, 1, 0),
    monthDueDate: monthDayStr(todayDate, 0, 5),
  };
}
