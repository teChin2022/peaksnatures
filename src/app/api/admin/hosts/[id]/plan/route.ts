import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logEvent, EventType } from "@/lib/history-log";

export async function PATCH(
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
    const { plan_type, plan_free_expires_at } = body;

    if (!plan_type || !["free", "commission", "fixed_rate"].includes(plan_type)) {
      return NextResponse.json({ error: "Invalid plan_type" }, { status: 400 });
    }

    const sc = createServiceRoleClient();

    // Fetch admin name
    const { data: adminRow } = await sc
      .from("platform_admins")
      .select("name")
      .eq("user_id", user.id)
      .single();
    const adminName = (adminRow as { name: string } | null)?.name || user.id;

    // Update host plan
    const updateData: Record<string, unknown> = {
      plan_type,
      updated_by: adminName,
    };

    if (plan_type === "free" && plan_free_expires_at) {
      updateData.plan_free_expires_at = plan_free_expires_at;
    } else if (plan_type !== "free") {
      updateData.plan_free_expires_at = null;
    }

    // Clear pending plan switch when admin sets plan directly
    updateData.plan_pending_type = null;
    updateData.plan_pending_effective_at = null;
    updateData.plan_pending_term_months = null;

    const { error: updateError } = await sc
      .from("hosts")
      .update(updateData as never)
      .eq("id", id);

    if (updateError) {
      console.error("[Admin SetPlan] update error:", updateError);
      return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: id,
        eventType: EventType.PLAN_CHANGED,
        actorType: "admin",
        actorId: user.id,
        data: { plan_type, plan_free_expires_at, set_by: adminName },
        req,
      });
    });

    return NextResponse.json({ success: true, plan_type });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
