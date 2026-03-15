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
    const sc = createServiceRoleClient();

    // Fetch admin name for audit trail
    const { data: adminRow } = await sc
      .from("platform_admins")
      .select("name")
      .eq("user_id", user.id)
      .single();
    const adminName = (adminRow as { name: string } | null)?.name || user.id;

    // Get current status
    const { data: homestay, error: fetchError } = await sc
      .from("homestays")
      .select("id, is_active")
      .eq("id", id)
      .single();

    if (fetchError || !homestay) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    const current = homestay as { id: string; is_active: boolean };
    const newStatus = !current.is_active;

    const { error: updateError } = await sc
      .from("homestays")
      .update({ is_active: newStatus, updated_by: adminName } as never)
      .eq("id", id);

    if (updateError) {
      console.error("[Admin Toggle] update error:", updateError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    // Log toggle in background
    after(async () => {
      await logEvent({
        homestayId: id,
        entityType: "homestay",
        entityId: id,
        eventType: EventType.PROPERTY_TOGGLED,
        actorType: "admin",
        actorId: user.id,
        data: { previous_is_active: current.is_active, new_is_active: newStatus },
        req,
      });
    });

    return NextResponse.json({ id, is_active: newStatus });
  } catch (error) {
    console.error("[Admin Toggle] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
