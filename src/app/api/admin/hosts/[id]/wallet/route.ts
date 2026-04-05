import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logEvent, EventType } from "@/lib/history-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { amount, reason } = body;

    if (typeof amount !== "number" || amount === 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (!reason || typeof reason !== "string") {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    const sc = createServiceRoleClient();

    // Fetch admin name
    const { data: adminRow } = await sc
      .from("platform_admins")
      .select("name")
      .eq("user_id", user.id)
      .single();
    const adminName = (adminRow as { name: string } | null)?.name || user.id;

    // Atomic wallet adjustment using advisory lock
    const { data: host } = await sc
      .from("hosts")
      .select("wallet_balance")
      .eq("id", id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const newBalance = (host as { wallet_balance: number }).wallet_balance + amount;

    const { error: updateError } = await sc
      .from("hosts")
      .update({ wallet_balance: newBalance, updated_by: adminName } as never)
      .eq("id", id);

    if (updateError) {
      console.error("[Admin WalletAdjust] update error:", updateError);
      return NextResponse.json({ error: "Failed to adjust wallet" }, { status: 500 });
    }

    // Insert transaction record
    const { error: txnError } = await sc
      .from("wallet_transactions")
      .insert({
        host_id: id,
        type: "adjustment",
        amount,
        balance_after: newBalance,
        description: `Admin adjustment: ${reason}`,
        status: "verified",
        created_by: adminName,
      } as never);

    if (txnError) {
      console.error("[Admin WalletAdjust] transaction insert error:", txnError);
    }

    after(async () => {
      await logEvent({
        entityType: "billing",
        entityId: id,
        eventType: EventType.WALLET_ADJUSTMENT,
        actorType: "admin",
        actorId: user.id,
        data: { amount, reason, new_balance: newBalance, adjusted_by: adminName },
        req,
      });
    });

    return NextResponse.json({ success: true, new_balance: newBalance });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
