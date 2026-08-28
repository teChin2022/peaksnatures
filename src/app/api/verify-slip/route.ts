import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  callEasySlipV2,
  computeSlipHash,
  extractVisibleDigits,
  matchesAccount,
  MAX_FILE_SIZE,
  ALLOWED_TYPES,
  MAX_SLIP_AGE_MS,
} from "@/lib/easyslip";

/**
 * Must exceed EASYSLIP_TOTAL_BUDGET_MS (45s) in src/lib/easyslip.ts. With no
 * maxDuration the platform default killed this mid-verification and the guest
 * got a bare 500. Vercel clamps this to the plan maximum.
 */
export const maxDuration = 60;

const slipRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000, name: "verify-slip" });

/**
 * Pure slip verification endpoint.
 * Verifies the slip image via EasySlip V2, checks for duplicates, validates amount/receiver.
 * Does NOT create or modify bookings — the caller decides what to do next.
 *
 * Returns on success: { verified: true, slip_hash, slip_trans_ref, easyslip_response, payment_slip_url }
 * Returns on failure: { verified: false, message, ... } or { error, duplicate: true } (409)
 * Returns on SLIP_PENDING: { verified: false, slip_pending: true, message, ... }
 */
export async function POST(req: NextRequest) {
  const rateLimited = await slipRateLimit.check(req);
  if (rateLimited) return rateLimited;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const expectedAmount = Number(formData.get("expected_amount") || "0");
    const expectedReceiver = formData.get("expected_receiver") as string | null;
    const expectedReceiverBank = formData.get("expected_receiver_bank") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 4MB." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP, and HEIC images are allowed." },
        { status: 400 }
      );
    }

    const apiKey = process.env.EASYSLIP_API_KEY;
    const supabase = createServiceRoleClient();

    // Compute file hash for duplicate detection (our own DB-level check)
    const fileBuffer = await file.arrayBuffer();
    const slipHash = await computeSlipHash(fileBuffer);

    // Cross-table duplicate slip check
    const [bk, grp, dc, inv, wtx] = await Promise.all([
      supabase.from("bookings").select("id").eq("payment_slip_hash", slipHash).limit(1),
      supabase.from("booking_groups").select("id").eq("payment_slip_hash", slipHash).limit(1),
      supabase.from("date_change_requests").select("id").eq("slip_hash", slipHash).limit(1),
      supabase.from("invoices").select("id").eq("slip_hash", slipHash).limit(1),
      supabase.from("wallet_transactions").select("id").eq("slip_hash", slipHash).limit(1),
    ]);

    if ([bk, grp, dc, inv, wtx].some((r) => (r.data as unknown[] | null)?.length)) {
      return NextResponse.json(
        { error: "This payment slip has already been used for another booking.", duplicate: true },
        { status: 409 }
      );
    }

    // Checked before any upload — no point storing a slip we can't verify.
    if (!apiKey) {
      return NextResponse.json(
        { error: "Payment verification is not configured." },
        { status: 503 }
      );
    }

    // Upload slip to temporary storage (will be moved to booking path after booking creation)
    const tempId = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "jpg";
    const slipPath = `pending/${tempId}/slip.${ext}`;

    // The upload and its signed URL have nothing to do with the EasySlip call,
    // but used to run to completion before it started — measured at ~690ms of
    // dead time on a 1.5MB slip, on top of EasySlip's own 1-4s. Run both in
    // flight together; every response path below still gets its signed URL.
    const storageTask = (async (): Promise<string | null> => {
      try {
        const fileFromBuffer = new File([fileBuffer], file.name, { type: file.type });
        await supabase.storage
          .from("payment-slips")
          .upload(slipPath, fileFromBuffer, { upsert: true, contentType: file.type });

        const { data: signedUrlData } = await supabase.storage
          .from("payment-slips")
          .createSignedUrl(slipPath, 60 * 60); // 1 hour for immediate preview
        return signedUrlData?.signedUrl || null;
      } catch (err) {
        // The upload result was never error-checked here; a storage blip must
        // not become a 500 that costs the guest their verified slip.
        console.error("[Verify Slip] storage failed (non-fatal):", err);
        return null;
      }
    })();

    // --- Call EasySlip V2 API with auto-retry for SLIP_PENDING ---
    const [easySlipData, paymentSlipSignedUrl] = await Promise.all([
      callEasySlipV2(
        fileBuffer,
        file.name,
        file.type,
        apiKey,
        expectedAmount,
      ),
      storageTask,
    ]);

    // Handle V2 error responses
    if (!easySlipData.success) {
      // Special handling for SLIP_PENDING (all retries exhausted)
      if (easySlipData.error.code === "SLIP_PENDING") {
        return NextResponse.json({
          verified: false,
          slip_pending: true,
          message: "Bangkok Bank slips need a few minutes to process. Please wait 2-3 minutes and try again.",
          slip_hash: slipHash,
          payment_slip_url: slipPath,
          payment_slip_signed_url: paymentSlipSignedUrl,
          easyslip_response: easySlipData,
        });
      }

      return NextResponse.json({
        verified: false,
        message: `Slip verification failed: ${easySlipData.error.message}`,
        slip_hash: slipHash,
        payment_slip_url: slipPath,
        payment_slip_signed_url: paymentSlipSignedUrl,
        easyslip_response: easySlipData,
      });
    }

    const rawSlip = easySlipData.data.rawSlip;

    // V2 built-in duplicate detection
    if (easySlipData.data.isDuplicate) {
      return NextResponse.json(
        { error: "This payment slip has already been used.", duplicate: true },
        { status: 409 }
      );
    }

    // Validate slip date — reject slips older than 1 hour
    const slipDate = new Date(rawSlip.date);
    const now = new Date();
    const slipAgeMs = now.getTime() - slipDate.getTime();

    if (slipAgeMs > MAX_SLIP_AGE_MS || slipAgeMs < 0) {
      return NextResponse.json({
        verified: false,
        message: "Payment slip is too old or has an invalid date. Please use a recent transfer slip (within 1 hour).",
        slip_hash: slipHash,
        payment_slip_url: slipPath,
        payment_slip_signed_url: paymentSlipSignedUrl,
        easyslip_response: easySlipData,
      });
    }

    // Cross-table duplicate trans_ref check
    const transRef = rawSlip.transRef;
    if (transRef) {
      const [bkRef, grpRef, dcRef, invRef, wtxRef] = await Promise.all([
        supabase.from("bookings").select("id").eq("slip_trans_ref", transRef).limit(1),
        supabase.from("booking_groups").select("id").eq("slip_trans_ref", transRef).limit(1),
        supabase.from("date_change_requests").select("id").eq("slip_trans_ref", transRef).limit(1),
        supabase.from("invoices").select("id").eq("slip_trans_ref", transRef).limit(1),
        supabase.from("wallet_transactions").select("id").eq("slip_trans_ref", transRef).limit(1),
      ]);

      if ([bkRef, grpRef, dcRef, invRef, wtxRef].some((r) => (r.data as unknown[] | null)?.length)) {
        return NextResponse.json(
          { error: "This payment transaction has already been used for another booking.", duplicate: true },
          { status: 409 }
        );
      }
    }

    // V2 built-in amount matching (if matchAmount was sent)
    const amountMatchedByV2 = easySlipData.data.isAmountMatched;
    // Fallback: our own amount check
    const slipAmount = easySlipData.data.amountInSlip ?? rawSlip.amount.amount;
    const amountMatch = amountMatchedByV2 === true || slipAmount === expectedAmount;

    // Receiver matching (still our own — V2 matchAccount requires dashboard config)
    const receiverProxy = rawSlip.receiver?.account?.proxy?.account;
    const receiverBank = rawSlip.receiver?.account?.bank?.account;

    const expectedDigits = extractVisibleDigits(expectedReceiver);
    const expectedBankDigits = extractVisibleDigits(expectedReceiverBank);

    // Match against promptpay_id (proxy or bank) OR bank_account_number
    const receiverMatch =
      !expectedReceiver ||
      matchesAccount(receiverProxy, expectedDigits) ||
      matchesAccount(receiverBank, expectedDigits) ||
      (expectedBankDigits && matchesAccount(receiverBank, expectedBankDigits)) ||
      (expectedBankDigits && matchesAccount(receiverProxy, expectedBankDigits));

    if (!amountMatch || !receiverMatch) {
      return NextResponse.json({
        verified: false,
        message: `Verification mismatch. ${!amountMatch ? `Amount: expected ฿${expectedAmount}, got ฿${slipAmount}.` : ""} ${!receiverMatch ? "Receiver account does not match." : ""}`.trim(),
        slip_hash: slipHash,
        payment_slip_url: slipPath,
        payment_slip_signed_url: paymentSlipSignedUrl,
        easyslip_response: easySlipData,
        ...(process.env.NODE_ENV === "development" ? {
          debug: {
            expected_receiver: expectedReceiver,
            expected_normalized: expectedDigits,
            easyslip_proxy: receiverProxy || null,
            easyslip_bank: receiverBank || null,
            full_receiver: rawSlip.receiver,
            expected_amount: expectedAmount,
            slip_amount: slipAmount,
            v2_isAmountMatched: amountMatchedByV2,
          },
        } : {}),
      });
    }

    // All checks passed
    return NextResponse.json({
      verified: true,
      message: "Payment verified!",
      slip_hash: slipHash,
      slip_trans_ref: transRef || null,
      payment_slip_url: slipPath,
      payment_slip_signed_url: paymentSlipSignedUrl,
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
