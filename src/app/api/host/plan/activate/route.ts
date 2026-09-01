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
  getBillingConfig,
  isValidTermMonths,
} from "@/lib/billing";

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
      .select("id, name, plan_type, fixed_rate_override, fixed_rate_term_ends_at")
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
    };

    const config = await getBillingConfig();
    if (!config) {
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

    if (
      typedHost.plan_type === "fixed_rate" &&
      typedHost.fixed_rate_term_ends_at &&
      typedHost.fixed_rate_term_ends_at >= todayStr
    ) {
      return NextResponse.json(
        { error: "Already on Fixed Rate with an active term." },
        { status: 400 },
      );
    }

    // The authoritative amount. Never read from the request.
    const quote = computeImmediateFixedRateInvoice(typedHost, config, termMonths, today);

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

    if (easySlipData.data.isDuplicate) {
      return NextResponse.json({ error: "This payment slip has already been used.", duplicate: true }, { status: 409 });
    }

    const slipAge = Date.now() - new Date(rawSlip.date).getTime();
    if (slipAge > MAX_SLIP_AGE_MS || slipAge < 0) {
      return NextResponse.json({ verified: false, message: "Slip is too old." });
    }

    const receiverOk = validateReceiver(rawSlip, config.promptpay_id, config.bank_account_number);
    if (!receiverOk) {
      return NextResponse.json({ verified: false, message: "Receiver does not match platform account." });
    }

    const slipAmount = easySlipData.data.amountInSlip ?? rawSlip.amount.amount;
    if (slipAmount !== quote.amount) {
      return NextResponse.json({
        verified: false,
        message: `Amount mismatch: expected ฿${quote.amount}, got ฿${slipAmount}`,
      });
    }

    // Invoice + plan flip in one transaction — both, or neither.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error: activateError } = await (sc.rpc as any)("activate_fixed_rate_plan", {
      p_host_id: typedHost.id,
      p_amount: quote.amount,
      p_period_start: quote.period_start,
      p_period_end: quote.period_end,
      p_term_months: quote.term_months,
      p_discount_pct: quote.discount_pct,
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
        return NextResponse.json(
          { error: "This payment slip has already been used.", duplicate: true },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Failed to activate plan" }, { status: 500 });
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
          amount: quote.amount,
          stub_amount: quote.stub_amount,
          term_amount: quote.term_amount,
          period_start: quote.period_start,
          period_end: quote.period_end,
          term_months: quote.term_months,
          discount_pct: quote.discount_pct,
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
          term_months: quote.term_months,
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
      amount: quote.amount,
      period_start: quote.period_start,
      period_end: quote.period_end,
    });
  } catch (error) {
    console.error("[Plan Activate] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
