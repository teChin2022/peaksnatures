import { format, subDays } from "date-fns";

/**
 * Which cancellation line the checkout's review step shows. Every booking gets
 * one, so a guest never pays without knowing whether they can cancel online.
 *
 * Same cut-off as /api/bookings/cancel: a guest may cancel while
 * days-to-check-in >= cancellation_days, so the last free day is check-in
 * minus N, and 0 days means guests cannot cancel on the site at all. Nothing
 * here speaks of refunds: the platform has no refund rule to state.
 */
export type CancellationNote =
  | { kind: "free"; deadline: Date }
  | { kind: "passed"; days: number }
  | { kind: "none" };

/** `todayStr` is Bangkok's today as YYYY-MM-DD (billingTodayStr). */
export function cancellationNote(cancellationDays: number, checkIn: Date, todayStr: string): CancellationNote {
  if (cancellationDays <= 0) return { kind: "none" };
  const deadline = subDays(checkIn, cancellationDays);
  return format(deadline, "yyyy-MM-dd") >= todayStr
    ? { kind: "free", deadline }
    : { kind: "passed", days: cancellationDays };
}
