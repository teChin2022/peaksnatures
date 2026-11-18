export type WalletDirection = "add" | "deduct";

/**
 * The signed amount the wallet route expects, from the dialog's direction and a
 * positive whole-baht entry, plus the balance it would leave. Null while the
 * entry is not a whole number above zero.
 */
export function walletAdjustment(
  balance: number,
  entry: string,
  direction: WalletDirection,
): { amount: number; after: number } | null {
  if (!/^\d+$/.test(entry.trim())) return null;
  const n = parseInt(entry, 10);
  if (n === 0) return null;
  const amount = direction === "deduct" ? -n : n;
  return { amount, after: balance + amount };
}
