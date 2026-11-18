import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { billingTodayStr } from "@/lib/billing-dates";
import { EXPENSE_CATEGORIES } from "@/lib/host-finance";

/** A real calendar day as YYYY-MM-DD (rejects 2026-02-30). */
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s));

const expenseSchema = z.object({
  spent_on: isoDay,
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().min(0.01).max(10_000_000),
  note: z.string().trim().max(200).nullish(),
});

/**
 * The columns to write for an add or an edit, or null when the body is invalid.
 * Never host_id: that comes from the session.
 */
export function parseExpense(body: unknown) {
  const parsed = expenseSchema.safeParse(body);
  // A future month is beyond the page's › button, so such a row could never be seen or deleted.
  if (!parsed.success || parsed.data.spent_on > billingTodayStr()) return null;
  const { spent_on, category, amount, note } = parsed.data;
  return { spent_on, category, amount, note: note || null };
}

/** The caller's own hosts row. Owners only: staff logins have none (migration 081). */
export async function ownerHost() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sc = createServiceRoleClient();
  const { data: host } = await sc.from("hosts").select("id").eq("user_id", user.id).maybeSingle();
  if (!host) {
    return NextResponse.json({ error: "Host not found" }, { status: 404 });
  }
  return { sc, hostId: (host as { id: string }).id };
}
