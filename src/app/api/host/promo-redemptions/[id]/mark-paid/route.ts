import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Missing redemption id" }, { status: 400 });
    }

    const auth = await createServerSupabaseClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { paid_note?: string | null } = {};
    try {
      body = await req.json();
    } catch {
      // body is optional
    }

    const sc = createServiceRoleClient();

    // Verify ownership: redemption → promo_code → homestay → host.user_id === user.id
    const { data: redemptionRow } = await sc
      .from("promo_redemptions")
      .select("id, payout_status, promo_code:promo_codes(homestay:homestays(host:hosts(user_id, name)))")
      .eq("id", id)
      .maybeSingle();

    type RedemptionWithChain = {
      id: string;
      payout_status: "pending" | "paid" | "cancelled";
      promo_code: {
        homestay: {
          host: { user_id: string; name: string } | null;
        } | null;
      } | null;
    };
    const row = redemptionRow as unknown as RedemptionWithChain | null;
    if (!row) {
      return NextResponse.json({ error: "Redemption not found" }, { status: 404 });
    }
    const owner = row.promo_code?.homestay?.host;
    if (!owner || owner.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only pending → paid is allowed. Already-paid is a no-op (idempotent),
    // cancelled cannot be marked paid (would need a new flow).
    if (row.payout_status === "paid") {
      return NextResponse.json({ success: true, idempotent: true });
    }
    if (row.payout_status !== "pending") {
      return NextResponse.json(
        { error: "Only pending redemptions can be marked paid" },
        { status: 400 },
      );
    }

    const note = typeof body.paid_note === "string" ? body.paid_note.trim() : null;

    const { error: updateError } = await sc
      .from("promo_redemptions")
      .update({
        payout_status: "paid",
        paid_at: new Date().toISOString(),
        paid_note: note || null,
        updated_by: owner.name,
      } as never)
      .eq("id", id)
      .eq("payout_status", "pending");

    if (updateError) {
      console.error("[MarkPaid] Update failed:", updateError);
      return NextResponse.json({ error: "Failed to update redemption" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[MarkPaid] Error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
