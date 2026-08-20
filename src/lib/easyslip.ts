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

/**
 * Per-request timeout. EasySlip usually answers in 1-4s, but responses of
 * 17-23s have been observed under load. The old 8s turned every one of those
 * into an aborted fetch that threw, which /api/verify-slip could only report as
 * a bare 500 — and the booking client then posted with no slip_hash and got a
 * 400. Give the slow case room; anything past this still degrades gracefully.
 */
const EASYSLIP_FETCH_TIMEOUT_MS = 25_000;

/**
 * Wall-clock ceiling for the whole call including SLIP_PENDING retries. Without
 * it the retry path could budget ~77s of fetches plus sleeps inside a
 * serverless function, so the platform killed the invocation before it could
 * answer — the same 500, from a different direction. Must stay below the
 * route's exported maxDuration.
 *
 * At these numbers a SLIP_PENDING retry (25s + 15s + 25s) does not fit, so it
 * is skipped by design: the guest gets the "slip still pending, wait 2-3
 * minutes and try again" message and retries themselves, which is what the
 * booking UI already does. Sleeping 15s inside a serverless invocation to poll
 * an upstream is the wrong place for that wait.
 */
const EASYSLIP_TOTAL_BUDGET_MS = 50_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Build the structured error shape callers already know how to render. */
function easySlipError(code: string, message: string): EasySlipV2Error {
  return { success: false, error: { code, message } };
}

/**
 * Call EasySlip V2 /verify/bank with auto-retry for SLIP_PENDING.
 *
 * Never throws. Every upstream failure mode — a timeout, a dropped connection,
 * an HTML error page instead of JSON, a body that parses but is not the
 * documented shape — comes back as a normal EasySlipV2Error. That matters
 * because /api/verify-slip wraps this in a try/catch whose only output is a
 * bare 500, and the booking client treats a 500 as "keep going", posting a
 * booking with no slip_hash that the API then rejects with a confusing 400.
 * Degrading here keeps the guest on a real message instead.
 */
export async function callEasySlipV2(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileType: string,
  apiKey: string,
  expectedAmount: number,
): Promise<EasySlipV2Response> {
  const deadline = Date.now() + EASYSLIP_TOTAL_BUDGET_MS;

  for (let attempt = 0; attempt <= SLIP_PENDING_MAX_RETRIES; attempt++) {
    const form = new FormData();
    form.append("image", new File([fileBuffer], fileName, { type: fileType }));
    if (expectedAmount > 0) {
      form.append("matchAmount", expectedAmount.toString());
    }
    form.append("checkDuplicate", "true");

    let res: Response;
    try {
      res = await fetch("https://api.easyslip.com/v2/verify/bank", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(EASYSLIP_FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      // AbortSignal.timeout fires a TimeoutError here; DNS/TLS failures land
      // here too. Both used to escape as an unhandled throw.
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      console.error("[EasySlip] request failed:", err);
      return easySlipError(
        timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE",
        timedOut
          ? "Slip verification timed out. Please try again."
          : "Could not reach the slip verification service. Please try again.",
      );
    }

    // Read as text first: quota, auth and gateway errors routinely answer with
    // an HTML page or an empty body, and res.json() on those throws.
    const bodyText = await res.text().catch(() => "");
    let data: EasySlipV2Response;
    try {
      data = JSON.parse(bodyText) as EasySlipV2Response;
    } catch {
      console.error(
        `[EasySlip] non-JSON response (HTTP ${res.status}):`,
        bodyText.slice(0, 300),
      );
      return easySlipError(
        `HTTP_${res.status}`,
        res.status === 429
          ? "Slip verification is rate limited right now. Please try again shortly."
          : `Slip verification service returned an unexpected response (HTTP ${res.status}).`,
      );
    }

    // Parsed, but not necessarily the documented shape — guard before reading
    // data.error.code, which used to TypeError on a malformed error body.
    if (typeof data !== "object" || data === null || typeof data.success !== "boolean") {
      console.error(`[EasySlip] malformed body (HTTP ${res.status}):`, bodyText.slice(0, 300));
      return easySlipError("MALFORMED_RESPONSE", "Slip verification returned an unreadable response.");
    }

    if (!data.success) {
      const code = data.error?.code;
      if (!code) {
        return easySlipError("MALFORMED_RESPONSE", "Slip verification returned an unreadable error.");
      }
      if (code === "SLIP_PENDING" && attempt < SLIP_PENDING_MAX_RETRIES) {
        // Only sleep if the next attempt can still finish inside the budget.
        // Otherwise return now with a usable answer rather than being killed
        // mid-sleep and returning nothing at all.
        const nextAttemptEnds = Date.now() + SLIP_PENDING_DELAY_MS + EASYSLIP_FETCH_TIMEOUT_MS;
        if (nextAttemptEnds <= deadline) {
          await sleep(SLIP_PENDING_DELAY_MS);
          continue;
        }
      }
      return { success: false, error: { code, message: data.error.message || code } };
    }

    return data;
  }

  return easySlipError("SLIP_PENDING", "Slip still pending after retries");
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
