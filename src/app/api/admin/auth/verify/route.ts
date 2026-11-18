import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";

// Called once per admin sign-in, right after the OTP, so each 200 is a login.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const { data: admin } = await serviceClient
      .from("platform_admins")
      .select("id, name, email")
      .eq("user_id", user.id)
      .single();

    if (!admin) {
      // actor "system": the caller is not an admin, and history_logs only allows guest/host/admin/system.
      after(() =>
        logEvent({
          entityType: "admin",
          entityId: user.id,
          eventType: EventType.ADMIN_ACCESS_DENIED,
          actorType: "system",
          data: { user_id: user.id },
          req,
        }),
      );
      return NextResponse.json(
        { error: "Not a platform admin" },
        { status: 403 }
      );
    }

    after(() =>
      logEvent({
        entityType: "admin",
        entityId: user.id,
        eventType: EventType.ADMIN_LOGIN,
        actorType: "admin",
        actorId: user.id,
        data: { email: (admin as { email: string }).email },
        req,
      }),
    );

    return NextResponse.json({ admin });
  } catch (error) {
    console.error("[Admin Auth] verify error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
