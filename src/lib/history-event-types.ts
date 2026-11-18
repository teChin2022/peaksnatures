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
