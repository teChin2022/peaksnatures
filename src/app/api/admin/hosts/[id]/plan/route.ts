import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logEvent, EventType } from "@/lib/history-log";
import { billingToday, computeImmediateFixedRateInvoice, getBillingConfig, isValidTermMonths } from "@/lib/billing";
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

    if (plan_type === "fixed_rate") {
      // Assigning fixed_rate must start a term (and bill it) just like the host
      // self-serve switch — otherwise the host has a NULL term and never matches
      // the daily term-expiry warnings. Defaults to a 1-month term.
      const config = await getBillingConfig();
      if (!config) {
        return NextResponse.json({ error: "Billing config not found" }, { status: 500 });
      }
      const parsed = Number(termMonthsRaw);
      const term_months = Number.isInteger(parsed) && isValidTermMonths(parsed, config) ? parsed : 1;

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
        invoicePayload = computeImmediateFixedRateInvoice(current, config as PlatformBillingConfig, term_months, today);
        updateData.fixed_rate_term_months = term_months;
        updateData.fixed_rate_term_started_at = invoicePayload.period_start;
        updateData.fixed_rate_term_ends_at = invoicePayload.period_end;
      }
    } else {
      // Leaving fixed_rate behind — clear stale term fields.
      updateData.fixed_rate_term_months = null;
      updateData.fixed_rate_term_started_at = null;
      updateData.fixed_rate_term_ends_at = null;
    }

    const { error: updateError } = await sc
      .from("hosts")
      .update(updateData as never)
      .eq("id", id);

    if (updateError) {
      console.error("[Admin SetPlan] update error:", updateError);
      return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
    }

    if (invoicePayload && invoicePayload.amount > 0) {
      // Don't stack a second open invoice if the host already has one.
      const { data: openInv } = await sc
        .from("invoices")
        .select("id")
        .eq("host_id", id)
        .in("status", ["pending", "overdue"])
        .limit(1);

      if (!((openInv as unknown[] | null)?.length)) {
        const dueDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 5))
          .toISOString().split("T")[0];
        const { error: invoiceError } = await sc
          .from("invoices")
          .insert({
            host_id: id,
            amount: invoicePayload.amount,
            period_start: invoicePayload.period_start,
            period_end: invoicePayload.period_end,
            term_months: invoicePayload.term_months,
            discount_pct: invoicePayload.discount_pct,
            due_date: dueDate,
            status: "pending",
            created_by: adminName,
            updated_by: adminName,
          } as never);

        if (invoiceError) {
          console.error("[Admin SetPlan] invoice insert error:", invoiceError);
          return NextResponse.json({ error: "Plan set but failed to create invoice" }, { status: 500 });
        }

        after(async () => {
          await logEvent({
            entityType: "billing",
            entityId: id,
            eventType: EventType.INVOICE_CREATED,
            actorType: "admin",
            actorId: user.id,
            data: {
              amount: invoicePayload!.amount,
              period_start: invoicePayload!.period_start,
              period_end: invoicePayload!.period_end,
              term_months: invoicePayload!.term_months,
              discount_pct: invoicePayload!.discount_pct,
            },
            req,
          });
        });
      }
    }

    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: id,
        eventType: EventType.PLAN_CHANGED,
        actorType: "admin",
        actorId: user.id,
        data: { plan_type, plan_free_expires_at, set_by: adminName },
        req,
      });
    });

    return NextResponse.json({ success: true, plan_type });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
