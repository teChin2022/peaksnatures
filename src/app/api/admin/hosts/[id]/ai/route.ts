import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logEvent, EventType } from "@/lib/history-log";
import { notifyHostAlert } from "@/lib/notifications";
import { HOST_AI_COLUMNS, adminAiDecisionSchema, nextAiStatus, type AdminAiAction } from "@/lib/host-ai";
import type { HostAiStatus } from "@/types/database";

const ACTION_EVENT: Record<AdminAiAction, string> = {
  approve: EventType.GUEST_AI_APPROVED,
  reject: EventType.GUEST_AI_REJECTED,
  suspend: EventType.GUEST_AI_SUSPENDED,
  resume: EventType.GUEST_AI_RESUMED,
};

/** What the host is told, by LINE / SMS / email (notifyHostAlert). */
const HOST_MESSAGE: Record<AdminAiAction, { text: string; subject: string }> = {
  approve: { text: "อนุมัติผู้ช่วย AI ของแขกแล้ว เปิดใช้ได้ที่เมนูผู้ช่วย AI", subject: "อนุมัติผู้ช่วย AI แล้ว" },
  reject: { text: "คำขอผู้ช่วย AI ของแขกยังไม่ได้รับอนุมัติ ติดต่อทีมงานได้", subject: "คำขอผู้ช่วย AI ไม่ได้รับอนุมัติ" },
  suspend: { text: "ผู้ช่วย AI ของแขกถูกระงับชั่วคราว ติดต่อทีมงานได้", subject: "ผู้ช่วย AI ถูกระงับ" },
  resume: { text: "ผู้ช่วย AI ของแขกกลับมาใช้ได้แล้ว", subject: "ผู้ช่วย AI กลับมาใช้ได้" },
};

interface HostAlertRow {
  name: string | null;
  phone: string | null;
  email: string | null;
  notification_preference: string | null;
  line_channel_access_token: string | null;
  line_user_id: string | null;
}

/**
 * PATCH /api/admin/hosts/[id]/ai — approve, reject, suspend or resume a host's
 * guest AI assistant, and/or set its daily reply cap. Body:
 * `{ action?: "approve" | "reject" | "suspend" | "resume", daily_reply_cap?: 0–1000 }`.
 * 404 when the host never asked; 409 when the action does not apply to the
 * current status (also when another admin changed it in between).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = adminAiDecisionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { action, daily_reply_cap } = parsed.data;

    const { id } = await params;
    const sc = createServiceRoleClient();

    const { data: row } = await sc.from("host_ai_settings").select("status, daily_reply_cap").eq("host_id", id).maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "No request from this host" }, { status: 404 });
    }
    const current = (row as { status: HostAiStatus; daily_reply_cap: number }).status;
    const previousCap = (row as { daily_reply_cap: number }).daily_reply_cap;

    const next = action ? nextAiStatus(action, current) : current;
    if (!next) {
      return NextResponse.json({ error: `Cannot ${action} from ${current}` }, { status: 409 });
    }

    const { data: adminRow } = await sc.from("platform_admins").select("name").eq("user_id", user.id).single();
    const adminName = (adminRow as { name: string } | null)?.name || user.id;
    const now = new Date().toISOString();

    const { data, error } = await sc
      .from("host_ai_settings")
      .update({
        ...(action ? { status: next, decided_at: now, decided_by: adminName } : {}),
        ...(daily_reply_cap !== undefined ? { daily_reply_cap } : {}),
        updated_at: now,
      } as never)
      .eq("host_id", id)
      // The status read above: another admin's decision in between makes this match nothing.
      .eq("status", current)
      .select(HOST_AI_COLUMNS)
      .maybeSingle();
    if (error) {
      console.error("[Admin Host AI] update error:", error);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Status changed, reload" }, { status: 409 });
    }

    const { data: host } = await sc
      .from("hosts")
      .select("name, phone, email, notification_preference, line_channel_access_token, line_user_id")
      .eq("id", id)
      .maybeSingle();
    const hostRow = host as HostAlertRow | null;

    after(async () => {
      const base = { host_name: hostRow?.name ?? null, admin_name: adminName };
      if (action) {
        await logEvent({
          entityType: "host",
          entityId: id,
          eventType: ACTION_EVENT[action],
          actorType: "admin",
          actorId: user.id,
          data: { ...base, from: current, to: next },
          req,
        });
      }
      if (daily_reply_cap !== undefined && daily_reply_cap !== previousCap) {
        await logEvent({
          entityType: "host",
          entityId: id,
          eventType: EventType.GUEST_AI_CAP_CHANGED,
          actorType: "admin",
          actorId: user.id,
          data: { ...base, from: previousCap, to: daily_reply_cap },
          req,
        });
      }
      if (action && hostRow) {
        try {
          await notifyHostAlert(hostRow, HOST_MESSAGE[action].text, HOST_MESSAGE[action].subject);
        } catch (err) {
          console.error("[Admin Host AI] notify failed:", err);
        }
      }
    });

    return NextResponse.json({ settings: data });
  } catch (error) {
    console.error("[Admin Host AI] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
