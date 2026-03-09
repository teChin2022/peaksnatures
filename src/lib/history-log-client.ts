/**
 * Client-side helper for logging events from dashboard pages.
 * Calls POST /api/history-log (requires authenticated host session).
 * Fire-and-forget — never blocks the UI.
 */
export function logClientEvent(params: {
  homestay_id?: string | null;
  entity_type: string;
  entity_id: string;
  event_type: string;
  actor_type?: "host" | "admin";
  data?: Record<string, unknown>;
}): void {
  fetch("/api/history-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {
    // silent — logging should never block the user
  });
}
