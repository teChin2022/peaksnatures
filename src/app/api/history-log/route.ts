import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import type { ActorType } from "@/lib/history-log";

const ALLOWED_CLIENT_EVENTS = new Set<string>([
  EventType.HOST_LOGOUT,
  EventType.BOOKING_CONFIRMED,
  EventType.BOOKING_CANCELLED,
  EventType.CHECKOUT,
  EventType.BOOKING_DATE_CHANGE_APPROVED,
  EventType.BOOKING_DATE_CHANGE_REJECTED,
  EventType.ROOM_CREATED,
  EventType.ROOM_UPDATED,
  EventType.ROOM_DELETED,
  EventType.PRICE_UPDATED,
  EventType.PROPERTY_CREATED,
  EventType.PROPERTY_UPDATED,
  EventType.PROFILE_UPDATED,
]);

/**
 * POST /api/history-log
 * Client-side pages (dashboard) call this to log events.
 * Requires authenticated host user.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      homestay_id,
      entity_type,
      entity_id,
      event_type,
      actor_type,
      data,
    } = body as {
      homestay_id?: string;
      entity_type: string;
      entity_id: string;
      event_type: string;
      actor_type?: ActorType;
      data?: Record<string, unknown>;
    };

    if (!entity_type || !entity_id || !event_type) {
      return NextResponse.json(
        { error: "entity_type, entity_id, and event_type are required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_CLIENT_EVENTS.has(event_type)) {
      return NextResponse.json(
        { error: "Event type not allowed from client" },
        { status: 400 }
      );
    }

    await logEvent({
      homestayId: homestay_id || null,
      entityType: entity_type,
      entityId: entity_id,
      eventType: event_type,
      actorType: "host" as ActorType,
      actorId: user.id,
      data: data || {},
      req,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to log event" },
      { status: 500 }
    );
  }
}
