import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isValidPhone } from "@/lib/utils";

const schema = z.object({
  phone: z.string().refine(isValidPhone).optional(),
  // PromptPay ids are 10 (phone), 13 (national id) or 15 (e-wallet) digits.
  promptpay_id: z.string().trim().min(1).max(20).optional(),
});

/**
 * POST /api/host/setup-profile — the dashboard's first-run popup fills in a
 * phone and PromptPay id the host has not set yet.
 *
 * It used to write them to `hosts` from the browser, which needed a column
 * grant that also let any host session change `promptpay_id` (the account
 * guests pay into) with no PIN (audit F-13; grant removed in migration 079).
 * This route only fills empty fields; changing a set value goes through the
 * PIN-protected /api/host/update-sensitive.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();
    const { data: hostRow } = await sc
      .from("hosts")
      .select("id, name, phone, promptpay_id")
      .eq("user_id", user.id)
      .single();
    const host = hostRow as { id: string; name: string; phone: string | null; promptpay_id: string | null } | null;
    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const update: Record<string, string> = {};
    if (parsed.data.phone && !host.phone) update.phone = parsed.data.phone;
    if (parsed.data.promptpay_id && !host.promptpay_id) update.promptpay_id = parsed.data.promptpay_id;

    const updated = Object.keys(update);
    if (updated.length === 0) {
      return NextResponse.json({ success: true, updated });
    }

    const { error } = await sc
      .from("hosts")
      .update({ ...update, updated_by: host.name } as never)
      .eq("id", host.id);
    if (error) {
      console.error("[SetupProfile] Update error:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("[SetupProfile] Error:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
