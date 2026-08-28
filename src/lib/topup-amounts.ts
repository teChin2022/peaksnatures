/**
 * The only amounts a host may top up.
 *
 * Enforced in /api/host/wallet/topup — the `topup_wallet` RPC takes any INTEGER,
 * so the route is the single place the rule is real. The wallet page and the
 * billing sheet render this list as their preset buttons; neither offers a
 * free-form amount.
 */
export const TOPUP_AMOUNTS = [1000, 2000, 3000] as const;

export type TopupAmount = (typeof TOPUP_AMOUNTS)[number];

/** Narrowing guard for the untrusted amount arriving on a request. */
export function isTopupAmount(amount: number): amount is TopupAmount {
  return (TOPUP_AMOUNTS as readonly number[]).includes(amount);
}
