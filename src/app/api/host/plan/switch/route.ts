import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import {
  computeFixedRateInvoice,
  getBillingConfig,
  isValidTermMonths,
} from "@/lib/billing";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { plan_type } = body;
    const term_months_raw = body?.term_months;

    if (!plan_type || !["commission", "fixed_rate"].includes(plan_type)) {
      return NextResponse.json({ error: "Invalid plan type. Choose commission or fixed_rate." }, { status: 400 });
    }

    let term_months: number | null = null;
    if (plan_type === "fixed_rate") {
      const config = await getBillingConfig();
      if (!config) {
        return NextResponse.json({ error: "Billing config not found" }, { status: 500 });
      }
      const parsed = Number(term_months_raw);
      if (!Number.isInteger(parsed) || !isValidTermMonths(parsed, config)) {
        return NextResponse.json(
          { error: "Invalid term_months. Pick one of the configured subscription terms." },
          { status: 400 },
        );
      }
      term_months = parsed;
    }

    const sc = createServiceRoleClient();

    const { data: host } = await sc
      .from("hosts")
      .select("id, plan_type, name, plan_free_expires_at, fixed_rate_override, fixed_rate_term_ends_at, plan_pending_type")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const typedHost = host as {
      id: string;
      plan_type: string;
      name: string;
      plan_free_expires_at: string | null;
      fixed_rate_override: number | null;
      fixed_rate_term_ends_at: string | null;
      plan_pending_type: string | null;
    };

    const isFixedRateRenewal =
      typedHost.plan_type === "fixed_rate" && plan_type === "fixed_rate";

    if (typedHost.plan_type === plan_type && !isFixedRateRenewal) {
      return NextResponse.json({ error: "Already on this plan" }, { status: 400 });
    }

    if (isFixedRateRenewal && !typedHost.fixed_rate_term_ends_at) {
      return NextResponse.json(
        { error: "No active term to renew. Pick a term to start fresh." },
        { status: 400 },
      );
    }

    if (typedHost.plan_pending_type) {
      return NextResponse.json(
        { error: "A plan switch is already pending — cancel it first." },
        { status: 400 },
      );
    }

    // Free → paid upgrades apply immediately (no charge on Free, no proration
    // concern, and commission must take effect right away so new bookings
    // actually deduct from the wallet). Paid → paid switches still schedule
    // for the 1st of next month so billing cycles align.
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const isUpgradeFromFree = typedHost.plan_type === "free";

    if (isUpgradeFromFree) {
      const updateFields: Record<string, unknown> = {
        plan_type,
        plan_pending_type: null,
        plan_pending_effective_at: null,
        plan_pending_term_months: null,
        plan_free_expires_at: null,
        updated_by: typedHost.name,
      };

      let invoicePayload: ReturnType<typeof computeFixedRateInvoice> | null = null;
      if (plan_type === "fixed_rate" && term_months) {
        const config = await getBillingConfig();
        if (!config) {
          return NextResponse.json({ error: "Billing config not found" }, { status: 500 });
        }
        invoicePayload = computeFixedRateInvoice(typedHost, config, term_months, today);
        updateFields.fixed_rate_term_months = term_months;
        updateFields.fixed_rate_term_started_at = invoicePayload.period_start;
        updateFields.fixed_rate_term_ends_at = invoicePayload.period_end;
      }

      const { error: applyError } = await sc
        .from("hosts")
        .update(updateFields as never)
        .eq("id", typedHost.id);

      if (applyError) {
        console.error("[Plan Switch] apply error:", applyError);
        return NextResponse.json({ error: "Failed to switch plan" }, { status: 500 });
      }

      if (invoicePayload) {
        const dueDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 5))
          .toISOString().split("T")[0];
        const { error: invoiceError } = await sc
          .from("invoices")
          .insert({
            host_id: typedHost.id,
            amount: invoicePayload.amount,
            period_start: invoicePayload.period_start,
            period_end: invoicePayload.period_end,
            term_months: invoicePayload.term_months,
            discount_pct: invoicePayload.discount_pct,
            due_date: dueDate,
            status: "pending",
            created_by: typedHost.name,
            updated_by: typedHost.name,
          } as never);

        if (invoiceError) {
          console.error("[Plan Switch] invoice insert error:", invoiceError);
          return NextResponse.json({ error: "Plan switched but failed to create invoice" }, { status: 500 });
        }

        after(async () => {
          await logEvent({
            entityType: "billing",
            entityId: typedHost.id,
            eventType: EventType.INVOICE_CREATED,
            actorType: "host",
            actorId: user.id,
            data: {
              amount: invoicePayload!.amount,
              period_start: invoicePayload!.period_start,
              period_end: invoicePayload!.period_end,
              term_months: invoicePayload!.term_months,
              discount_pct: invoicePayload!.discount_pct,
            },
          });
        });
      }

      after(async () => {
        await logEvent({
          entityType: "host",
          entityId: typedHost.id,
          eventType: EventType.PLAN_CHANGED,
          actorType: "host",
          actorId: user.id,
          data: {
            from: typedHost.plan_type,
            to: plan_type,
            immediate: true,
            ...(term_months ? { term_months } : {}),
          },
          req,
        });
      });

      return NextResponse.json({
        success: true,
        plan_type,
        applied_immediately: true,
        ...(invoicePayload
          ? {
              invoice: {
                amount: invoicePayload.amount,
                term_months: invoicePayload.term_months,
                discount_pct: invoicePayload.discount_pct,
              },
            }
          : {}),
      });
    }

    // For fixed_rate → fixed_rate transitions (same-term renewal or cross-term
    // change), the new term starts the day after the current term ends so there
    // is no gap and no overlap. For all other transitions, schedule for the 1st
    // of next month so billing cycles align.
    const isFixedRateTransition =
      typedHost.plan_type === "fixed_rate" && plan_type === "fixed_rate";

    let effectiveDate: string;
    if (isFixedRateTransition && typedHost.fixed_rate_term_ends_at) {
      const end = new Date(typedHost.fixed_rate_term_ends_at);
      const next = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1),
      );
      effectiveDate = next.toISOString().split("T")[0];
    } else {
      effectiveDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        .toISOString()
        .split("T")[0];
    }

    const pendingFields: Record<string, unknown> = {
      plan_pending_type: plan_type,
      plan_pending_effective_at: effectiveDate,
      plan_pending_term_months: plan_type === "fixed_rate" ? term_months : null,
      updated_by: typedHost.name,
    };

    const { error: updateError } = await sc
      .from("hosts")
      .update(pendingFields as never)
      .eq("id", typedHost.id);

    if (updateError) {
      console.error("[Plan Switch] update error:", updateError);
      return NextResponse.json({ error: "Failed to schedule plan switch" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: typedHost.id,
        eventType: EventType.PLAN_SWITCH_SCHEDULED,
        actorType: "host",
        actorId: user.id,
        data: {
          current_plan: typedHost.plan_type,
          new_plan: plan_type,
          effective_date: effectiveDate,
          ...(term_months ? { term_months } : {}),
          ...(isFixedRateTransition ? { renewal: true } : {}),
        },
        req,
      });
    });

    return NextResponse.json({
      success: true,
      plan_pending_type: plan_type,
      plan_pending_effective_at: effectiveDate,
      ...(term_months ? { plan_pending_term_months: term_months } : {}),
    });
  } catch (err) {
    console.error("[Plan Switch] unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
