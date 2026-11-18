import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logEvent, EventType } from "@/lib/history-log";

const idSchema = z.string().uuid();
const bodySchema = z.object({ note: z.string().trim().max(500).optional() });

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !(await isAdmin(user.id))) return null;
  return user;
}

/**
 * POST: mark a PLATFORM_PAYMENT_REJECTED entry settled (082). Only a marker:
 * the money is settled by hand elsewhere (wallet adjust, invoice status, plan).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = idSchema.safeParse((await params).id);
    const body = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!id.success || !body.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const note = body.data.note || null;

    const sc = createServiceRoleClient();
    const { data: log } = await sc
      .from("history_logs")
      .select("id, data")
      .eq("id", id.data)
      .eq("event_type", EventType.PLATFORM_PAYMENT_REJECTED)
      .maybeSingle();
    if (!log) return NextResponse.json({ error: "Rejected payment not found" }, { status: 404 });

    const { data: adminRow } = await sc.from("platform_admins").select("name").eq("user_id", user.id).single();
    const settledByName = (adminRow as { name: string } | null)?.name || user.email || user.id;

    const { data: settlement, error } = await sc
      .from("platform_payment_settlements")
      .insert({ history_log_id: id.data, settled_by: user.id, settled_by_name: settledByName, note } as never)
      .select("created_at")
      .single();
    if (error) {
      // Unique history_log_id: another admin got there first.
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "Already settled" }, { status: 409 });
      }
      console.error("[Admin Settle] insert error:", error);
      return NextResponse.json({ error: "Failed to mark settled" }, { status: 500 });
    }

    const hostId = ((log as { data: { host_id?: string } | null }).data ?? {}).host_id ?? null;
    after(() =>
      logEvent({
        entityType: "billing",
        entityId: id.data,
        eventType: EventType.PLATFORM_PAYMENT_SETTLED,
        actorType: "admin",
        actorId: user.id,
        data: { host_id: hostId, note },
        req,
      }),
    );

    return NextResponse.json({
      settled_at: (settlement as { created_at: string }).created_at,
      settled_by_name: settledByName,
      note,
    });
  } catch (error) {
    console.error("[Admin Settle] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** DELETE: undo a settled mark made by mistake. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = idSchema.safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const sc = createServiceRoleClient();
    const { data: removed, error } = await sc
      .from("platform_payment_settlements")
      .delete()
      .eq("history_log_id", id.data)
      .select("settled_by_name, note")
      .maybeSingle();
    if (error) {
      console.error("[Admin Settle] delete error:", error);
      return NextResponse.json({ error: "Failed to undo" }, { status: 500 });
    }
    if (!removed) return NextResponse.json({ error: "Not settled" }, { status: 404 });

    const previous = removed as { settled_by_name: string; note: string | null };
    after(() =>
      logEvent({
        entityType: "billing",
        entityId: id.data,
        eventType: EventType.PLATFORM_PAYMENT_UNSETTLED,
        actorType: "admin",
        actorId: user.id,
        data: { previously_settled_by: previous.settled_by_name, previous_note: previous.note },
        req,
      }),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Settle] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
