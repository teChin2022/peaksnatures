import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface EasySlipResponse {
  status: number;
  data?: {
    payload: string;
    transRef: string;
    date: string;
    countryCode: string;
    amount: {
      amount: number;
      local?: { amount: number; currency: string };
    };
    fee: number;
    ref1: string;
    ref2: string;
    ref3: string;
    sender: {
      bank: { id: string; name: string; short: string };
      account: { name: { th: string; en: string }; bank?: { type: string; account: string }; proxy?: { type: string; account: string } };
    };
    receiver: {
      bank: { id: string; name: string; short: string };
      account: { name: { th: string; en: string }; bank?: { type: string; account: string }; proxy?: { type: string; account: string } };
      merchantId?: string;
    };
  };
  error?: string;
}

/**
 * Pure slip verification endpoint.
 * Verifies the slip image, checks for duplicates, validates amount/receiver.
 * Does NOT create or modify bookings — the caller decides what to do next.
 *
 * Returns on success: { verified: true, slip_hash, slip_trans_ref, easyslip_response, payment_slip_url }
 * Returns on failure: { verified: false, message, ... } or { error, duplicate: true } (409)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const expectedAmount = Number(formData.get("expected_amount") || "0");
    const expectedReceiver = formData.get("expected_receiver") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    const apiKey = process.env.EASYSLIP_API_KEY;
    const supabase = createServiceRoleClient();

    // Compute file hash for duplicate detection
    const fileBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
    const slipHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Check if this exact slip image was already used on another booking
    const { data: hashDuplicate } = await supabase
      .from("bookings")
      .select("id")
      .eq("payment_slip_hash", slipHash)
      .limit(1);

    if ((hashDuplicate as unknown[] | null)?.length) {
      return NextResponse.json(
        { error: "This payment slip has already been used for another booking.", duplicate: true },
        { status: 409 }
      );
    }

    // Upload slip to temporary storage (will be moved to booking path after booking creation)
    const tempId = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "jpg";
    const slipPath = `pending/${tempId}/slip.${ext}`;
    const fileFromBuffer = new File([fileBuffer], file.name, { type: file.type });
    await supabase.storage
      .from("payment-slips")
      .upload(slipPath, fileFromBuffer, { upsert: true, contentType: file.type });

    const { data: signedUrlData } = await supabase.storage
      .from("payment-slips")
      .createSignedUrl(slipPath, 60 * 60 * 24 * 365);
    const paymentSlipUrl = signedUrlData?.signedUrl || null;

    // --- Demo mode ---
    if (!apiKey || apiKey === "your_easyslip_api_key") {
      console.log("[Demo] Simulating EasySlip verification...");
      const demoResponse = {
        status: 200,
        data: {
          amount: { amount: expectedAmount },
          receiver: {
            proxy: { type: "MOBILE", account: expectedReceiver },
          },
        },
      };

      return NextResponse.json({
        verified: true,
        message: "Payment slip verified successfully (demo mode)",
        slip_hash: slipHash,
        slip_trans_ref: null,
        payment_slip_url: paymentSlipUrl,
        easyslip_response: demoResponse,
      });
    }

    // --- Production: Call EasySlip API ---
    const easySlipForm = new FormData();
    easySlipForm.append("file", new File([fileBuffer], file.name, { type: file.type }));

    const easySlipRes = await fetch(
      "https://developer.easyslip.com/api/v1/verify",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: easySlipForm,
      }
    );

    const easySlipData: EasySlipResponse = await easySlipRes.json();

    if (easySlipData.status !== 200 || !easySlipData.data) {
      return NextResponse.json({
        verified: false,
        message: "Slip verification failed. The payment slip could not be verified.",
        slip_hash: slipHash,
        payment_slip_url: paymentSlipUrl,
        easyslip_response: easySlipData,
      });
    }

    // Validate slip date — reject slips older than 1 hour
    const slipDate = new Date(easySlipData.data.date);
    const now = new Date();
    const slipAgeMs = now.getTime() - slipDate.getTime();
    const MAX_SLIP_AGE_MS = 60 * 60 * 1000; // 1 hour

    if (slipAgeMs > MAX_SLIP_AGE_MS || slipAgeMs < 0) {
      return NextResponse.json({
        verified: false,
        message: "Payment slip is too old or has an invalid date. Please use a recent transfer slip (within 1 hour).",
        slip_hash: slipHash,
        payment_slip_url: paymentSlipUrl,
        easyslip_response: easySlipData,
      });
    }

    // Check for duplicate transaction reference
    const transRef = easySlipData.data.transRef;
    if (transRef) {
      const { data: transRefDuplicate } = await supabase
        .from("bookings")
        .select("id")
        .eq("slip_trans_ref", transRef)
        .limit(1);

      if ((transRefDuplicate as unknown[] | null)?.length) {
        return NextResponse.json(
          { error: "This payment transaction has already been used for another booking.", duplicate: true },
          { status: 409 }
        );
      }
    }

    // Validate amount and receiver
    const slipAmount = easySlipData.data.amount.amount;
    const amountMatch = slipAmount === expectedAmount;

    // Collect all possible receiver account values from the EasySlip response
    const receiverProxy = easySlipData.data.receiver?.account?.proxy?.account;
    const receiverBank = easySlipData.data.receiver?.account?.bank?.account;

    console.log("[Verify] Receiver from EasySlip:", {
      proxy: receiverProxy,
      bank: receiverBank,
      expected: expectedReceiver,
    });

    // EasySlip masks account numbers (e.g. "xxx-xxx-5198")
    // Extract only the visible (non-masked) digits for comparison
    const extractVisibleDigits = (val: string | undefined | null): string =>
      (val || "").replace(/[^0-9]/g, "");

    const expectedDigits = extractVisibleDigits(expectedReceiver);

    // Check if expected number ends with the visible digits from EasySlip
    const matchesAccount = (easyslipVal: string | undefined | null): boolean => {
      if (!easyslipVal) return false;
      const visible = extractVisibleDigits(easyslipVal);
      if (!visible) return false;
      // If EasySlip returns full number, do exact match; if masked, match suffix
      return expectedDigits === visible || expectedDigits.endsWith(visible);
    };

    const receiverMatch =
      !expectedReceiver ||
      matchesAccount(receiverProxy) ||
      matchesAccount(receiverBank);

    if (!amountMatch || !receiverMatch) {
      return NextResponse.json({
        verified: false,
        message: `Verification mismatch. ${!amountMatch ? `Amount: expected ฿${expectedAmount}, got ฿${slipAmount}.` : ""} ${!receiverMatch ? "Receiver account does not match." : ""}`.trim(),
        slip_hash: slipHash,
        payment_slip_url: paymentSlipUrl,
        easyslip_response: easySlipData,
        debug: {
          expected_receiver: expectedReceiver,
          expected_normalized: expectedDigits,
          easyslip_proxy: receiverProxy || null,
          easyslip_bank: receiverBank || null,
          full_receiver: easySlipData.data.receiver,
          expected_amount: expectedAmount,
          slip_amount: slipAmount,
        },
      });
    }

    // All checks passed
    return NextResponse.json({
      verified: true,
      message: "Payment verified!",
      slip_hash: slipHash,
      slip_trans_ref: transRef || null,
      payment_slip_url: paymentSlipUrl,
      easyslip_response: easySlipData,
    });
  } catch (error) {
    console.error("Verify slip error:", error);
    return NextResponse.json(
      { error: "Failed to verify slip" },
      { status: 500 }
    );
  }
}
