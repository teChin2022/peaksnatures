import { NextResponse } from "next/server";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { allowsNormal, allowsQuick, guestBookingModeOf } from "@/lib/quick-booking";

/**
 * The gate shared by POST /api/bookings and POST /api/bookings/group for the
 * guest quick booking (see lib/quick-booking.ts). One copy, so the two routes
 * cannot drift apart on who may book which way.
 */

/**
 * Per IP. Generous on purpose: mobile carriers put many guests behind one
 * address, and the per-phone cap below is the targeted brake.
 */
export const quickBookingRateLimit = createRateLimiter({
  limit: 10,
  windowMs: 10 * 60_000,
  name: "bookings-quick",
});

/** Quick bookings (a cart counts once) one phone may have waiting on the host at a time. */
export const MAX_PENDING_QUICK = 2;

type Supabase = ReturnType<typeof createServiceRoleClient>;

interface GuardInput {
  supabase: Supabase;
  homestayId: string;
  /** `hosts.guest_booking_mode` as read with the homestay; undefined when the host row is missing. */
  hostMode: string | null | undefined;
  quick: boolean;
  /** Exactly the string the booking will store, so the cap below matches it. */
  guestPhone: string;
  turnstileToken: string | undefined;
}

const refuse = (status: number, code: string, error: string) =>
  NextResponse.json({ error, code }, { status });

/**
 * Null to carry on, or the response to return.
 *
 * Server side on purpose: hiding a button is not a gate. A host on `quick`
 * must not take a normal booking by POSTing straight to the route, and a host
 * on `normal` must not take a quick one.
 */
export async function guardGuestBookingMode({
  supabase,
  homestayId,
  hostMode,
  quick,
  guestPhone,
  turnstileToken,
}: GuardInput): Promise<NextResponse | null> {
  const mode = guestBookingModeOf({ guest_booking_mode: hostMode });

  if (!quick) {
    return allowsNormal(mode)
      ? null
      : refuse(403, "NORMAL_NOT_ENABLED", "This homestay takes quick bookings only");
  }
  if (!allowsQuick(mode)) {
    return refuse(403, "QUICK_NOT_ENABLED", "Quick booking is not available for this homestay");
  }

  // Fail-open, like every other Turnstile call site: only a token Cloudflare
  // positively rejects is refused.
  if ((await verifyTurnstileToken(turnstileToken ?? "")) === "fail") {
    return refuse(403, "TURNSTILE_FAILED", "Verification failed");
  }

  // Nothing is paid or verified, so each of these locks dates until the host
  // acts. Cap what one phone can leave waiting.
  const { data, error } = await supabase
    .from("bookings")
    .select("id, group_id")
    .eq("homestay_id", homestayId)
    .eq("guest_phone", guestPhone)
    .eq("status", "pending")
    .eq("easyslip_verified", false)
    .eq("booking_source", "guest")
    .is("payment_slip_hash", null)
    .limit(50);

  if (error) {
    // Fail open: a read error here must not stop a real guest booking.
    console.error("[quick-booking] pending-cap lookup failed:", error);
    return null;
  }

  const rows = (data ?? []) as unknown as { id: string; group_id: string | null }[];
  const waiting = new Set(rows.map((r) => r.group_id ?? r.id));
  if (waiting.size >= MAX_PENDING_QUICK) {
    return refuse(
      429,
      "TOO_MANY_PENDING",
      "You already have quick bookings waiting for the host to confirm",
    );
  }

  return null;
}
