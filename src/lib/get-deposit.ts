import type { Host } from "@/types/database";

/**
 * Resolve the deposit amount for a booking based on the check-in date.
 * Looks up deposit_by_month[month] first, falls back to deposit_amount.
 * Returns 0 if deposit is not configured for that month.
 */
export function getDepositForMonth(
  host: Pick<Host, "deposit_amount" | "deposit_by_month">,
  checkInDate: Date | undefined
): number {
  if (!checkInDate) return host.deposit_amount || 0;

  const month = String(checkInDate.getMonth() + 1); // 1-12

  if (host.deposit_by_month && month in host.deposit_by_month) {
    return host.deposit_by_month[month] ?? 0;
  }

  return host.deposit_amount || 0;
}
