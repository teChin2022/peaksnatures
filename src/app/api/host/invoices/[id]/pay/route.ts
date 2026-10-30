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
import { getBillingConfig } from "@/lib/billing";

/**
 * Must exceed EASYSLIP_TOTAL_BUDGET_MS in src/lib/easyslip.ts — see
 * /api/verify-slip. Being killed mid-verification is worse here: EasySlip has
 * already recorded the slip, so the host's retry is refused as a duplicate.
 */
export const maxDuration = 60;

// Every call reaches the metered EasySlip API before any DB write.
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, name: "invoice-pay" });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: invoiceId } = await params;
    const sc = createServiceRoleClient();

    // Get host
    const { data: host } = await sc
      .from("hosts")
      .select("id, name")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const typedHost = host as { id: string; name: string };

    // Get invoice
    const { data: invoice } = await sc
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("host_id", typedHost.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const typedInvoice = invoice as { id: string; amount: number; status: string };

    if (typedInvoice.status === "paid") {
      return NextResponse.json({ error: "Invoice already paid" }, { status: 400 });
    }

    const config = await getBillingConfig();
    // With no receiver there is nothing to check a slip against — refuse before
    // EasySlip sees the slip and remembers it.
    if (!config || (!config.promptpay_id && !config.bank_account_number)) {
      return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE || !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

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
    const ext = file.name.split(".").pop() || "jpg";
    const slipPath = `invoices/${typedHost.id}/${invoiceId}.${ext}`;
    await sc.storage
      .from("payment-slips")
      .upload(slipPath, new File([fileBuffer], file.name, { type: file.type }), {
        upsert: true,
        contentType: file.type,
      });

    // Verify via EasySlip
    const easySlipData = await callEasySlipV2(fileBuffer, file.name, file.type, apiKey, typedInvoice.amount);

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

    // EasySlip has now seen this slip and answers any resubmission with
    // isDuplicate, so every refusal from here on strands a real transfer.
    // Leave a trail an admin can find and settle it from.
    const refuse = (reason: string, body: Record<string, unknown>, status = 200) => {
      after(() =>
        logEvent({
          entityType: "billing",
          entityId: invoiceId,
          eventType: EventType.PLATFORM_PAYMENT_REJECTED,
          actorType: "host",
          actorId: user.id,
          data: {
            reason,
            host_id: typedHost.id,
            expected_amount: typedInvoice.amount,
            slip_amount: slipAmount,
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

    const slipAge = Date.now() - new Date(rawSlip.date).getTime();
    if (slipAge > MAX_SLIP_AGE_MS || slipAge < 0) {
      return refuse("slip_too_old", { verified: false, message: "Slip is too old." });
    }

    const receiverOk = validateReceiver(rawSlip, config.promptpay_id, config.bank_account_number);
    if (!receiverOk) {
      return refuse("receiver_mismatch", { verified: false, message: "Receiver does not match platform account." });
    }

    // EasySlip only reports a matchAmount mismatch (isAmountMatched); it never
    // rejects one. Without this a ฿1 transfer settled any invoice.
    if (slipAmount !== typedInvoice.amount) {
      return refuse("amount_mismatch", {
        verified: false,
        message: `Amount mismatch: expected ฿${typedInvoice.amount}, got ฿${slipAmount}`,
      });
    }

    const transRef = rawSlip.transRef;

    // Conditional on the invoice still being open: two slips sent together both
    // pass the status check above, and the second must not overwrite the first.
    const { data: updated, error: updateError } = await sc
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        slip_url: slipPath,
        slip_hash: slipHash,
        slip_trans_ref: transRef || null,
        easyslip_verified: true,
        easyslip_response: easySlipData,
        updated_by: typedHost.name,
      } as never)
      .eq("id", invoiceId)
      .in("status", ["pending", "overdue"])
      .select("id");

    if (updateError) {
      console.error("[Invoice Pay] update error:", updateError);
      // The unique index on invoices.slip_trans_ref catches a slip raced past
      // the hash check above, as in /plan/activate.
      const message = String(updateError.message || "").toLowerCase();
      if (message.includes("duplicate") || message.includes("unique")) {
        return refuse("duplicate", { error: "This payment slip has already been used.", duplicate: true }, 409);
      }
      return refuse("db_error", { error: "Failed to update invoice" }, 500);
    }

    if (!(updated as unknown[] | null)?.length) {
      return refuse("already_paid", { error: "Invoice already paid" }, 409);
    }

    after(async () => {
      await logEvent({
        entityType: "billing",
        entityId: invoiceId,
        eventType: EventType.INVOICE_PAID,
        actorType: "host",
        actorId: user.id,
        data: { amount: typedInvoice.amount, slip_hash: slipHash },
        req,
      });
    });

    return NextResponse.json({ success: true, verified: true });
  } catch (error) {
    console.error("[Invoice Pay] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
