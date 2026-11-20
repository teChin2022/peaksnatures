// Import-free on purpose: the admin Logs page (a client component) reads it.

// ============================================================
// Event type constants
// ============================================================
export const EventType = {
  // Booking lifecycle
  BOOKING_CREATED: "BOOKING_CREATED",
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  BOOKING_REJECTED: "BOOKING_REJECTED",
  BALANCE_PAID: "BALANCE_PAID",
  CHECKIN: "CHECKIN",
  CHECKOUT: "CHECKOUT",
  BOOKING_ATTACHMENT_ADDED: "BOOKING_ATTACHMENT_ADDED",
  BOOKING_ATTACHMENT_REMOVED: "BOOKING_ATTACHMENT_REMOVED",

  // Property management
  PROPERTY_CREATED: "PROPERTY_CREATED",
  PROPERTY_UPDATED: "PROPERTY_UPDATED",
  PROPERTY_TOGGLED: "PROPERTY_TOGGLED",

  // Room management
  ROOM_CREATED: "ROOM_CREATED",
  ROOM_UPDATED: "ROOM_UPDATED",
  ROOM_DELETED: "ROOM_DELETED",
  PRICE_UPDATED: "PRICE_UPDATED",

  // Host lifecycle
  HOST_REGISTERED: "HOST_REGISTERED",
  HOST_APPROVED: "HOST_APPROVED",
  HOST_REJECTED: "HOST_REJECTED",
  HOST_LOGIN: "HOST_LOGIN",
  HOST_LOGOUT: "HOST_LOGOUT",
  FAILED_LOGIN: "FAILED_LOGIN",
  PROFILE_UPDATED: "PROFILE_UPDATED",

  // Blocked dates
  BLOCKED_DATE_ADDED: "BLOCKED_DATE_ADDED",
  BLOCKED_DATE_REMOVED: "BLOCKED_DATE_REMOVED",

  // Reviews
  REVIEW_SUBMITTED: "REVIEW_SUBMITTED",

  // Admin
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  ADMIN_LOGIN: "ADMIN_LOGIN",
  // A signed-in account that is not in platform_admins reached the admin gate.
  ADMIN_ACCESS_DENIED: "ADMIN_ACCESS_DENIED",
  HOST_VERIFIED: "HOST_VERIFIED",
  BOOKING_HOLD_RELEASED: "BOOKING_HOLD_RELEASED",
  BILLING_CONFIG_UPDATED: "BILLING_CONFIG_UPDATED",

  // Host staff logins (migration 081)
  STAFF_ADDED: "STAFF_ADDED",
  STAFF_PASSWORD_RESET: "STAFF_PASSWORD_RESET",
  STAFF_REMOVED: "STAFF_REMOVED",

  // Date change
  BOOKING_DATE_CHANGE_REQUESTED: "BOOKING_DATE_CHANGE_REQUESTED",
  BOOKING_DATE_CHANGE_APPROVED: "BOOKING_DATE_CHANGE_APPROVED",
  BOOKING_DATE_CHANGE_REJECTED: "BOOKING_DATE_CHANGE_REJECTED",

  // Billing & Plans
  COMMISSION_DEDUCTED: "COMMISSION_DEDUCTED",
  COMMISSION_REFUNDED: "COMMISSION_REFUNDED",
  WALLET_TOPUP: "WALLET_TOPUP",
  WALLET_ADJUSTMENT: "WALLET_ADJUSTMENT",
  WALLET_LOW_BALANCE: "WALLET_LOW_BALANCE",
  INVOICE_CREATED: "INVOICE_CREATED",
  INVOICE_PAID: "INVOICE_PAID",
  INVOICE_OVERDUE: "INVOICE_OVERDUE",
  PLAN_CHANGED: "PLAN_CHANGED",
  PLAN_SWITCH_SCHEDULED: "PLAN_SWITCH_SCHEDULED",
  PLAN_EXPIRED: "PLAN_EXPIRED",
  RATE_OVERRIDE_CHANGED: "RATE_OVERRIDE_CHANGED",
  BILLING_RETRY_EXHAUSTED: "BILLING_RETRY_EXHAUSTED",
  // A slip EasySlip verified that we then refused — real money with no row.
  PLATFORM_PAYMENT_REJECTED: "PLATFORM_PAYMENT_REJECTED",
  // An admin marked a rejected payment settled by hand (082), or undid that.
  PLATFORM_PAYMENT_SETTLED: "PLATFORM_PAYMENT_SETTLED",
  PLATFORM_PAYMENT_UNSETTLED: "PLATFORM_PAYMENT_UNSETTLED",

  // Guest AI assistant (migration 084)
  GUEST_AI_REQUESTED: "GUEST_AI_REQUESTED",
  GUEST_AI_APPROVED: "GUEST_AI_APPROVED",
  GUEST_AI_REJECTED: "GUEST_AI_REJECTED",
  GUEST_AI_SUSPENDED: "GUEST_AI_SUSPENDED",
  GUEST_AI_RESUMED: "GUEST_AI_RESUMED",
  GUEST_AI_CAP_CHANGED: "GUEST_AI_CAP_CHANGED",
  GUEST_AI_SETTINGS_CHANGED: "GUEST_AI_SETTINGS_CHANGED",
  // The platform kill switch or daily cap (migration 085).
  GUEST_AI_PLATFORM_CHANGED: "GUEST_AI_PLATFORM_CHANGED",
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

// ============================================================
// Readable labels (admin is English-only)
// ============================================================

/** Words that read wrong when an enum is just lower-cased: user-facing copy says House and Homestay. */
const WORD_LABELS: Record<string, string> = {
  room: "house",
  rooms: "houses",
  property: "homestay",
  checkin: "check-in",
  checkout: "check-out",
  topup: "top-up",
  id: "ID",
  ip: "IP",
  otp: "OTP",
  ai: "AI",
  url: "URL",
  pct: "%",
};

/** Events whose plain reading would mislead. */
const EVENT_LABELS: Partial<Record<string, string>> = {
  HOST_VERIFIED: "Host verification changed",
  PROPERTY_TOGGLED: "Homestay turned on or off",
  PLATFORM_PAYMENT_REJECTED: "Payment refused after verification",
};

function humanize(raw: string): string {
  const words = raw.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[_\s]+/).filter(Boolean).map((w) => WORD_LABELS[w] ?? w);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "HOST_LOGOUT" → "Host logout". Unknown events still read as words, never as the raw code. */
export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? humanize(eventType);
}

/** A metadata key for people: "room_id" → "House ID". */
export function fieldLabel(key: string): string {
  return humanize(key);
}

export interface LogField {
  /** The stored key(s), for a tooltip. */
  key: string;
  label: string;
  value: string;
}

/** Change pairs the audit log writes: { from, to } for a value, { previous, new } / { before, after } for a set of fields. */
const CHANGE_PAIRS: [string, string][] = [
  ["from", "to"],
  ["previous", "new"],
  ["before", "after"],
];
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ENUM = /^[a-z]+(?:_[a-z]+)+$/;
/** Keys whose values are codes ("fixed_rate"); a name such as set_by "super_admin" stays as written. */
const ENUM_KEY = /(?:^|_)(?:type|status|source|kind|mode|method|action)$/;
// Built-in Intl, so this file stays import-free for client pages. Times read in Bangkok, like every admin time.
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** One value for people: Yes / No, dates as dates, enum codes as words, objects as "Key: value". */
function fieldValue(v: unknown, pretty: boolean, key = ""): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map((x) => fieldValue(x, false, key)).join(", ");
  if (isRecord(v)) {
    return Object.entries(v)
      .map(([k, x]) => `${fieldLabel(k)}: ${fieldValue(x, false, k)}`)
      .join(pretty ? "\n" : ", ");
  }
  const text = String(v);
  if (ISO_TIME.test(text) && !Number.isNaN(Date.parse(text))) return timeFmt.format(new Date(text));
  if (ISO_DAY.test(text)) return dayFmt.format(new Date(`${text}T00:00:00Z`));
  if (ENUM_KEY.test(key) && ENUM.test(text)) return fieldLabel(text);
  return text;
}

/**
 * A log's metadata for people. A change pair reads as one "Changed: 200 → 500" (stored
 * to-first, it read backwards), or one line per field that changed when the pair holds
 * objects. Empty values are left out.
 */
export function logFields(data: Record<string, unknown> | null | undefined, pretty = false): LogField[] {
  const d = data ?? {};
  const present = (k: string) => d[k] !== null && d[k] !== undefined && d[k] !== "";
  const changes: LogField[] = [];
  const used = new Set<string>();
  for (const [a, b] of CHANGE_PAIRS) {
    if (!(a in d) || !(b in d) || (!present(a) && !present(b))) continue;
    used.add(a).add(b);
    const was = d[a];
    const now = d[b];
    if (isRecord(was) || isRecord(now)) {
      const w = isRecord(was) ? was : {};
      const n = isRecord(now) ? now : {};
      for (const k of new Set([...Object.keys(w), ...Object.keys(n)])) {
        if (JSON.stringify(w[k] ?? null) === JSON.stringify(n[k] ?? null)) continue;
        changes.push({ key: `${a}.${k}, ${b}.${k}`, label: fieldLabel(k), value: `${fieldValue(w[k], false, k)} → ${fieldValue(n[k], false, k)}` });
      }
    } else {
      changes.push({ key: `${a}, ${b}`, label: "Changed", value: `${fieldValue(was, pretty)} → ${fieldValue(now, pretty)}` });
    }
  }
  const rest = Object.entries(d)
    .filter(([k, v]) => !used.has(k) && v !== null && v !== undefined && v !== "")
    .map(([k, v]) => ({ key: k, label: fieldLabel(k), value: fieldValue(v, pretty, k) }));
  return [...changes, ...rest];
}
