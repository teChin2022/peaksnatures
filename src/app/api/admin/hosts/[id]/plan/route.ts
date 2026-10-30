import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logEvent, EventType } from "@/lib/history-log";
import {
  billingToday,
  computeImmediateFixedRateInvoice,
  fixedRateStartDate,
  getBillingConfig,
  isValidTermMonths,
} from "@/lib/billing";
import type { PlatformBillingConfig } from "@/types/database";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { plan_type, plan_free_expires_at, term_months: termMonthsRaw } = body;

    if (!plan_type || !["free", "commission", "fixed_rate"].includes(plan_type)) {
      return NextResponse.json({ error: "Invalid plan_type" }, { status: 400 });
    }

    const sc = createServiceRoleClient();

    // Fetch admin name
    const { data: adminRow } = await sc
      .from("platform_admins")
      .select("name")
      .eq("user_id", user.id)
      .single();
    const adminName = (adminRow as { name: string } | null)?.name || user.id;

    // Update host plan
    const updateData: Record<string, unknown> = {
      plan_type,
      updated_by: adminName,
    };

    if (plan_type === "free" && plan_free_expires_at) {
      updateData.plan_free_expires_at = plan_free_expires_at;
    } else if (plan_type !== "free") {
      updateData.plan_free_expires_at = null;
    }

    // Clear pending plan switch when admin sets plan directly
    updateData.plan_pending_type = null;
    updateData.plan_pending_effective_at = null;
    updateData.plan_pending_term_months = null;

    const today = billingToday();
    let invoicePayload: ReturnType<typeof computeImmediateFixedRateInvoice> | null = null;
    // The term the admin picked, and whether it actually started one. A re-save
    // on a host who is already mid-term leaves both the term and the billing
    // alone, and the dialog says so rather than quoting a price it won't charge.
    let termMonths: number | null = null;
    let invoiceCreated = false;

    if (plan_type === "fixed_rate") {
      // Assigning fixed_rate must start a term (and bill it) just like the host
      // self-serve switch — otherwise the host has a NULL term and never matches
      // the daily term-expiry warnings. Defaults to a 1-month term.
      const config = await getBillingConfig();
      if (!config) {
        return NextResponse.json({ error: "Billing config not found" }, { status: 500 });
      }
      const parsed = Number(termMonthsRaw);
      termMonths = Number.isInteger(parsed) && isValidTermMonths(parsed, config) ? parsed : 1;

      const { data: hostRow } = await sc
        .from("hosts")
        .select("plan_type, fixed_rate_override, fixed_rate_term_ends_at")
        .eq("id", id)
        .single();
      const current =
        (hostRow as {
          plan_type: string;
          fixed_rate_override: number | null;
          fixed_rate_term_ends_at: string | null;
        } | null) || { plan_type: "free", fixed_rate_override: null, fixed_rate_term_ends_at: null };

      const todayStr = today.toISOString().split("T")[0];
      const alreadyActiveFixedRate =
        current.plan_type === "fixed_rate" &&
        !!current.fixed_rate_term_ends_at &&
        current.fixed_rate_term_ends_at >= todayStr;

      // Only (re)start a term + invoice when the host isn't already mid-term on
      // fixed_rate — prevents an idempotent admin re-save (the plan dialog
      // pre-selects the current plan) from double-billing or truncating a term.
      if (!alreadyActiveFixedRate) {
        // A lapsed Fixed Rate host pays the whole month from the 1st, exactly as
        // their own re-activation and the daily cron would charge them.
        invoicePayload = computeImmediateFixedRateInvoice(
          current,
          config as PlatformBillingConfig,
          termMonths,
          fixedRateStartDate(current, today),
        );
        updateData.fixed_rate_term_months = termMonths;
        updateData.fixed_rate_term_started_at = invoicePayload.period_start;
        updateData.fixed_rate_term_ends_at = invoicePayload.period_end;
      }
    } else {
      // Leaving fixed_rate behind — clear stale term fields.
      updateData.fixed_rate_term_months = null;
      updateData.fixed_rate_term_started_at = null;
      updateData.fixed_rate_term_ends_at = null;
    }

    if (invoicePayload && invoicePayload.amount > 0) {
      // Born paid, through the same RPC the host-paid activation uses: an admin
      // assigning Fixed Rate is recording an arrangement they have already
      // settled, not sending the host a bill. Three things follow from that.
      //
      // It cannot block. blockingInvoiceFilter matches only `overdue` or
      // `pending` past its due date, so a paid row never trips isHostBlocked —
      // the same invariant migration 066 states for the host-paid path. Issuing
      // this as `pending` on a 5-day fuse meant a 12-month term could darken a
      // host's booking page a week after an admin touched their plan.
      //
      // It is written unconditionally. The old guard skipped the insert when
      // any invoice was already open, to avoid stacking a second one the host
      // would have to pay; a paid row stacks nothing, and skipping it would
      // silently hand over a term with no record that it was paid for.
      // Unrelated debts stay open on their own terms.
      //
      // And the plan, the term and the invoice commit together. Two calls — host
      // update, then invoice insert — could leave a term with no invoice.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcError } = await (sc.rpc as any)("activate_fixed_rate_plan", {
        p_host_id: id,
        p_amount: invoicePayload.amount,
        p_period_start: invoicePayload.period_start,
        p_period_end: invoicePayload.period_end,
        p_term_months: invoicePayload.term_months,
        p_discount_pct: invoicePayload.discount_pct,
        p_created_by: adminName,
        p_status: "paid",
      });

      if (rpcError) {
        console.error("[Admin SetPlan] activation error:", rpcError);
        // Another writer started a term between the read above and now.
        if (String(rpcError.message || "").includes("ALREADY_ACTIVE")) {
          return NextResponse.json({ error: "Host already has an active Fixed Rate term" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
      }

      invoiceCreated = true;

      after(async () => {
        await logEvent({
          entityType: "billing",
          entityId: id,
          eventType: EventType.INVOICE_PAID,
          actorType: "admin",
          actorId: user.id,
          data: {
            amount: invoicePayload!.amount,
            period_start: invoicePayload!.period_start,
            period_end: invoicePayload!.period_end,
            term_months: invoicePayload!.term_months,
            discount_pct: invoicePayload!.discount_pct,
            settled_offline: true,
          },
          req,
        });
      });
    } else {
      // Nothing to invoice: Free, Commission, a re-save on a host mid-term, or a
      // comped (฿0) term.
      const { error: updateError } = await sc
        .from("hosts")
        .update(updateData as never)
        .eq("id", id);

      if (updateError) {
        console.error("[Admin SetPlan] update error:", updateError);
        return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
      }
    }

    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: id,
        eventType: EventType.PLAN_CHANGED,
        actorType: "admin",
        actorId: user.id,
        data: {
          plan_type,
          plan_free_expires_at,
          set_by: adminName,
          term_months: termMonths,
          term_started: invoicePayload !== null,
          ...(invoicePayload
            ? {
                fixed_rate_term_started_at: invoicePayload.period_start,
                fixed_rate_term_ends_at: invoicePayload.period_end,
              }
            : {}),
        },
        req,
      });
    });

    return NextResponse.json({
      success: true,
      plan_type,
      term_months: termMonths,
      term_started: invoicePayload !== null,
      invoice_created: invoiceCreated,
      amount: invoicePayload?.amount ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
