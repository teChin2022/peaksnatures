import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Event names live in an import-free module so "use client" pages can list them.
export { EventType, type EventTypeValue } from "@/lib/history-event-types";

// ============================================================
// Actor types
// ============================================================
export type ActorType = "guest" | "host" | "admin" | "system";

// ============================================================
// logEvent — server-side helper for API routes
// ============================================================
export interface LogEventParams {
  homestayId?: string | null;
  entityType: string;
  entityId: string;
  eventType: string;
  actorType: ActorType;
  actorId?: string | null;
  data?: Record<string, unknown>;
  req?: NextRequest | null;
  ipAddress?: string | null;
}

export async function logEvent(params: LogEventParams): Promise<void> {
  try {
    const supabase = createServiceRoleClient();

    // Extract IP from request if available
    let ip = params.ipAddress || null;
    if (!ip && params.req) {
      ip =
        params.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        params.req.headers.get("x-real-ip") ||
        null;
    }

    await supabase.from("history_logs").insert({
      homestay_id: params.homestayId || null,
      entity_type: params.entityType,
      entity_id: params.entityId,
      event_type: params.eventType,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      data: params.data || {},
      ip_address: ip,
    } as never);
  } catch (error) {
    // Never let logging failures break the main flow
    console.error("[HistoryLog] Failed to log event:", error);
  }
}

// ============================================================
// getClientIp — extract IP from NextRequest
// ============================================================
export function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}
