import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { host_id, endpoint, p256dh, auth, user_agent } = body;

    if (!host_id || !endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Missing required fields: host_id, endpoint, p256dh, auth" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Upsert: if same host+endpoint exists, update keys
    const { error } = await supabase
      .from("push_subscriptions" as never)
      .upsert(
        {
          host_id,
          endpoint,
          p256dh,
          auth,
          user_agent: user_agent || null,
        } as never,
        { onConflict: "host_id,endpoint" }
      );

    if (error) {
      console.error("[Push Subscribe] Upsert error:", error);
      return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[Push Subscribe] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { host_id } = body;

    if (!host_id) {
      return NextResponse.json({ error: "Missing host_id" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from("push_subscriptions" as never)
      .delete()
      .eq("host_id", host_id);

    if (error) {
      console.error("[Push Unsubscribe] Delete error:", error);
      return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[Push Unsubscribe] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
