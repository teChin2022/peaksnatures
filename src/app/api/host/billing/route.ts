import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { getBillingConfig, getEffectiveCommissionPct, getEffectiveFixedRate } from "@/lib/billing";
import type { Host } from "@/types/database";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    const { data: host, error: hostError } = await sc
      .from("hosts")
      .select("id, plan_type, plan_free_expires_at, plan_pending_type, plan_pending_effective_at, wallet_balance, commission_pct_override, fixed_rate_override")
      .eq("user_id", user.id)
      .single();

    if (hostError || !host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const config = await getBillingConfig();
    const typedHost = host as unknown as Host;

    // Get recent invoices for fixed_rate plan
    let invoices: unknown[] = [];
    if (typedHost.plan_type === "fixed_rate") {
      const { data } = await sc
        .from("invoices")
        .select("*")
        .eq("host_id", typedHost.id)
        .order("created_at", { ascending: false })
        .limit(5);
      invoices = data || [];
    }

    // Get recent wallet transactions for commission plan
    let recentTransactions: unknown[] = [];
    if (typedHost.plan_type === "commission") {
      const { data } = await sc
        .from("wallet_transactions")
        .select("*")
        .eq("host_id", typedHost.id)
        .order("created_at", { ascending: false })
        .limit(10);
      recentTransactions = data || [];
    }

    return NextResponse.json({
      plan_type: typedHost.plan_type,
      plan_free_expires_at: typedHost.plan_free_expires_at,
      plan_pending_type: typedHost.plan_pending_type,
      plan_pending_effective_at: typedHost.plan_pending_effective_at,
      wallet_balance: typedHost.wallet_balance,
      effective_commission_pct: config
        ? getEffectiveCommissionPct(typedHost, config)
        : null,
      effective_fixed_rate: config
        ? getEffectiveFixedRate(typedHost, config)
        : null,
      platform_payment: config
        ? {
            promptpay_id: config.promptpay_id,
            bank_name: config.bank_name,
            bank_account_number: config.bank_account_number,
            bank_account_name: config.bank_account_name,
            payment_display: config.payment_display,
          }
        : null,
      invoices,
      recent_transactions: recentTransactions,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
