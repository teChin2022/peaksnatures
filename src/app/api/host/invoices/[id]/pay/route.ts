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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    if (!config) {
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

    // Check duplicate
    const { data: dupCheck } = await sc
      .from("invoices")
      .select("id")
      .eq("slip_hash", slipHash)
      .limit(1);

    if ((dupCheck as unknown[] | null)?.length) {
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

    if (easySlipData.data.isDuplicate) {
      return NextResponse.json({ error: "Slip already used (EasySlip)", duplicate: true }, { status: 409 });
    }

    const slipAge = Date.now() - new Date(rawSlip.date).getTime();
    if (slipAge > MAX_SLIP_AGE_MS || slipAge < 0) {
      return NextResponse.json({ verified: false, message: "Slip is too old." });
    }

    const receiverOk = validateReceiver(rawSlip, config.promptpay_id, config.bank_account_number);
    if (!receiverOk) {
      return NextResponse.json({ verified: false, message: "Receiver does not match platform account." });
    }

    const transRef = rawSlip.transRef;

    // Mark invoice as paid
    const { error: updateError } = await sc
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
      .eq("id", invoiceId);

    if (updateError) {
      console.error("[Invoice Pay] update error:", updateError);
      return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
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
