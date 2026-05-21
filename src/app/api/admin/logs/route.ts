import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

type LogRow = {
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
};

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
    const before = url.searchParams.get("before");
    const eventType = url.searchParams.get("event_type");
    const entityType = url.searchParams.get("entity_type");
    const actorType = url.searchParams.get("actor_type");

    const sc = createServiceRoleClient();

    let query = sc
      .from("history_logs")
      .select("id, homestay_id, entity_type, entity_id, event_type, actor_type, actor_id, data, ip_address, created_at")
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (before) query = query.lt("created_at", before);
    if (eventType) query = query.eq("event_type", eventType);
    if (entityType) query = query.eq("entity_type", entityType);
    if (actorType) query = query.eq("actor_type", actorType);

    const { data: logs, error } = await query;

    if (error) {
      console.error("[Admin Logs] query error:", error);
      return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
    }

    const typedLogs = (logs || []) as LogRow[];
    const hasMore = typedLogs.length > limit;
    const items = hasMore ? typedLogs.slice(0, limit) : typedLogs;

    // ============================================================
    // Batch-resolve entity_id → label per entity_type
    // ============================================================
    const idsBy = (type: string) =>
      [...new Set(items.filter((l) => l.entity_type === type).map((l) => l.entity_id))];

    const bookingIds = idsBy("booking");
    const homestayIds = idsBy("homestay");
    const roomIds = idsBy("room");
    const hostEntityIds = idsBy("host");

    // Actor IDs split by actor_type
    const hostActorIds = [
      ...new Set(items.filter((l) => l.actor_type === "host" && l.actor_id).map((l) => l.actor_id as string)),
    ];
    const adminActorIds = [
      ...new Set(items.filter((l) => l.actor_type === "admin" && l.actor_id).map((l) => l.actor_id as string)),
    ];

    // Homestay IDs from log context (for room/blocked_date/seasonal_price context)
    const contextHomestayIds = [
      ...new Set(items.map((l) => l.homestay_id).filter((id): id is string => !!id)),
    ];
    const allHomestayIds = [...new Set([...homestayIds, ...contextHomestayIds])];

    const [
      bookingsRes,
      homestaysRes,
      roomsRes,
      hostsByIdRes,
      hostsByUserRes,
      adminsByUserRes,
    ] = await Promise.all([
      bookingIds.length
        ? sc.from("bookings").select("id, guest_name, homestay_id").in("id", bookingIds)
        : Promise.resolve({ data: [] as { id: string; guest_name: string; homestay_id: string }[] }),
      allHomestayIds.length
        ? sc.from("homestays").select("id, name").in("id", allHomestayIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      roomIds.length
        ? sc.from("rooms").select("id, name, homestay_id").in("id", roomIds)
        : Promise.resolve({ data: [] as { id: string; name: string; homestay_id: string }[] }),
      hostEntityIds.length
        ? sc.from("hosts").select("id, name").in("id", hostEntityIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      hostActorIds.length
        ? sc.from("hosts").select("user_id, name").in("user_id", hostActorIds)
        : Promise.resolve({ data: [] as { user_id: string; name: string }[] }),
      adminActorIds.length
        ? sc.from("platform_admins").select("user_id, name, email").in("user_id", adminActorIds)
        : Promise.resolve({ data: [] as { user_id: string; name: string; email: string }[] }),
    ]);

    const homestayNameMap = new Map<string, string>();
    for (const h of (homestaysRes.data || []) as { id: string; name: string }[]) {
      homestayNameMap.set(h.id, h.name);
    }
    const bookingMap = new Map<string, { guest_name: string; homestay_id: string }>();
    for (const b of (bookingsRes.data || []) as { id: string; guest_name: string; homestay_id: string }[]) {
      bookingMap.set(b.id, { guest_name: b.guest_name, homestay_id: b.homestay_id });
    }
    const roomMap = new Map<string, { name: string; homestay_id: string }>();
    for (const r of (roomsRes.data || []) as { id: string; name: string; homestay_id: string }[]) {
      roomMap.set(r.id, { name: r.name, homestay_id: r.homestay_id });
    }
    const hostByIdMap = new Map<string, string>();
    for (const h of (hostsByIdRes.data || []) as { id: string; name: string }[]) {
      hostByIdMap.set(h.id, h.name);
    }
    const hostByUserMap = new Map<string, string>();
    for (const h of (hostsByUserRes.data || []) as { user_id: string; name: string }[]) {
      hostByUserMap.set(h.user_id, h.name);
    }
    const adminByUserMap = new Map<string, { name: string; email: string }>();
    for (const a of (adminsByUserRes.data || []) as { user_id: string; name: string; email: string }[]) {
      adminByUserMap.set(a.user_id, { name: a.name, email: a.email });
    }

    const data = items.map((l) => {
      // entity_label
      let entity_label: string;
      let entity_context: string | null = null;
      switch (l.entity_type) {
        case "booking": {
          const b = bookingMap.get(l.entity_id);
          entity_label = b ? `Booking · ${b.guest_name}` : "Booking";
          entity_context = b ? homestayNameMap.get(b.homestay_id) || null : null;
          break;
        }
        case "homestay": {
          const name = homestayNameMap.get(l.entity_id);
          entity_label = name ? `Homestay · ${name}` : "Homestay";
          break;
        }
        case "room": {
          const r = roomMap.get(l.entity_id);
          entity_label = r ? `Room · ${r.name}` : "Room";
          entity_context = r ? homestayNameMap.get(r.homestay_id) || null : null;
          break;
        }
        case "host": {
          const name = hostByIdMap.get(l.entity_id);
          entity_label = name ? `Host · ${name}` : "Host";
          break;
        }
        case "review":
          entity_label = "Review";
          entity_context = l.homestay_id ? homestayNameMap.get(l.homestay_id) || null : null;
          break;
        case "blocked_date":
          entity_label = "Blocked date";
          entity_context = l.homestay_id ? homestayNameMap.get(l.homestay_id) || null : null;
          break;
        case "seasonal_price":
          entity_label = "Seasonal price";
          entity_context = l.homestay_id ? homestayNameMap.get(l.homestay_id) || null : null;
          break;
        default:
          entity_label = l.entity_type;
      }

      // actor_label
      let actor_label: string;
      switch (l.actor_type) {
        case "system":
          actor_label = "System";
          break;
        case "guest": {
          // Guest actors don't have an actor_id; if the entity is a booking, use guest_name
          const b = l.entity_type === "booking" ? bookingMap.get(l.entity_id) : null;
          actor_label = b ? b.guest_name : "Guest";
          break;
        }
        case "host":
          actor_label = (l.actor_id && hostByUserMap.get(l.actor_id)) || "Host";
          break;
        case "admin": {
          const a = l.actor_id ? adminByUserMap.get(l.actor_id) : null;
          actor_label = a ? a.name || a.email : "Admin";
          break;
        }
        default:
          actor_label = l.actor_type;
      }

      return {
        id: l.id,
        entity_type: l.entity_type,
        event_type: l.event_type,
        actor_type: l.actor_type,
        entity_label,
        entity_context,
        actor_label,
        data: l.data,
        ip_address: l.ip_address,
        created_at: l.created_at,
      };
    });

    return NextResponse.json({
      data,
      hasMore,
      nextCursor: hasMore ? data[data.length - 1].created_at : null,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[Admin Logs] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
