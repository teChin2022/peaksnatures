import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { logEvent, EventType } from "@/lib/history-log";
import {
  callEasySlipV2,
  computeSlipHash,
  validateReceiver,
  MAX_FILE_SIZE,
  ALLOWED_TYPES,
  MAX_SLIP_AGE_MS,
} from "@/lib/easyslip";
import {
  billingToday,
  computeImmediateFixedRateInvoice,
  fixedRateStartDate,
  getBillingConfig,
  isValidTermMonths,
} from "@/lib/billing";

/**
 * Must exceed EASYSLIP_TOTAL_BUDGET_MS in src/lib/easyslip.ts — see
 * /api/verify-slip. Being killed mid-verification is worse here: EasySlip has
 * already recorded the slip, so the host's retry is refused as a duplicate.
 */
export const maxDuration = 60;

// Every call reaches EasySlip, which is metered and billed per request, before
// any DB write. No other /api/host route rate-limits, but none of them can burn
// the platform's money on repeat either.
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, name: "plan-activate" });

/**
 * POST /api/host/plan/activate
 *
 * Pay for Fixed Rate and switch onto it in one step. The quote the host was
 * shown by POST /plan/switch is advisory only — the amount charged is
 * recomputed here from the host row, the live config and today's date, so a
 * tampered client cannot buy a year of Fixed Rate for ฿1.
 *
 * Nothing is persisted unless the slip verifies: an abandoned payment leaves no
 * invoice and no plan change behind.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await limiter.check(req);
    if (limited) return limited;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    const { data: host } = await sc
      .from("hosts")
      .select("id, name, plan_type, fixed_rate_override, fixed_rate_term_ends_at, wallet_balance")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const typedHost = host as {
      id: string;
      name: string;
      plan_type: string;
      fixed_rate_override: number | null;
      fixed_rate_term_ends_at: string | null;
      wallet_balance: number | null;
    };

    const config = await getBillingConfig();
    // With no receiver there is nothing to check a slip against — refuse before
    // EasySlip sees the slip and remembers it.
    if (!config || (!config.promptpay_id && !config.bank_account_number)) {
      return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const termMonths = Number(formData.get("term_months") || "0");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE || !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

    if (!Number.isInteger(termMonths) || !isValidTermMonths(termMonths, config)) {
      return NextResponse.json(
        { error: "Invalid term_months. Pick one of the configured subscription terms." },
        { status: 400 },
      );
    }

    // Re-check eligibility: the quote and this request are minutes apart, and an
    // admin may have moved the host in between.
    const today = billingToday();
    const todayStr = today.toISOString().split("T")[0];

    // A host still mid-term is renewing. fixedRateStartDate starts the new term
    // the day after the paid one ends, so no day already paid for is charged
    // again, and the RPC's ALREADY_ACTIVE check still stops two slips buying
    // the same renewal.
    const isRenewal =
      typedHost.plan_type === "fixed_rate" &&
      !!typedHost.fixed_rate_term_ends_at &&
      typedHost.fixed_rate_term_ends_at >= todayStr;

    // Every refusal below lands before the EasySlip call: after it, the slip is
    // spent and the host's money would be stranded.

    // Fixed Rate never touches the wallet, so a debt carried over from
    // Commission would never be collected — and switching would lift the block
    // that debt earned. A renewing host is already past that gate, as in
    // /plan/switch, which quoted them without it.
    if (!isRenewal && (typedHost.wallet_balance ?? 0) < 0) {
      return NextResponse.json(
        { error: "Top up your wallet to at least ฿0 before switching to Fixed Rate." },
        { status: 402 },
      );
    }

    // A Fixed Rate host who still owes an invoice would pay for a new term and
    // stay blocked by the old one. The daily cron puts a lapsed host back on
    // monthly billing by itself once that invoice is paid.
    if (typedHost.plan_type === "fixed_rate") {
      const { data: openInvoices } = await sc
        .from("invoices")
        .select("id")
        .eq("host_id", typedHost.id)
        .in("status", ["pending", "overdue"])
        .limit(1);
      if ((openInvoices as unknown[] | null)?.length) {
        return NextResponse.json(
          { error: "Pay your open invoice before buying a new term." },
          { status: 402 },
        );
      }
    }

    // Today's price, which only feeds EasySlip's informational matchAmount. The
    // amount actually charged is re-priced from the slip's own date below.
    // Never read from the request.
    const quote = computeImmediateFixedRateInvoice(
      typedHost,
      config,
      termMonths,
      fixedRateStartDate(typedHost, today),
    );

    const apiKey = process.env.EASYSLIP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Payment verification not configured" }, { status: 503 });
    }

    const fileBuffer = await file.arrayBuffer();
    const slipHash = await computeSlipHash(fileBuffer);

    // Cross-table duplicate slip check
    const [inv, wtx, bk, dc] = await Promise.all([
      sc.from("invoices").select("id").eq("slip_hash", slipHash).limit(1),
      sc.from("wallet_transactions").select("id").eq("slip_hash", slipHash).limit(1),
      sc.from("bookings").select("id").eq("payment_slip_hash", slipHash).limit(1),
      sc.from("date_change_requests").select("id").eq("slip_hash", slipHash).limit(1),
    ]);

    if ([inv, wtx, bk, dc].some((r) => (r.data as unknown[] | null)?.length)) {
      return NextResponse.json({ error: "Slip already used", duplicate: true }, { status: 409 });
    }

    // Upload slip
    const tempId = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "jpg";
    const slipPath = `plan-activation/${typedHost.id}/${tempId}.${ext}`;
    await sc.storage
      .from("payment-slips")
      .upload(slipPath, new File([fileBuffer], file.name, { type: file.type }), {
        upsert: true,
        contentType: file.type,
      });

    // Verify via EasySlip
    const easySlipData = await callEasySlipV2(fileBuffer, file.name, file.type, apiKey, quote.amount);

    if (!easySlipData.success) {
      return NextResponse.json({
        verified: false,
        message: easySlipData.error.code === "SLIP_PENDING"
          ? "Bangkok Bank slips need a few minutes. Please try again shortly."
          : `Verification failed: ${easySlipData.error.message}`,
      });
    }

    const rawSlip = easySlipData.data.rawSlip;
    const slipAmount = easySlipData.data.amountInSlip ?? rawSlip.amount.amount;
    // What this activation charges. Re-priced from the slip's date once that is
    // known to be good; refuse() logs whichever figure the slip was held to.
    let charged = quote;

    // EasySlip has now seen this slip and answers any resubmission with
    // isDuplicate, so every refusal from here on strands a real transfer.
    // Leave a trail an admin can find and settle it from.
    const refuse = (reason: string, body: Record<string, unknown>, status = 200) => {
      after(() =>
        logEvent({
          entityType: "billing",
          entityId: typedHost.id,
          eventType: EventType.PLATFORM_PAYMENT_REJECTED,
          actorType: "host",
          actorId: user.id,
          data: {
            reason,
            host_id: typedHost.id,
            expected_amount: charged.amount,
            slip_amount: slipAmount,
            term_months: termMonths,
            trans_ref: rawSlip.transRef || null,
            slip_path: slipPath,
          },
          req,
        }),
      );
      return NextResponse.json(body, { status });
    };

    if (easySlipData.data.isDuplicate) {
      return refuse("duplicate", { error: "This payment slip has already been used.", duplicate: true }, 409);
    }

    const slipTime = new Date(rawSlip.date);
    const slipAge = Date.now() - slipTime.getTime();
    // Written NaN-safe on purpose: the slip's date also prices the plan below.
    if (!(slipAge >= 0 && slipAge <= MAX_SLIP_AGE_MS)) {
      return refuse("slip_too_old", { verified: false, message: "Slip is too old." });
    }

    // Price off the Bangkok day the host paid, not the day they uploaded. The QR
    // they paid carried the /plan/switch quote; repricing at upload time missed
    // it by a day for a slip sent at 23:55 and uploaded at 00:05 — and EasySlip
    // then refused that same slip as a duplicate on every retry.
    charged = computeImmediateFixedRateInvoice(
      typedHost,
      config,
      termMonths,
      fixedRateStartDate(typedHost, billingToday(slipTime)),
    );

    const receiverOk = validateReceiver(rawSlip, config.promptpay_id, config.bank_account_number);
    if (!receiverOk) {
      return refuse("receiver_mismatch", { verified: false, message: "Receiver does not match platform account." });
    }

    if (slipAmount !== charged.amount) {
      return refuse("amount_mismatch", {
        verified: false,
        message: `Amount mismatch: expected ฿${charged.amount}, got ฿${slipAmount}`,
      });
    }

    // Invoice + plan flip in one transaction — both, or neither.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error: activateError } = await (sc.rpc as any)("activate_fixed_rate_plan", {
      p_host_id: typedHost.id,
      p_amount: charged.amount,
      p_period_start: charged.period_start,
      p_period_end: charged.period_end,
      p_term_months: charged.term_months,
      p_discount_pct: charged.discount_pct,
      p_slip_url: slipPath,
      p_slip_hash: slipHash,
      p_slip_trans_ref: rawSlip.transRef || null,
      p_easyslip_response: easySlipData,
      p_created_by: typedHost.name,
    });

    if (activateError) {
      console.error("[Plan Activate] RPC error:", activateError);
      // The unique partial index on invoices.slip_trans_ref is the backstop when
      // two requests race the same slip past the hash check above.
      const message = String(activateError.message || "").toLowerCase();
      if (message.includes("duplicate") || message.includes("unique")) {
        return refuse(
          "duplicate",
          { error: "This payment slip has already been used.", duplicate: true },
          409,
        );
      }
      // Two activations with two different slips both cleared the active-term
      // check above; the RPC re-checks it under the host lock.
      if (message.includes("already_active")) {
        return refuse("already_active", { error: "Already on Fixed Rate with an active term." }, 409);
      }
      return refuse("db_error", { error: "Failed to activate plan" }, 500);
    }

    const invoiceId = (result as { invoice_id: string }[])?.[0]?.invoice_id ?? null;
    const previousPlan = typedHost.plan_type;

    after(async () => {
      await logEvent({
        entityType: "billing",
        entityId: invoiceId ?? typedHost.id,
        eventType: EventType.INVOICE_PAID,
        actorType: "host",
        actorId: user.id,
        data: {
          amount: charged.amount,
          stub_amount: charged.stub_amount,
          term_amount: charged.term_amount,
          period_start: charged.period_start,
          period_end: charged.period_end,
          term_months: charged.term_months,
          discount_pct: charged.discount_pct,
          slip_hash: slipHash,
          activation: true,
        },
        req,
      });

      await logEvent({
        entityType: "host",
        entityId: typedHost.id,
        eventType: EventType.PLAN_CHANGED,
        actorType: "host",
        actorId: user.id,
        data: {
          from: previousPlan,
          to: "fixed_rate",
          immediate: true,
          term_months: charged.term_months,
          invoice_id: invoiceId,
        },
        req,
      });
    });

    return NextResponse.json({
      success: true,
      verified: true,
      plan_type: "fixed_rate",
      invoice_id: invoiceId,
      amount: charged.amount,
      period_start: charged.period_start,
      period_end: charged.period_end,
    });
  } catch (error) {
    console.error("[Plan Activate] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
