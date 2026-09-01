import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { billingTodayStr } from "@/lib/billing-dates";
import {
  isStorableDraftPhone,
  normalizeDraftEmail,
  normalizeDraftPhone,
  type BookingDraftPayload,
} from "@/lib/booking-draft";

/**
 * Hands a saved booking form back to the guest who abandoned it.
 *
 * POST, not GET, on purpose: the phone and email must not end up in a URL,
 * where they reach access logs, Referer headers and browser history.
 *
 * The lookup key is phone AND email. A phone number on its own is guessable;
 * the pair is not. Everything that is not an exact hit — unknown phone, wrong
 * email, expired draft, dates already past — returns the SAME { found: false }
 * with 200, so this endpoint cannot be used to discover whether a given number
 * has a booking in progress.
 */
const lookupRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000, name: "booking-draft-lookup" });

const lookupSchema = z.object({
  homestay_id: z.string().uuid(),
  phone: z.string().min(1).max(30),
  email: z.string().min(1).max(320),
  turnstileToken: z.string().optional(),
});

const NOT_FOUND = { found: false } as const;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

const notFound = () => NextResponse.json(NOT_FOUND, { headers: PRIVATE_HEADERS });

export async function POST(req: NextRequest) {
  try {
    const rateLimited = await lookupRateLimit.check(req);
    if (rateLimited) return rateLimited;

    const parsed = lookupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Fail-open, like every other Turnstile call site: only an explicit "fail"
    // blocks. It is the control that actually bites here — a per-IP limiter does
    // nothing against enumeration that queries each number once from a
    // different address.
    const captcha = await verifyTurnstileToken(parsed.data.turnstileToken || "");
    if (captcha === "fail") {
      return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 403 });
    }

    const phone = normalizeDraftPhone(parsed.data.phone);
    const email = normalizeDraftEmail(parsed.data.email);
    // A typo is a user state, not a fault — same answer as a miss.
    if (!isStorableDraftPhone(phone) || !email) return notFound();

    const supabase = createServiceRoleClient();

    // Exact equality on all three columns, never `like`: the `%digits%` match in
    // /api/bookings/search will hit any row containing the query as a substring.
    // The expires_at filter is what makes correctness independent of the nightly
    // sweep — a draft the cron has not collected yet is still invisible here.
    const { data, error } = await supabase
      .from("booking_drafts")
      .select("check_in, check_out, guest_email, payload, updated_at")
      .eq("homestay_id", parsed.data.homestay_id)
      .eq("guest_phone", phone)
      .eq("guest_email", email)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      console.error("Booking draft lookup error:", error);
      return notFound();
    }
    if (!data) return notFound();

    const draft = data as unknown as {
      check_in: string;
      check_out: string;
      guest_email: string;
      payload: BookingDraftPayload;
      updated_at: string;
    };

    // Neither acquire_booking_hold nor create_booking_atomic guards against a
    // past check-in — only the client calendar does — so restoring a stale draft
    // would book a night that has already gone. Bangkok calendar, never UTC.
    if (draft.check_in < billingTodayStr()) return notFound();

    const p = draft.payload ?? ({} as BookingDraftPayload);

    // Built field by field, never spread. A `...draft` here would leak the row
    // id, homestay_id, guest_phone and expires_at the first time a column is
    // added. The exact key set is pinned by a test.
    return NextResponse.json(
      {
        found: true,
        check_in: draft.check_in,
        check_out: draft.check_out,
        guest: {
          name: p.guest?.name ?? "",
          email: draft.guest_email,
          province: p.guest?.province ?? "",
          note: p.guest?.note ?? "",
        },
        lines: p.lines ?? [],
        promo_code: p.promo_code ?? null,
        payment_option: p.payment_option ?? "full",
        subtotal_at_save: p.subtotal_at_save ?? 0,
        saved_at: draft.updated_at,
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("Booking draft lookup API error:", error);
    return notFound();
  }
}
