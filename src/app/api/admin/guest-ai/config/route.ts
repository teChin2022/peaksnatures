import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logEvent, EventType } from "@/lib/history-log";

const configSchema = z
  .object({
    enabled: z.boolean().optional(),
    daily_cap: z.number().int().min(0).max(100_000).optional(),
    // Baht per reply, to the satang (D7: 0 until an admin sets it).
    price_per_reply: z
      .number()
      .min(0)
      .max(100)
      .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6)
      .optional(),
  })
  .strict()
  .refine((v) => v.enabled !== undefined || v.daily_cap !== undefined || v.price_per_reply !== undefined);

/**
 * PATCH /api/admin/guest-ai/config — the platform's guest AI kill switch, its
 * daily reply cap over all hosts (085) and the price per reply charged to host
 * wallets (086). All take effect on the next question: reserve_guest_ai_reply
 * reads them every time.
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = configSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const sc = createServiceRoleClient();
    const { data: adminRow } = await sc.from("platform_admins").select("name").eq("user_id", user.id).single();
    const adminName = (adminRow as { name: string } | null)?.name || user.id;

    const { data, error } = await sc
      .from("platform_guest_ai_config")
      .update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: adminName } as never)
      .eq("id", true)
      .select("enabled, daily_cap, price_per_reply")
      .maybeSingle();
    if (error || !data) {
      console.error("[Admin Guest AI config] update error:", error);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    after(() =>
      logEvent({
        entityType: "platform",
        entityId: "guest_ai",
        eventType: EventType.GUEST_AI_PLATFORM_CHANGED,
        actorType: "admin",
        actorId: user.id,
        data: { ...parsed.data, admin_name: adminName },
        req,
      }),
    );

    return NextResponse.json({ config: data });
  } catch (error) {
    console.error("[Admin Guest AI config] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
