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

    const body = await req.json();
    const { plan_type } = body;

    if (!plan_type || !["commission", "fixed_rate"].includes(plan_type)) {
      return NextResponse.json({ error: "Invalid plan type. Choose commission or fixed_rate." }, { status: 400 });
    }

    const sc = createServiceRoleClient();

    const { data: host } = await sc
      .from("hosts")
      .select("id, plan_type, name, plan_free_expires_at")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const typedHost = host as {
      id: string;
      plan_type: string;
      name: string;
      plan_free_expires_at: string | null;
    };

    if (typedHost.plan_type === plan_type) {
      return NextResponse.json({ error: "Already on this plan" }, { status: 400 });
    }

    // Free hosts already past expiry switch immediately (applied inline, no
    // booking gap, no wait for cron). Everyone else schedules for 1st of next
    // month and the cron applies it.
    const now = new Date();
    const isPastFreeExpiry =
      typedHost.plan_type === "free" &&
      typedHost.plan_free_expires_at !== null &&
      new Date(typedHost.plan_free_expires_at) < now;

    if (isPastFreeExpiry) {
      const { error: applyError } = await sc
        .from("hosts")
        .update({
          plan_type,
          plan_pending_type: null,
          plan_pending_effective_at: null,
          plan_free_expires_at: null,
          updated_by: typedHost.name,
        } as never)
        .eq("id", typedHost.id);

      if (applyError) {
        console.error("[Plan Switch] apply error:", applyError);
        return NextResponse.json({ error: "Failed to switch plan" }, { status: 500 });
      }

      after(async () => {
        await logEvent({
          entityType: "host",
          entityId: typedHost.id,
          eventType: EventType.PLAN_CHANGED,
          actorType: "host",
          actorId: user.id,
          data: { from: typedHost.plan_type, to: plan_type, immediate: true },
          req,
        });
      });

      return NextResponse.json({
        success: true,
        plan_type,
        applied_immediately: true,
      });
    }

    const effectiveDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .split("T")[0];

    const { error: updateError } = await sc
      .from("hosts")
      .update({
        plan_pending_type: plan_type,
        plan_pending_effective_at: effectiveDate,
        updated_by: typedHost.name,
      } as never)
      .eq("id", typedHost.id);

    if (updateError) {
      console.error("[Plan Switch] update error:", updateError);
      return NextResponse.json({ error: "Failed to schedule plan switch" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: typedHost.id,
        eventType: EventType.PLAN_SWITCH_SCHEDULED,
        actorType: "host",
        actorId: user.id,
        data: {
          current_plan: typedHost.plan_type,
          new_plan: plan_type,
          effective_date: effectiveDate,
        },
        req,
      });
    });

    return NextResponse.json({
      success: true,
      plan_pending_type: plan_type,
      plan_pending_effective_at: effectiveDate,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
