import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import type { FixedRateTermTier, PlatformBillingConfig } from "@/types/database";

function validateTermTiers(
  tiers: unknown,
): { ok: true; value: FixedRateTermTier[] } | { ok: false; error: string } {
  if (!Array.isArray(tiers)) return { ok: false, error: "fixed_rate_term_tiers must be an array" };
  const seen = new Set<number>();
  const cleaned: FixedRateTermTier[] = [];
  for (const raw of tiers) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Each tier must be an object" };
    }
    const months = Number((raw as { months?: unknown }).months);
    const discount = Number((raw as { discount_pct?: unknown }).discount_pct);
    if (!Number.isInteger(months) || months < 1 || months > 60) {
      return { ok: false, error: `Invalid months: ${months}. Must be an integer between 1 and 60.` };
    }
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      return { ok: false, error: `Invalid discount_pct: ${discount}. Must be between 0 and 100.` };
    }
    if (seen.has(months)) {
      return { ok: false, error: `Duplicate tier for ${months} months` };
    }
    seen.add(months);
    cleaned.push({ months, discount_pct: discount });
  }
  cleaned.sort((a, b) => a.months - b.months);
  return { ok: true, value: cleaned };
}

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

    const sc = createServiceRoleClient();
    const { data, error } = await sc
      .from("platform_billing_config")
      .select("*")
      .limit(1)
      .single();

    if (error) {
      console.error("[Admin BillingConfig] fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch billing config" }, { status: 500 });
    }

    return NextResponse.json(data as unknown as PlatformBillingConfig);
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      commission_pct,
      fixed_rate_amount,
      fixed_rate_term_tiers,
      promptpay_id,
      bank_name,
      bank_account_number,
      bank_account_name,
      payment_display,
    } = body;

    let tiersValue: FixedRateTermTier[] | undefined;
    if (fixed_rate_term_tiers !== undefined) {
      const result = validateTermTiers(fixed_rate_term_tiers);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      tiersValue = result.value;
    }

    const sc = createServiceRoleClient();

    // Get existing config id
    const { data: existing } = await sc
      .from("platform_billing_config")
      .select("id")
      .limit(1)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Billing config not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (commission_pct !== undefined) updateData.commission_pct = commission_pct;
    if (fixed_rate_amount !== undefined) updateData.fixed_rate_amount = fixed_rate_amount;
    if (tiersValue !== undefined) updateData.fixed_rate_term_tiers = tiersValue;
    if (promptpay_id !== undefined) updateData.promptpay_id = promptpay_id;
    if (bank_name !== undefined) updateData.bank_name = bank_name;
    if (bank_account_number !== undefined) updateData.bank_account_number = bank_account_number;
    if (bank_account_name !== undefined) updateData.bank_account_name = bank_account_name;
    if (payment_display !== undefined) updateData.payment_display = payment_display;

    const { data, error } = await sc
      .from("platform_billing_config")
      .update(updateData as never)
      .eq("id", (existing as { id: string }).id)
      .select()
      .single();

    if (error) {
      console.error("[Admin BillingConfig] update error:", error);
      return NextResponse.json({ error: "Failed to update billing config" }, { status: 500 });
    }

    return NextResponse.json(data as unknown as PlatformBillingConfig);
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
