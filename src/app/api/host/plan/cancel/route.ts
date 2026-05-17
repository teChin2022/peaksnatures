import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    const { data: host } = await sc
      .from("hosts")
      .select("id, plan_type, plan_pending_type, plan_pending_effective_at, name")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const typedHost = host as { id: string; plan_type: string; plan_pending_type: string | null; plan_pending_effective_at: string | null; name: string };

    if (!typedHost.plan_pending_type) {
      return NextResponse.json({ error: "No pending plan switch to cancel" }, { status: 400 });
    }

    const cancelledPlan = typedHost.plan_pending_type;

    const { error: updateError } = await sc
      .from("hosts")
      .update({
        plan_pending_type: null,
        plan_pending_effective_at: null,
        plan_pending_term_months: null,
        updated_by: typedHost.name,
      } as never)
      .eq("id", typedHost.id);

    if (updateError) {
      console.error("[Plan Cancel] update error:", updateError);
      return NextResponse.json({ error: "Failed to cancel plan switch" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: typedHost.id,
        eventType: EventType.PLAN_SWITCH_SCHEDULED,
        actorType: "host",
        actorId: user.id,
        data: {
          action: "cancelled",
          cancelled_plan: cancelledPlan,
          current_plan: typedHost.plan_type,
        },
        req,
      });
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
