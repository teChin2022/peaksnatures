/**
 * The only amounts a host may top up.
 *
 * Enforced in /api/host/wallet/topup — the `topup_wallet` RPC takes any INTEGER,
 * so the route is the single place the rule is real. The wallet page renders
 * this list as its preset buttons and offers no free-form amount.
 */
export const TOPUP_AMOUNTS = [500, 1000, 1500] as const;

export type TopupAmount = (typeof TOPUP_AMOUNTS)[number];

/** Narrowing guard for the untrusted amount arriving on a request. */
export function isTopupAmount(amount: number): amount is TopupAmount {
  return (TOPUP_AMOUNTS as readonly number[]).includes(amount);
}
