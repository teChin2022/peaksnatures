import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logEvent, EventType } from "@/lib/history-log";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    // Verify current password by attempting sign-in
    const sc = createServiceRoleClient();

    // Get admin email
    const { data: admin } = await sc
      .from("platform_admins")
      .select("email")
      .eq("user_id", user.id)
      .single();

    if (!admin) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    // Verify current password using a fresh sign-in attempt
    const verifyClient = createServiceRoleClient();
    const { error: signInError } = await verifyClient.auth.signInWithPassword({
      email: (admin as { email: string }).email,
      password: currentPassword,
    });

    if (signInError) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    // Update password using admin API
    const { error: updateError } = await sc.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error("[Admin ChangePassword] update error:", updateError);
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        entityType: "admin",
        entityId: user.id,
        eventType: EventType.PASSWORD_CHANGED,
        actorType: "admin",
        actorId: user.id,
        data: { email: (admin as { email: string }).email },
        req,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin ChangePassword] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
