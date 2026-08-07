import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Missing promo code id" }, { status: 400 });
    }

    const auth = await createServerSupabaseClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    // Verify ownership: promo_code → homestay → host.user_id === user.id
    const { data: codeRow } = await sc
      .from("promo_codes")
      .select("id, code, homestay:homestays(host:hosts(user_id, name))")
      .eq("id", id)
      .maybeSingle();

    type CodeWithChain = {
      id: string;
      code: string;
      homestay: {
        host: { user_id: string; name: string } | null;
      } | null;
    };
    const row = codeRow as unknown as CodeWithChain | null;
    if (!row) {
      return NextResponse.json({ error: "Promo code not found" }, { status: 404 });
    }
    const owner = row.homestay?.host;
    if (!owner || owner.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only unpaid commission blocks deletion. A redemption sitting at 'pending'
    // with zero commission is never payable (no Mark Paid flow exists for ฿0),
    // so it must not block — otherwise codes without a recommender could never
    // be deleted. Same predicate as the "pending payouts" KPI on the dashboard.
    const { data: blockingRows, error: blockingError } = await sc
      .from("promo_redemptions")
      .select("commission_amount")
      .eq("promo_code_id", id)
      .eq("payout_status", "pending")
      .gt("commission_amount", 0);

    if (blockingError) {
      console.error("[DeletePromoCode] Payout lookup failed:", blockingError);
      return NextResponse.json({ error: "Failed to delete promo code" }, { status: 500 });
    }

    const blocking = (blockingRows as { commission_amount: number }[] | null) || [];
    if (blocking.length > 0) {
      return NextResponse.json(
        {
          error: "PENDING_PAYOUT",
          pendingCount: blocking.length,
          pendingAmount: blocking.reduce((sum, r) => sum + Number(r.commission_amount || 0), 0),
        },
        { status: 409 },
      );
    }

    // Settled redemptions (paid / cancelled / zero-commission) cascade away with
    // the code — the host is warned about that count in the confirm dialog.
    const { error: deleteError } = await sc.from("promo_codes").delete().eq("id", id);

    if (deleteError) {
      console.error("[DeletePromoCode] Delete failed:", deleteError);
      return NextResponse.json({ error: "Failed to delete promo code" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DeletePromoCode] Error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
