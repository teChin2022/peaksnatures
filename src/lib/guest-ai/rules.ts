import { z } from "zod";
import { LOW_WALLET_THRESHOLD } from "@/lib/wallet-thresholds";

/**
 * The guest AI assistant's rules that do not depend on the model: what a guest
 * may send, what the model must return, and what the server lets through.
 * Import-free apart from zod, so the client can share the limits and types.
 */

export const QUESTION_MAX = 300;
/** Replies a guest session may get before it needs a new one (and a new Turnstile). */
export const SESSION_REPLY_CAP = 20;
/** Lower when Turnstile could not be checked (Cloudflare unreachable): fail open, but small. */
export const UNVERIFIED_SESSION_REPLY_CAP = 5;
export const MAX_NIGHTS = 30;

/**
 * The lowest wallet the assistant may leave once its replies are charged (D9, owner 2026-11-19):
 * Commission keeps LOW_WALLET_THRESHOLD for its commissions; other plans may spend down to zero.
 */
export const guestAiWalletFloor = (planType: string) => (planType === "commission" ? LOW_WALLET_THRESHOLD : 0);
export const MAX_GUESTS = 50;

export const GUEST_AI_ACTIONS = ["change_booking", "check_in", "contact"] as const;
export type GuestAiAction = (typeof GUEST_AI_ACTIONS)[number];

const turn = z.object({ q: z.string().max(QUESTION_MAX), a: z.string().max(800) });

/** POST /api/guest-ai body. `history` is the last two turns, for follow-ups ("and for 2 nights?"). */
export const guestAiRequestSchema = z
  .object({
    slug: z.string().min(1).max(100),
    question: z.string().trim().min(1).max(QUESTION_MAX),
    locale: z.enum(["th", "en"]),
    history: z.array(turn).max(2).default([]),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();
export type GuestAiRequest = z.infer<typeof guestAiRequestSchema>;

/** What the model is asked to return (structured output). */
export const modelReplySchema = z.object({
  reply: z.string().max(700),
  answered: z.boolean(),
  intent: z
    .object({
      check_in: z.string().nullable(),
      check_out: z.string().nullable(),
      guests: z.number().nullable(),
      room_ids: z.array(z.string()),
    })
    .nullable(),
  action: z.enum(GUEST_AI_ACTIONS).nullable(),
});
export type ModelReply = z.infer<typeof modelReplySchema>;

export interface GuestAiIntent {
  check_in: string | null;
  check_out: string | null;
  guests: number | null;
  room_ids: string[];
}

export interface GuestAiPermissions {
  can_answer: boolean;
  can_set_dates: boolean;
  can_suggest_houses: boolean;
  can_navigate: boolean;
}

/** What the page gets back. */
export interface GuestAiResponse {
  reply: string;
  answered: boolean;
  intent: GuestAiIntent | null;
  action: GuestAiAction | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isRealDay = (s: string) => DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Keeps only what the model may decide (security review F-08): a real stay
 * from today on, at most MAX_NIGHTS and a year ahead; a sane guest count;
 * houses of this homestay only; and only what the host allows.
 * `today` is billingTodayStr(). Returns null when nothing usable is left.
 */
export function cleanIntent(
  raw: ModelReply["intent"],
  ctx: { today: string; roomIds: string[]; permissions: GuestAiPermissions },
): GuestAiIntent | null {
  if (!raw) return null;
  const { today, roomIds, permissions } = ctx;

  let check_in: string | null = null;
  let check_out: string | null = null;
  if (permissions.can_set_dates && raw.check_in && raw.check_out && isRealDay(raw.check_in) && isRealDay(raw.check_out)) {
    const nights = dayDiff(raw.check_in, raw.check_out);
    if (raw.check_in >= today && dayDiff(today, raw.check_in) <= 365 && nights >= 1 && nights <= MAX_NIGHTS) {
      check_in = raw.check_in;
      check_out = raw.check_out;
    }
  }
  const guests =
    permissions.can_set_dates && raw.guests != null && Number.isInteger(raw.guests) && raw.guests >= 1 && raw.guests <= MAX_GUESTS
      ? raw.guests
      : null;
  const allowed = new Set(roomIds);
  const room_ids = permissions.can_suggest_houses ? [...new Set(raw.room_ids)].filter((id) => allowed.has(id)) : [];

  if (!check_in && guests === null && room_ids.length === 0) return null;
  return { check_in, check_out, guests, room_ids };
}

const URL_LIKE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|co|th|me|io|ly|app|link|xyz|info)\b)/i;
const LONG_NUMBER = /\d(?:[\s.-]?\d){8,}/g;

/**
 * True when a reply must not reach the guest (security review F-03): any link,
 * or any long number (account, PromptPay, phone) other than the host's own
 * public phone. A guest told by the "homestay's assistant" to pay into an
 * account would believe it.
 */
export function replyIsUnsafe(reply: string, allowedNumbers: string[]): boolean {
  if (URL_LIKE.test(reply)) return true;
  const allowed = new Set(allowedNumbers.map((n) => n.replace(/\D/g, "")).filter(Boolean));
  for (const m of reply.match(LONG_NUMBER) ?? []) {
    if (!allowed.has(m.replace(/\D/g, ""))) return true;
  }
  return false;
}

export const FALLBACK_REPLY = {
  th: "ขอโทษค่ะ เรื่องนี้ผู้ช่วยตอบให้ไม่ได้ สอบถามเจ้าของที่พักโดยตรงได้เลย",
  en: "Sorry, the assistant can't answer that. Please ask the homestay directly.",
} as const;

/**
 * The model's answer as the guest may see it: intent cleaned, actions the host
 * turned off removed, and an unsafe reply replaced by the fallback.
 */
export function finalizeReply(
  raw: ModelReply,
  ctx: { today: string; roomIds: string[]; permissions: GuestAiPermissions; allowedNumbers: string[]; locale: "th" | "en" },
): { response: GuestAiResponse; filtered: boolean } {
  const action = ctx.permissions.can_navigate ? raw.action : null;
  if (replyIsUnsafe(raw.reply, ctx.allowedNumbers)) {
    return {
      response: { reply: FALLBACK_REPLY[ctx.locale], answered: false, intent: null, action: ctx.permissions.can_navigate ? "contact" : null },
      filtered: true,
    };
  }
  return {
    response: { reply: raw.reply.trim(), answered: raw.answered, intent: cleanIntent(raw.intent, ctx), action },
    filtered: false,
  };
}
