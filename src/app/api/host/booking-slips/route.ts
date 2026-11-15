import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { slipStoragePath } from "@/lib/slip-path";

const schema = z.object({ booking_ids: z.array(z.string().uuid()).min(1).max(100) });

/** Same lifetime the dashboard used when it signed slips itself. */
const SIGNED_URL_SECONDS = 60 * 60;

/**
 * POST /api/host/booking-slips — signed URLs for the payment slips of the
 * signed-in host's own bookings.
 *
 * The dashboard used to sign slip paths in the browser, which needed a storage
 * policy letting every signed-in user read every slip in the bucket, any
 * tenant's (security audit 2026-11-15, F-09; policy dropped in migration 078).
 * Ownership is by booking: only bookings at this host's homestays are read,
 * and only their slips are signed.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    const { data: host } = await sc.from("hosts").select("id").eq("user_id", user.id).single();
    if (!host) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: homestayRows } = await sc
      .from("homestays")
      .select("id")
      .eq("host_id", (host as { id: string }).id);
    const homestayIds = ((homestayRows as { id: string }[] | null) ?? []).map((h) => h.id);
    if (homestayIds.length === 0) {
      return NextResponse.json({ urls: {} }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const { data: bookingRows } = await sc
      .from("bookings")
      .select("id, payment_slip_url")
      .in("id", parsed.data.booking_ids)
      .in("homestay_id", homestayIds);

    const slips = ((bookingRows as { id: string; payment_slip_url: string | null }[] | null) ?? [])
      .map((b) => ({ id: b.id, path: slipStoragePath(b.payment_slip_url) }))
      .filter((s): s is { id: string; path: string } => s.path !== null);

    const urls: Record<string, string> = {};
    if (slips.length > 0) {
      const { data: signed } = await sc.storage
        .from("payment-slips")
        .createSignedUrls(slips.map((s) => s.path), SIGNED_URL_SECONDS);
      slips.forEach((s, i) => {
        const url = signed?.[i]?.signedUrl;
        if (url) urls[s.id] = url;
      });
    }

    return NextResponse.json({ urls }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[BookingSlips] Error:", error);
    return NextResponse.json({ error: "Failed to sign slips" }, { status: 500 });
  }
}
