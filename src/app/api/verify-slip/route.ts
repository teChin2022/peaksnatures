import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";

const slipRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000 });

// --- EasySlip API V2 Types ---

interface EasySlipV2RawSlip {
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
    account: {
      name: { th?: string; en?: string };
      bank?: { type: string; account: string };
      proxy?: { type: string; account: string };
    };
  };
  receiver: {
    bank: { id: string; name: string; short: string };
    account: {
      name: { th?: string; en?: string };
      bank?: { type: string; account: string };
      proxy?: { type: string; account: string };
    };
    merchantId?: string | null;
  };
}

interface EasySlipV2Success {
  success: true;
  data: {
    remark?: string;
    isDuplicate: boolean;
    matchedAccount: unknown;
    amountInOrder?: number;
    amountInSlip: number;
    isAmountMatched?: boolean;
    rawSlip: EasySlipV2RawSlip;
  };
  message: string;
}

interface EasySlipV2Error {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

type EasySlipV2Response = EasySlipV2Success | EasySlipV2Error;

// --- Auto-retry config for SLIP_PENDING (Bangkok Bank) ---
const SLIP_PENDING_MAX_RETRIES = 3;
const SLIP_PENDING_DELAY_MS = 15_000; // 15 seconds between retries

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call EasySlip V2 /verify/bank with auto-retry for SLIP_PENDING.
 */
async function callEasySlipV2(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileType: string,
  apiKey: string,
  expectedAmount: number,
): Promise<EasySlipV2Response> {
  for (let attempt = 0; attempt <= SLIP_PENDING_MAX_RETRIES; attempt++) {
    const form = new FormData();
    form.append("image", new File([fileBuffer], fileName, { type: fileType }));
    // V2 built-in amount matching
    if (expectedAmount > 0) {
      form.append("matchAmount", expectedAmount.toString());
    }
    // V2 built-in duplicate detection
    form.append("checkDuplicate", "true");

    const res = await fetch("https://api.easyslip.com/v2/verify/bank", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data: EasySlipV2Response = await res.json();

    // If SLIP_PENDING and we have retries left, wait and retry
    if (
      !data.success &&
      data.error.code === "SLIP_PENDING" &&
      attempt < SLIP_PENDING_MAX_RETRIES
    ) {
      console.log(
        `[Verify] SLIP_PENDING — retry ${attempt + 1}/${SLIP_PENDING_MAX_RETRIES} in ${SLIP_PENDING_DELAY_MS / 1000}s`
      );
      await sleep(SLIP_PENDING_DELAY_MS);
      continue;
    }

    return data;
  }

  // Should not reach here, but satisfy TS
  return { success: false, error: { code: "SLIP_PENDING", message: "Slip still pending after retries" } };
}

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
  const rateLimited = slipRateLimit.check(req);
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

    // Validate file size (max 4MB — V2 limit)
    const MAX_FILE_SIZE = 4 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 4MB." },
        { status: 400 }
      );
    }

    // Validate file type
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
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
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
    const slipHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Parallel: check both tables for duplicate slip hash
    const [{ data: hashDuplicate }, { data: dcHashDuplicate }] = await Promise.all([
      supabase.from("bookings").select("id").eq("payment_slip_hash", slipHash).limit(1),
      supabase.from("date_change_requests").select("id").eq("slip_hash", slipHash).limit(1),
    ]);

    if ((hashDuplicate as unknown[] | null)?.length || (dcHashDuplicate as unknown[] | null)?.length) {
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
      .createSignedUrl(slipPath, 60 * 60); // 1 hour for immediate preview
    const paymentSlipSignedUrl = signedUrlData?.signedUrl || null;

    // --- Call EasySlip V2 API with auto-retry for SLIP_PENDING ---
    if (!apiKey) {
      return NextResponse.json(
        { error: "Payment verification is not configured." },
        { status: 503 }
      );
    }

    const easySlipData = await callEasySlipV2(
      fileBuffer,
      file.name,
      file.type,
      apiKey,
      expectedAmount,
    );

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
        { error: "This payment slip has already been used (detected by EasySlip).", duplicate: true },
        { status: 409 }
      );
    }

    // Validate slip date — reject slips older than 1 hour
    const slipDate = new Date(rawSlip.date);
    const now = new Date();
    const slipAgeMs = now.getTime() - slipDate.getTime();
    const MAX_SLIP_AGE_MS = 60 * 60 * 1000; // 1 hour

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

    // Check for duplicate transaction reference (our own DB-level check)
    const transRef = rawSlip.transRef;
    if (transRef) {
      const [{ data: transRefDuplicate }, { data: dcTransRefDuplicate }] = await Promise.all([
        supabase.from("bookings").select("id").eq("slip_trans_ref", transRef).limit(1),
        supabase.from("date_change_requests").select("id").eq("slip_trans_ref", transRef).limit(1),
      ]);

      if ((transRefDuplicate as unknown[] | null)?.length || (dcTransRefDuplicate as unknown[] | null)?.length) {
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

    console.log("[Verify V2] Receiver from EasySlip:", {
      proxy: receiverProxy,
      bank: receiverBank,
      expected: expectedReceiver,
      expectedBank: expectedReceiverBank,
    });

    // EasySlip masks account numbers (e.g. "xxx-xxx-5198")
    // Extract only the visible (non-masked) digits for comparison
    const extractVisibleDigits = (val: string | undefined | null): string =>
      (val || "").replace(/[^0-9]/g, "");

    const expectedDigits = extractVisibleDigits(expectedReceiver);
    const expectedBankDigits = extractVisibleDigits(expectedReceiverBank);

    // Check if expected number ends with the visible digits from EasySlip
    const matchesAccount = (easyslipVal: string | undefined | null, expected: string): boolean => {
      if (!easyslipVal || !expected) return false;
      const visible = extractVisibleDigits(easyslipVal);
      if (!visible) return false;
      // If EasySlip returns full number, do exact match; if masked, match suffix
      return expected === visible || expected.endsWith(visible);
    };

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
        // Debug details logged server-side only
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
