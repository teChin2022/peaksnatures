import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { sendHostRejectionEmail } from "@/lib/notifications";
import { logEvent, EventType } from "@/lib/history-log";

export async function DELETE(
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

    // Get host with user_id for auth deletion
    const { data: host, error: fetchError } = await sc
      .from("hosts")
      .select("id, user_id, name, email, status")
      .eq("id", id)
      .single();

    if (fetchError || !host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const hostRow = host as { id: string; user_id: string; name: string; email: string; status: string };

    // Log + send rejection email before deleting (fire-and-forget)
    logEvent({
      entityType: "host",
      entityId: id,
      eventType: EventType.HOST_REJECTED,
      actorType: "admin",
      actorId: user.id,
      data: { host_name: hostRow.name, host_email: hostRow.email },
      req,
    }).catch(() => {});

    sendHostRejectionEmail(hostRow.email, hostRow.name).catch((err) =>
      console.error("[Admin Reject] email error:", err)
    );

    // Delete host record
    const { error: deleteError } = await sc
      .from("hosts")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[Admin Reject] delete host error:", deleteError);
      return NextResponse.json({ error: "Failed to delete host" }, { status: 500 });
    }

    // Delete login OTPs
    await sc
      .from("login_otps")
      .delete()
      .eq("email", hostRow.email);

    // Delete auth user
    const { error: authDeleteError } = await sc.auth.admin.deleteUser(hostRow.user_id);
    if (authDeleteError) {
      console.error("[Admin Reject] delete auth user error:", authDeleteError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Reject] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
