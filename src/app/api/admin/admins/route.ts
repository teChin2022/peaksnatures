import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { EventType } from "@/lib/history-log";

export interface AdminListItem {
  id: string;
  name: string;
  email: string;
  created_at: string;
  /** LINE alerts configured; the token itself never leaves the server. */
  line_alerts: boolean;
  /** Latest ADMIN_LOGIN, logged since 2026-11-18; null before that. */
  last_login_at: string | null;
}

/** GET /api/admin/admins: read-only list of platform admins. Adding or removing one stays in SQL. */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();
    const { data: admins, error } = await sc
      .from("platform_admins")
      .select("id, user_id, name, email, created_at, line_user_id, line_channel_access_token")
      .order("created_at");
    if (error) {
      console.error("[Admin Admins] query error:", error);
      return NextResponse.json({ error: "Failed to fetch admins" }, { status: 500 });
    }

    const rows = (admins ?? []) as {
      id: string;
      user_id: string;
      name: string;
      email: string;
      created_at: string;
      line_user_id: string | null;
      line_channel_access_token: string | null;
    }[];

    const { data: logins } = rows.length
      ? await sc
          .from("history_logs")
          .select("entity_id, created_at")
          .eq("event_type", EventType.ADMIN_LOGIN)
          .in("entity_id", rows.map((a) => a.user_id))
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [] };
    const lastLogin = new Map<string, string>();
    for (const l of (logins ?? []) as { entity_id: string; created_at: string }[]) {
      if (!lastLogin.has(l.entity_id)) lastLogin.set(l.entity_id, l.created_at);
    }

    const data: AdminListItem[] = rows.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      created_at: a.created_at,
      line_alerts: !!(a.line_user_id && a.line_channel_access_token),
      last_login_at: lastLogin.get(a.user_id) ?? null,
    }));

    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Admin Admins] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
