import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const before = url.searchParams.get("before"); // cursor: created_at ISO string
    const eventType = url.searchParams.get("event_type");
    const entityType = url.searchParams.get("entity_type");
    const actorType = url.searchParams.get("actor_type");

    const sc = createServiceRoleClient();

    let query = sc
      .from("history_logs")
      .select("id, homestay_id, entity_type, entity_id, event_type, actor_type, actor_id, data, ip_address, created_at")
      .order("created_at", { ascending: false })
      .limit(limit + 1); // fetch one extra to determine hasMore

    if (before) {
      query = query.lt("created_at", before);
    }
    if (eventType) {
      query = query.eq("event_type", eventType);
    }
    if (entityType) {
      query = query.eq("entity_type", entityType);
    }
    if (actorType) {
      query = query.eq("actor_type", actorType);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error("[Admin Logs] query error:", error);
      return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
    }

    const typedLogs = (logs || []) as {
      id: string;
      homestay_id: string | null;
      entity_type: string;
      entity_id: string;
      event_type: string;
      actor_type: string;
      actor_id: string | null;
      data: Record<string, unknown>;
      ip_address: string | null;
      created_at: string;
    }[];

    const hasMore = typedLogs.length > limit;
    const items = hasMore ? typedLogs.slice(0, limit) : typedLogs;

    return NextResponse.json({
      data: items,
      hasMore,
      nextCursor: hasMore ? items[items.length - 1].created_at : null,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[Admin Logs] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
