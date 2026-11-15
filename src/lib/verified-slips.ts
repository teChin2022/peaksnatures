import type { createServiceRoleClient } from "@/lib/supabase/server";
import { validateReceiver, type EasySlipV2RawSlip } from "@/lib/easyslip";
import type { Json } from "@/types/database";

/**
 * Server-side record of guest slips EasySlip accepted (migration 077).
 *
 * /api/verify-slip records what it read off the slip; the routes that take a
 * guest's money (POST /api/bookings, /group, /pay-balance) claim it. Nothing
 * the browser says about a slip is trusted: a booking is confirmed only when
 * the server's own record shows the amount the server charges, paid to this
 * host, and not used before.
 */

type Supabase = ReturnType<typeof createServiceRoleClient>;

/** Checkout uses a slip seconds after verifying it; an hour is generous. */
export const VERIFIED_SLIP_TTL_MS = 60 * 60 * 1000;

export interface VerifiedSlipFacts {
  slipHash: string;
  transRef: string | null;
  /** The amount on the slip, as EasySlip read it. */
  amount: number;
  receiver: EasySlipV2RawSlip["receiver"] | null;
}

/**
 * Keep what EasySlip read. Never overwrites an existing row, so re-verifying
 * a slip cannot reset consumed_at. A failed write is logged, not thrown: the
 * booking then simply lands pending for the host, which is the safe side.
 */
export async function recordVerifiedSlip(supabase: Supabase, facts: VerifiedSlipFacts): Promise<void> {
  const { error } = await supabase.from("verified_slips").upsert(
    {
      slip_hash: facts.slipHash,
      trans_ref: facts.transRef,
      amount: facts.amount,
      receiver: facts.receiver as unknown as Json,
    } as never,
    { onConflict: "slip_hash", ignoreDuplicates: true },
  );
  if (error) console.error("[VerifiedSlips] record failed:", error);
}

export interface ClaimInput {
  slipHash: string;
  /** What the server charges for this payment, in baht. */
  amount: number;
  /** The receiving host's accounts, from the database. */
  promptpayId: string | null;
  bankAccountNumber: string | null;
}

/**
 * True when the slip is fresh, unused, for exactly `amount`, and paid to this
 * host — and it is now marked used. False otherwise, including on any read
 * error: the caller then treats the payment as unverified.
 */
export async function claimVerifiedSlip(supabase: Supabase, input: ClaimInput): Promise<boolean> {
  const { data, error } = await supabase
    .from("verified_slips")
    .select("amount, receiver, verified_at, consumed_at")
    .eq("slip_hash", input.slipHash)
    .maybeSingle();
  if (error || !data) return false;

  const slip = data as unknown as {
    amount: number | string;
    receiver: EasySlipV2RawSlip["receiver"] | null;
    verified_at: string;
    consumed_at: string | null;
  };
  if (slip.consumed_at) return false;
  if (Date.now() - new Date(slip.verified_at).getTime() > VERIFIED_SLIP_TTL_MS) return false;
  if (Number(slip.amount) !== input.amount) return false;
  if (!slip.receiver || !validateReceiver({ receiver: slip.receiver }, input.promptpayId, input.bankAccountNumber)) {
    return false;
  }

  // Conditional on consumed_at still being null, so of two requests racing
  // with one slip only one gets the row back.
  const { data: claimed } = await supabase
    .from("verified_slips")
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq("slip_hash", input.slipHash)
    .is("consumed_at", null)
    .select("slip_hash")
    .maybeSingle();
  return !!claimed;
}

/** Undo a claim when the booking it was for could not be created. */
export async function releaseVerifiedSlip(supabase: Supabase, slipHash: string): Promise<void> {
  const { error } = await supabase
    .from("verified_slips")
    .update({ consumed_at: null } as never)
    .eq("slip_hash", slipHash);
  if (error) console.error("[VerifiedSlips] release failed:", error);
}
