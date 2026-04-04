/**
 * Shared EasySlip V2 verification logic.
 * Used by /api/verify-slip (guest bookings) and billing routes (wallet top-up, invoice payment).
 */

// --- EasySlip API V2 Types ---

export interface EasySlipV2RawSlip {
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

export interface EasySlipV2Success {
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

export interface EasySlipV2Error {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type EasySlipV2Response = EasySlipV2Success | EasySlipV2Error;

// --- Auto-retry config for SLIP_PENDING (Bangkok Bank) ---
const SLIP_PENDING_MAX_RETRIES = 3;
const SLIP_PENDING_DELAY_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call EasySlip V2 /verify/bank with auto-retry for SLIP_PENDING.
 */
export async function callEasySlipV2(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileType: string,
  apiKey: string,
  expectedAmount: number,
): Promise<EasySlipV2Response> {
  for (let attempt = 0; attempt <= SLIP_PENDING_MAX_RETRIES; attempt++) {
    const form = new FormData();
    form.append("image", new File([fileBuffer], fileName, { type: fileType }));
    if (expectedAmount > 0) {
      form.append("matchAmount", expectedAmount.toString());
    }
    form.append("checkDuplicate", "true");

    const res = await fetch("https://api.easyslip.com/v2/verify/bank", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data: EasySlipV2Response = await res.json();

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

  return { success: false, error: { code: "SLIP_PENDING", message: "Slip still pending after retries" } };
}

/**
 * Compute SHA-256 hash of a file buffer.
 */
export async function computeSlipHash(fileBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Extract only visible (non-masked) digits from an EasySlip account string.
 */
export function extractVisibleDigits(val: string | undefined | null): string {
  return (val || "").replace(/[^0-9]/g, "");
}

/**
 * Check if an EasySlip account value matches an expected account number.
 * Handles masked values (e.g., "xxx-x-x1105-x").
 */
export function matchesAccount(easyslipVal: string | undefined | null, expected: string): boolean {
  if (!easyslipVal || !expected) return false;
  const visible = extractVisibleDigits(easyslipVal);
  if (!visible) return false;
  return expected === visible || expected.includes(visible);
}

/**
 * Validate receiver account against expected PromptPay/bank account.
 */
export function validateReceiver(
  rawSlip: EasySlipV2RawSlip,
  expectedReceiver: string | null,
  expectedReceiverBank: string | null,
): boolean {
  if (!expectedReceiver) return true;

  const receiverProxy = rawSlip.receiver?.account?.proxy?.account;
  const receiverBank = rawSlip.receiver?.account?.bank?.account;
  const expectedDigits = extractVisibleDigits(expectedReceiver);
  const expectedBankDigits = extractVisibleDigits(expectedReceiverBank);

  return !!(
    matchesAccount(receiverProxy, expectedDigits) ||
    matchesAccount(receiverBank, expectedDigits) ||
    (expectedBankDigits && matchesAccount(receiverBank, expectedBankDigits)) ||
    (expectedBankDigits && matchesAccount(receiverProxy, expectedBankDigits))
  );
}

// File validation constants
export const MAX_FILE_SIZE = 4 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const MAX_SLIP_AGE_MS = 60 * 60 * 1000; // 1 hour
