import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import {
  billingToday,
  computeImmediateFixedRateInvoice,
  getBillingConfig,
  isValidTermMonths,
} from "@/lib/billing";
import { LOW_WALLET_THRESHOLD } from "@/lib/wallet-thresholds";

/** Whole days left in a term, counting today. 0 once the term has ended. */
function daysRemaining(termEndsAt: string, today: Date): number {
  const end = new Date(`${termEndsAt}T00:00:00Z`).getTime();
  const diff = Math.floor((end - today.getTime()) / 86_400_000) + 1;
  return diff > 0 ? diff : 0;
}

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
      .select("id, plan_type, name, plan_free_expires_at, fixed_rate_override, fixed_rate_term_months, fixed_rate_term_ends_at, plan_pending_type, wallet_balance")
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
      fixed_rate_term_months: number | null;
      fixed_rate_term_ends_at: string | null;
      plan_pending_type: string | null;
      wallet_balance: number | null;
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

    // A fixed-rate host can't walk away from an unpaid invoice by switching to
    // Commission — the debt has to be settled first. Checked before the wallet
    // gate below so the host is told to pay the invoice, not to top up.
    if (typedHost.plan_type === "fixed_rate" && plan_type === "commission") {
      const { data: openInvoices } = await sc
        .from("invoices")
        .select("id, amount, due_date")
        .eq("host_id", typedHost.id)
        .in("status", ["pending", "overdue"])
        .order("due_date", { ascending: true })
        .limit(1);

      const openInvoice = (openInvoices as { id: string; amount: number; due_date: string }[] | null)?.[0];
      if (openInvoice) {
        return NextResponse.json(
          {
            error: "UNPAID_INVOICE",
            invoice_id: openInvoice.id,
            amount: openInvoice.amount,
            due_date: openInvoice.due_date,
          },
          { status: 402 },
        );
      }
    }

    // Commission is deducted from the wallet per booking, so a near-empty
    // wallet goes negative on the very first booking. Gate on the same figure
    // the low-balance warning uses, rather than a second threshold that would
    // let a host through at ฿1 and straight into the red.
    if (plan_type === "commission" && (typedHost.wallet_balance ?? 0) < LOW_WALLET_THRESHOLD) {
      return NextResponse.json(
        {
          error: "WALLET_LOW",
          wallet_balance: typedHost.wallet_balance ?? 0,
          required: LOW_WALLET_THRESHOLD,
        },
        { status: 402 },
      );
    }

    const today = billingToday();

    // ── Starting Fixed Rate: quote now, activate on payment ──
    // Nothing is written here. The host is quoted, and POST /plan/activate
    // recomputes this same figure from the slip before anything is persisted,
    // so an abandoned payment leaves no invoice and no plan change behind.
    if (plan_type === "fixed_rate" && !isFixedRateRenewal) {
      const config = await getBillingConfig();
      if (!config) {
        return NextResponse.json({ error: "Billing config not found" }, { status: 500 });
      }
      const quote = computeImmediateFixedRateInvoice(typedHost, config, term_months!, today);

      return NextResponse.json(
        { error: "PAYMENT_REQUIRED", plan_type, ...quote },
        { status: 402 },
      );
    }

    // ── Switching to Commission: applies immediately ──
    if (plan_type === "commission") {
      const forfeitedTermEndsAt =
        typedHost.plan_type === "fixed_rate" ? typedHost.fixed_rate_term_ends_at : null;
      const forfeitedDays = forfeitedTermEndsAt ? daysRemaining(forfeitedTermEndsAt, today) : 0;

      const { error: applyError } = await sc
        .from("hosts")
        .update({
          plan_type: "commission",
          plan_pending_type: null,
          plan_pending_effective_at: null,
          plan_pending_term_months: null,
          plan_free_expires_at: null,
          // Leaving fixed_rate behind — clear stale term fields.
          fixed_rate_term_months: null,
          fixed_rate_term_started_at: null,
          fixed_rate_term_ends_at: null,
          updated_by: typedHost.name,
        } as never)
        .eq("id", typedHost.id);

      if (applyError) {
        console.error("[Plan Switch] apply error:", applyError);
        return NextResponse.json({ error: "Failed to switch plan" }, { status: 500 });
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
            to: "commission",
            immediate: true,
            // The forfeiture is not recoverable from the host row once the term
            // fields are cleared, so it has to live in the audit trail.
            ...(forfeitedDays > 0
              ? {
                  forfeited_days: forfeitedDays,
                  forfeited_term_ends_at: forfeitedTermEndsAt,
                  forfeited_term_months: typedHost.fixed_rate_term_months,
                }
              : {}),
          },
          req,
        });
      });

      return NextResponse.json({
        success: true,
        plan_type: "commission",
        applied_immediately: true,
        ...(forfeitedDays > 0 ? { forfeited_days: forfeitedDays } : {}),
      });
    }

    // ── Fixed Rate renewal: the only switch that is still scheduled ──
    // A renewal is not a plan change — the host stays on Fixed Rate and the new
    // term starts the day after the current one ends, so there is no gap and no
    // overlap. Billing for it happens when the cron applies the pending switch.
    const end = new Date(typedHost.fixed_rate_term_ends_at!);
    const effectiveDate = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1),
    ).toISOString().split("T")[0];

    const { error: updateError } = await sc
      .from("hosts")
      .update({
        plan_pending_type: plan_type,
        plan_pending_effective_at: effectiveDate,
        plan_pending_term_months: term_months,
        updated_by: typedHost.name,
      } as never)
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
          term_months,
          renewal: true,
        },
        req,
      });
    });

    return NextResponse.json({
      success: true,
      plan_pending_type: plan_type,
      plan_pending_effective_at: effectiveDate,
      plan_pending_term_months: term_months,
    });
  } catch (err) {
    console.error("[Plan Switch] unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
