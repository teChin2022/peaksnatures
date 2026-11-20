/** Why a host-side booking route refused, as a `hostErrors` message key. */
export type HostErrorKey = "blocked" | "invalidStatus" | "alreadyCheckedIn" | "forbidden" | "stale";

/**
 * The booking routes answer with a code (`HOST_BLOCKED`, `INVALID_STATUS`…) or
 * an English sentence. Toasts used to show either raw; this reads the reason
 * so the host sees it in Thai. Null: unknown, the caller keeps its own message.
 * shortcut: matches the routes' wording, like slip-error.ts; give every route a code if it drifts.
 */
export function hostErrorKey(body: { error?: unknown; message?: unknown } | null): HostErrorKey | null {
  if (!body || typeof body.error !== "string") return null;
  const { error } = body;
  if (error === "HOST_BLOCKED" || /temporarily blocked|settle billing/i.test(error)) return "blocked";
  if (error === "INVALID_STATUS") return "invalidStatus";
  if (error === "ALREADY_CHECKED_IN") return "alreadyCheckedIn";
  if (error === "Forbidden") return "forbidden";
  if (/not found|already processed/i.test(error)) return "stale";
  return null;
}
