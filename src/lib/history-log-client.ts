/**
 * Client-side helper for logging events from dashboard pages.
 * Calls POST /api/history-log (requires authenticated host session).
 * Returns a Promise so callers can optionally await it (e.g., before signOut).
 * Most callers should treat it as fire-and-forget.
 */
export function logClientEvent(params: {
  homestay_id?: string | null;
  entity_type: string;
  entity_id: string;
  event_type: string;
  actor_type?: "host" | "admin";
  data?: Record<string, unknown>;
}): Promise<void> {
  return fetch("/api/history-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then(() => {}).catch(() => {
    // silent — logging should never block the user
  });
}
