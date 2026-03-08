import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { sendHostApprovalEmail } from "@/lib/notifications";

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
      .update({ status: "approved" } as never)
      .eq("id", id);

    if (updateError) {
      console.error("[Admin Approve] update error:", updateError);
      return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
    }

    // Send approval email (fire-and-forget)
    sendHostApprovalEmail(hostRow.email, hostRow.name).catch((err) =>
      console.error("[Admin Approve] email error:", err)
    );

    return NextResponse.json({ id, status: "approved" });
  } catch (error) {
    console.error("[Admin Approve] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
