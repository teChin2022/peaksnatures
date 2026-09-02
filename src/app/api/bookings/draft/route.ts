import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  draftExpiresAt,
  isStorableDraftPhone,
  normalizeDraftEmail,
  normalizeDraftPhone,
  type BookingDraftPayload,
} from "@/lib/booking-draft";

/**
 * Snapshots the booking form at the step 2 -> 3 transition so a guest who
 * switches to their banking app and never comes back can restore it with their
 * phone + email instead of retyping steps 1 and 2.
 *
 * Called fire-and-forget from the booking form, so this returns 204 on EVERY
 * path including failure — same contract as /api/demand. A background save must
 * never be able to surface an error on the booking page or delay the QR.
 */
const saveRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000, name: "booking-draft-save" });

const lineSchema = z.object({
  room_id: z.string().uuid(),
  num_guests: z.number().int().min(1).max(50),
  tier_ids: z.array(z.string().uuid()).max(20),
  option_ids: z.array(z.string().uuid()).max(20),
});

// Caps throughout: a draft is a convenience, not a place to accept arbitrary
// guest-supplied bulk.
const draftSchema = z.object({
  homestay_id: z.string().uuid(),
  guest_phone: z.string().min(1).max(30),
  guest_email: z.string().min(1).max(320),
  guest_name: z.string().min(1).max(200),
  guest_province: z.string().max(200).default(""),
  guest_note: z.string().max(2000).default(""),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(lineSchema).min(1).max(12),
  promo_code: z.string().max(64).nullable().default(null),
  payment_option: z.enum(["full", "deposit"]).default("full"),
  subtotal_at_save: z.number().int().min(0).default(0),
  locale: z.string().max(10).default("th"),
});

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  try {
    const rateLimited = await saveRateLimit.check(req);
    if (rateLimited) return rateLimited;

    const parsed = draftSchema.safeParse(await req.json());
    if (!parsed.success) return noContent();

    const d = parsed.data;
    if (d.check_out <= d.check_in) return noContent();

    // Normalised server-side, never trusted from the client. The phone rule
    // must match booking_holds.guest_phone exactly or migration 049's
    // same-phone takeover stops firing on restore.
    const guest_phone = normalizeDraftPhone(d.guest_phone);
    const guest_email = normalizeDraftEmail(d.guest_email);
    if (!isStorableDraftPhone(guest_phone) || !guest_email) return noContent();

    const supabase = createServiceRoleClient();

    // Retention is per-host. Same join shape as /api/bookings/search's
    // hosts(cancellation_days). One extra query, on a path the guest is not
    // waiting for.
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("hosts(booking_draft_hours)")
      .eq("id", d.homestay_id)
      .single();

    const hours =
      (homestayRow as unknown as { hosts: { booking_draft_hours: number } | null } | null)
        ?.hosts?.booking_draft_hours ?? 0;

    // 0 means the host turned the feature off: write nothing at all rather than
    // storing PII we have promised not to keep.
    if (hours <= 0) return noContent();

    const payload: BookingDraftPayload = {
      v: 1,
      guest: { name: d.guest_name, province: d.guest_province, note: d.guest_note },
      lines: d.lines,
      promo_code: d.promo_code,
      payment_option: d.payment_option,
      subtotal_at_save: d.subtotal_at_save,
      locale: d.locale,
    };

    // Upsert on the same three columns the lookup reads, so a guest who goes
    // back and forward refreshes their draft instead of accumulating rows.
    // Note this refreshes created_by as well; harmless, because the conflict key
    // pins the row to the same guest.
    const { error } = await supabase.from("booking_drafts").upsert(
      {
        homestay_id: d.homestay_id,
        guest_phone,
        guest_email,
        check_in: d.check_in,
        check_out: d.check_out,
        payload,
        expires_at: draftExpiresAt(hours, new Date()),
        created_by: d.guest_name,
        updated_by: d.guest_name,
      } as never,
      { onConflict: "homestay_id,guest_phone,guest_email" },
    );

    if (error) console.error("Booking draft save error:", error);
    return noContent();
  } catch (error) {
    console.error("Booking draft API error:", error);
    return noContent();
  }
}
