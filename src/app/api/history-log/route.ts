import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/history-log";
import type { ActorType } from "@/lib/history-log";

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

    await logEvent({
      homestayId: homestay_id || null,
      entityType: entity_type,
      entityId: entity_id,
      eventType: event_type,
      actorType: actor_type || "host",
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
