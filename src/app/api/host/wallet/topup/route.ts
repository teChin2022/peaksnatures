import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
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

    const sc = createServiceRoleClient();

    // Get host
    const { data: host } = await sc
      .from("hosts")
      .select("id, plan_type, name")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const typedHost = host as { id: string; plan_type: string; name: string };

    // Get platform billing config for payment verification
    const config = await getBillingConfig();
    if (!config) {
      return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const expectedAmount = Number(formData.get("amount") || "0");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    if (expectedAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const apiKey = process.env.EASYSLIP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Payment verification not configured" }, { status: 503 });
    }

    const fileBuffer = await file.arrayBuffer();
    const slipHash = await computeSlipHash(fileBuffer);

    // Cross-table duplicate slip check
    const [wtx, inv, bk, dc] = await Promise.all([
      sc.from("wallet_transactions").select("id").eq("slip_hash", slipHash).limit(1),
      sc.from("invoices").select("id").eq("slip_hash", slipHash).limit(1),
      sc.from("bookings").select("id").eq("payment_slip_hash", slipHash).limit(1),
      sc.from("date_change_requests").select("id").eq("slip_hash", slipHash).limit(1),
    ]);

    if ([wtx, inv, bk, dc].some((r) => (r.data as unknown[] | null)?.length)) {
      return NextResponse.json(
        { error: "This slip has already been used", duplicate: true },
        { status: 409 }
      );
    }

    // Upload slip
    const tempId = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "jpg";
    const slipPath = `wallet/${typedHost.id}/${tempId}.${ext}`;
    await sc.storage
      .from("payment-slips")
      .upload(slipPath, new File([fileBuffer], file.name, { type: file.type }), {
        upsert: true,
        contentType: file.type,
      });

    // Verify via EasySlip
    const easySlipData = await callEasySlipV2(fileBuffer, file.name, file.type, apiKey, expectedAmount);

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
      return NextResponse.json(
        { error: "This payment slip has already been used.", duplicate: true },
        { status: 409 }
      );
    }

    // Check slip age
    const slipAge = Date.now() - new Date(rawSlip.date).getTime();
    if (slipAge > MAX_SLIP_AGE_MS || slipAge < 0) {
      return NextResponse.json({ verified: false, message: "Slip is too old. Use a recent transfer." });
    }

    // Verify receiver is the platform account
    const receiverOk = validateReceiver(rawSlip, config.promptpay_id, config.bank_account_number);
    if (!receiverOk) {
      return NextResponse.json({ verified: false, message: "Receiver does not match platform account." });
    }

    // Amount check
    const slipAmount = easySlipData.data.amountInSlip ?? rawSlip.amount.amount;
    if (slipAmount !== expectedAmount) {
      return NextResponse.json({
        verified: false,
        message: `Amount mismatch: expected ฿${expectedAmount}, got ฿${slipAmount}`,
      });
    }

    const transRef = rawSlip.transRef;

    // Atomic wallet top-up via RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error: topupError } = await (sc.rpc as any)("topup_wallet", {
      p_host_id: typedHost.id,
      p_amount: expectedAmount,
      p_slip_url: slipPath,
      p_slip_hash: slipHash,
      p_slip_trans_ref: transRef || null,
      p_easyslip_verified: true,
      p_easyslip_response: easySlipData,
      p_created_by: typedHost.name,
    });

    if (topupError) {
      console.error("[Wallet Topup] RPC error:", topupError);
      return NextResponse.json({ error: "Failed to process top-up" }, { status: 500 });
    }

    const newBalance = (result as { new_balance: number }[])?.[0]?.new_balance ?? 0;

    after(async () => {
      await logEvent({
        entityType: "billing",
        entityId: typedHost.id,
        eventType: EventType.WALLET_TOPUP,
        actorType: "host",
        actorId: user.id,
        data: { amount: expectedAmount, new_balance: newBalance, slip_hash: slipHash },
        req,
      });
    });

    return NextResponse.json({
      success: true,
      verified: true,
      amount: expectedAmount,
      new_balance: newBalance,
    });
  } catch (error) {
    console.error("[Wallet Topup] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
