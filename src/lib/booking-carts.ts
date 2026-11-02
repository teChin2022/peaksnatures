/**
 * A guest cart of N houses is N `bookings` rows sharing one `group_id`, paid with
 * one slip whose money `/api/bookings/group` splits across the rows in proportion
 * to price. The host and guest think of it as one booking, so the dashboard shows
 * it as one card and the cart emails add the rows back up.
 *
 * Import-free: the bookings page (client) and notifications.ts (server) both use it.
 */

/** Rows grouped into carts, each at its first row's position; a single booking is a cart of one. */
export function groupIntoCarts<T extends { id: string; group_id: string | null; room_name: string }>(
  rows: T[],
): T[][] {
  const carts = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.group_id ?? row.id;
    const cart = carts.get(key);
    if (cart) cart.push(row);
    else carts.set(key, [row]);
  }
  // A cart's rows share one created_at, so the server returns them in any order.
  // Sorting keeps the houses, and the one the buttons act through, in place.
  return [...carts.values()].map((cart) =>
    cart.sort((a, b) => a.room_name.localeCompare(b.room_name, "th") || a.id.localeCompare(b.id)),
  );
}

/**
 * A cart's money, added up from its rows. The rows always sum to the cart (the
 * split is largest-remainder), and unlike `booking_groups` they stay right after
 * a per-house balance payment, which updates only that house's row.
 */
export function cartMoney(
  cart: { total_price: number; discount_amount: number | null; amount_paid: number; payment_type: string }[],
) {
  let total = 0;
  let discount = 0;
  let paid = 0;
  let deposit = false;
  for (const b of cart) {
    total += b.total_price;
    discount += b.discount_amount ?? 0;
    paid += b.amount_paid;
    // pay-balance flips the house it settles to "full", so ask whether any house is still on deposit.
    if (b.payment_type === "deposit") deposit = true;
  }
  return { total, discount, paid, deposit };
}

interface HouseState {
  status: string;
  cancelled_by: string | null;
  check_in: string;
  check_out: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
}

const stateKey = (b: HouseState) =>
  [b.status, b.cancelled_by, b.check_in, b.check_out, !!b.checked_in_at, !!b.checked_out_at].join("|");

/**
 * True once a cart's houses have drifted apart: the guest cancelled or moved one
 * house, or one house checked in on its own. The card then shows dates and status
 * per house instead of once.
 */
export function housesDiffer(cart: HouseState[]): boolean {
  return cart.some((b) => stateKey(b) !== stateKey(cart[0]));
}

/**
 * The houses a cart's buttons act through. update-status cascades confirm and
 * cancel to every house in the cart, so one eligible house is enough; Mark
 * completed writes rows directly, so it takes every house that qualifies.
 * Pending wins over confirmed, as on a single booking, so a card never shows
 * two Cancel buttons.
 */
export function cartActionTargets<T extends { status: string; easyslip_verified: boolean; check_out: string }>(
  cart: T[],
  now: Date,
) {
  const pending =
    cart.find((b) => (b.status === "pending" || b.status === "verified") && !b.easyslip_verified) ?? null;
  const confirmed = pending ? null : (cart.find((b) => b.status === "confirmed") ?? null);
  const completable = confirmed
    ? cart.filter((b) => b.status === "confirmed" && new Date(b.check_out) <= now)
    : [];
  return { pending, confirmed, completable };
}

/** `a` plus the rows of `b` it does not already hold, by id. The first copy wins. */
export function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const seen = new Set(a.map((r) => r.id));
  const out = [...a];
  for (const r of b) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
