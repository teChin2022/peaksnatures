import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // Verify host is authenticated
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { host_id, endpoint, p256dh, auth, user_agent } = body;

    if (!host_id || !endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Missing required fields: host_id, endpoint, p256dh, auth" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Fetch host and verify ownership
    const { data: hostRow } = await supabase
      .from("hosts")
      .select("name, user_id")
      .eq("id", host_id)
      .single();
    const hostData = hostRow as { name: string; user_id: string } | null;

    if (!hostData || hostData.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hostName = hostData.name || host_id;

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
          created_by: hostName,
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
    // Verify host is authenticated
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { host_id } = body;

    if (!host_id) {
      return NextResponse.json({ error: "Missing host_id" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Verify ownership
    const { data: hostRow } = await supabase
      .from("hosts")
      .select("user_id")
      .eq("id", host_id)
      .single();

    if (!hostRow || (hostRow as { user_id: string }).user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
