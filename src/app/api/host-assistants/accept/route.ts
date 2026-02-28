import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

// POST — accept a pending invitation (called by the assistant after login/register)
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    // Find pending invitations for this user's email
    const { data: pendingInvites, error: fetchError } = await serviceClient
      .from("host_assistants")
      .select("id")
      .eq("email", user.email!)
      .eq("status", "pending");

    if (fetchError || !pendingInvites || pendingInvites.length === 0) {
      return NextResponse.json({ invites: 0 });
    }

    // Activate all pending invitations for this email
    const ids = (pendingInvites as { id: string }[]).map((i) => i.id);
    const { error: updateError } = await serviceClient
      .from("host_assistants")
      .update({
        user_id: user.id,
        status: "active",
        accepted_at: new Date().toISOString(),
      } as never)
      .in("id", ids);

    if (updateError) {
      console.error("Accept assistant invites error:", updateError);
      return NextResponse.json(
        { error: "Failed to accept invitations" },
        { status: 500 }
      );
    }

    return NextResponse.json({ invites: ids.length, success: true });
  } catch (error) {
    console.error("POST /api/host-assistants/accept error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
