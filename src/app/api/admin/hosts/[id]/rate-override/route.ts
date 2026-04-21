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
    const { commission_pct_override, fixed_rate_override } = body;

    const sc = createServiceRoleClient();

    const [{ data: adminRow }, { data: prevRow }] = await Promise.all([
      sc.from("platform_admins").select("name").eq("user_id", user.id).single(),
      sc
        .from("hosts")
        .select("commission_pct_override, fixed_rate_override")
        .eq("id", id)
        .single(),
    ]);
    const adminName = (adminRow as { name: string } | null)?.name || user.id;
    const previous = (prevRow as {
      commission_pct_override: number | null;
      fixed_rate_override: number | null;
    } | null) || { commission_pct_override: null, fixed_rate_override: null };

    const updateData: Record<string, unknown> = { updated_by: adminName };

    if (commission_pct_override !== undefined) {
      updateData.commission_pct_override = commission_pct_override;
    }
    if (fixed_rate_override !== undefined) {
      updateData.fixed_rate_override = fixed_rate_override;
    }

    const { error: updateError } = await sc
      .from("hosts")
      .update(updateData as never)
      .eq("id", id);

    if (updateError) {
      console.error("[Admin RateOverride] update error:", updateError);
      return NextResponse.json({ error: "Failed to update rate override" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: id,
        eventType: EventType.RATE_OVERRIDE_CHANGED,
        actorType: "admin",
        actorId: user.id,
        data: {
          previous: {
            commission_pct_override: previous.commission_pct_override,
            fixed_rate_override: previous.fixed_rate_override,
          },
          new: {
            commission_pct_override:
              commission_pct_override !== undefined
                ? commission_pct_override
                : previous.commission_pct_override,
            fixed_rate_override:
              fixed_rate_override !== undefined
                ? fixed_rate_override
                : previous.fixed_rate_override,
          },
          set_by: adminName,
        },
        req,
      });
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
