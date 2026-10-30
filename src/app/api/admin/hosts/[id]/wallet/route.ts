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

    // The wallet holds whole baht (INTEGER), as every other wallet write does.
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount === 0) {
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

    // Balance, ledger row and wallet_negative_since in one transaction, under
    // the host lock the other wallet RPCs take. Reading the balance here and
    // writing balance + amount back overwrote any commission deducted in
    // between, and never kept wallet_negative_since in step with the balance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error: adjustError } = await (sc.rpc as any)("adjust_wallet", {
      p_host_id: id,
      p_amount: amount,
      p_description: `Admin adjustment: ${reason}`,
      p_created_by: adminName,
    });

    if (adjustError) {
      console.error("[Admin WalletAdjust] RPC error:", adjustError);
      if (String(adjustError.message || "").includes("HOST_NOT_FOUND")) {
        return NextResponse.json({ error: "Host not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Failed to adjust wallet" }, { status: 500 });
    }

    const newBalance = (result as { new_balance: number }[])?.[0]?.new_balance ?? 0;

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
