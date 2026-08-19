/**
 * Client-side beacon for anonymous demand events on the public /[slug] page.
 *
 * Fire-and-forget by contract: every path here swallows its own errors. The
 * booking flow is the revenue path — tracking may fail, the booking may not.
 * Same fail-open stance as src/lib/turnstile.ts and src/lib/rate-limit.ts.
 *
 * Server counterpart: POST /api/demand (src/app/api/demand/route.ts).
 */
import type { DemandEventType, DemandStep } from "@/lib/demand-events";

const ENDPOINT = "/api/demand";
const SESSION_KEY = "pn_did";
const FLUSH_DEBOUNCE_MS = 1000;
/** Matches the `.max(20)` on the ingest route's zod schema. */
const MAX_BATCH = 20;

export interface DemandEventInput {
  homestayId: string;
  eventType: DemandEventType;
  /**
   * "yyyy-MM-dd". Callers must format with date-fns `format()`, never
   * `Date.toISOString()` — the site runs in Asia/Bangkok (UTC+7), so UTC
   * serialisation shifts every check-in back a day.
   */
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number | null;
  step?: DemandStep | null;
  locale?: string | null;
  data?: Record<string, unknown>;
}

/** Wire shape — snake_case, mirrors the demand_events columns exactly. */
interface DemandEventPayload {
  homestay_id: string;
  session_id: string;
  event_type: DemandEventType;
  check_in?: string | null;
  check_out?: string | null;
  nights?: number | null;
  step?: DemandStep | null;
  device?: "mobile" | "desktop" | null;
  locale?: string | null;
  data?: Record<string, unknown>;
}

let memorySessionId: string | null = null;
let queue: DemandEventPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;
const onceKeys = new Set<string>();

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Older Safari without randomUUID, or a non-secure context.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * Anonymous per-visit id. sessionStorage (not a cookie) so it dies with the
 * tab and never follows the guest across visits. Safari private mode throws on
 * access, hence the in-memory fallback.
 */
export function getDemandSessionId(): string {
  if (memorySessionId) return memorySessionId;
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      memorySessionId = existing;
      return existing;
    }
    const fresh = randomId();
    sessionStorage.setItem(SESSION_KEY, fresh);
    memorySessionId = fresh;
    return fresh;
  } catch {
    memorySessionId = randomId();
    return memorySessionId;
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Skip only on an explicit decline. An absent cookie still tracks: these events
 * carry no personal data and never leave our own origin.
 */
function consentDeclined(): boolean {
  try {
    return getCookie("cookie_consent") === "declined";
  } catch {
    return false;
  }
}

/** Cheap headless filter. Crawlers run JS and would otherwise inflate page_view. */
function isBot(): boolean {
  try {
    return navigator.webdriver === true;
  } catch {
    return false;
  }
}

function getDevice(): "mobile" | "desktop" {
  try {
    return window.matchMedia("(min-width: 768px)").matches ? "desktop" : "mobile";
  } catch {
    return "mobile";
  }
}

function send(batch: DemandEventPayload[]): void {
  if (batch.length === 0) return;
  const body = JSON.stringify(batch);
  try {
    if (navigator.sendBeacon) {
      // Off the main thread and survives unload — the reason page_view and the
      // final funnel steps are not lost when the guest closes the tab.
      const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
  } catch {
    // fall through to fetch
  }
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // silent — tracking must never surface to the guest
  }
}

function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  send(batch);
}

function bindFlushListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  try {
    // visibilitychange is the reliable one on mobile Safari; pagehide covers
    // desktop tab close. Both are idempotent — flush() no-ops on an empty queue.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
  } catch {
    // silent
  }
}

/**
 * Queue one event. Never throws, never returns a promise, never blocks.
 * Deliberately synchronous so it can sit inside the hold-acquisition path
 * without widening any race window.
 */
export function trackDemand(input: DemandEventInput): void {
  if (typeof window === "undefined") return;
  try {
    if (consentDeclined() || isBot()) return;

    queue.push({
      homestay_id: input.homestayId,
      session_id: getDemandSessionId(),
      event_type: input.eventType,
      check_in: input.checkIn ?? null,
      check_out: input.checkOut ?? null,
      nights: input.nights ?? null,
      step: input.step ?? null,
      device: getDevice(),
      locale: input.locale ?? null,
      data: input.data ?? {},
    });

    bindFlushListeners();

    if (queue.length >= MAX_BATCH) {
      flush();
      return;
    }
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
  } catch {
    // silent
  }
}

/**
 * Queue an event at most once per page lifetime. For page_view and
 * calendar_view, where a re-mount or a second scroll past the section must not
 * count as a second session reaching that stage.
 */
export function trackDemandOnce(key: string, input: DemandEventInput): void {
  if (typeof window === "undefined") return;
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  trackDemand(input);
}
