/** Why the platform refused a host's payment slip, as a `slipErrors` message key. */
export type SlipErrorKey = "duplicate" | "tooOld" | "receiver" | "amount" | "failed";

/**
 * The invoice-pay, plan-activate and wallet-topup routes refuse a slip with a
 * `duplicate` flag or an English message, not a code. Reads the reason from
 * those messages so the host sees it in Thai.
 * shortcut: matches the routes' wording; give them a `code` if it changes often.
 */
export function slipErrorKey(body: { duplicate?: boolean; error?: string; message?: string } | null): SlipErrorKey {
  if (!body) return "failed";
  if (body.duplicate) return "duplicate";
  const text = `${body.error ?? ""} ${body.message ?? ""}`;
  if (/too old/i.test(text)) return "tooOld";
  if (/receiver does not match/i.test(text)) return "receiver";
  if (/amount mismatch/i.test(text)) return "amount";
  return "failed";
}
