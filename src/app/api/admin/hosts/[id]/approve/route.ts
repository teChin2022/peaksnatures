import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { sendHostApprovalEmail } from "@/lib/notifications";
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

    // Get host
    const { data: host, error: fetchError } = await sc
      .from("hosts")
      .select("id, name, email, status")
      .eq("id", id)
      .single();

    if (fetchError || !host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const hostRow = host as { id: string; name: string; email: string; status: string };

    if (hostRow.status === "approved") {
      return NextResponse.json({ error: "Host is already approved" }, { status: 400 });
    }

    // Update status
    const { error: updateError } = await sc
      .from("hosts")
      .update({ status: "approved", updated_by: adminName } as never)
      .eq("id", id);

    if (updateError) {
      console.error("[Admin Approve] update error:", updateError);
      return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
    }

    // Log + send approval email in background
    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: id,
        eventType: EventType.HOST_APPROVED,
        actorType: "admin",
        actorId: user.id,
        data: { host_name: hostRow.name, host_email: hostRow.email },
        req,
      });
    });

    sendHostApprovalEmail(hostRow.email, hostRow.name).catch((err) =>
      console.error("[Admin Approve] email error:", err)
    );

    return NextResponse.json({ id, status: "approved" });
  } catch (error) {
    console.error("[Admin Approve] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
