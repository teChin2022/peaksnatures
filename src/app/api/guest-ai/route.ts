import { NextRequest, NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { billingTodayStr } from "@/lib/billing-dates";
import { HOST_BLOCK_COLUMNS, hostBlockStateFrom, type HostBlockRow } from "@/lib/billing";
import { isHostBlocked } from "@/lib/plan-expiry";
import { isHostApproved } from "@/lib/public-host";
import { richTextToPlainText } from "@/lib/sanitize";
import {
  SESSION_REPLY_CAP,
  UNVERIFIED_SESSION_REPLY_CAP,
  finalizeReply,
  guestAiRequestSchema,
  guestAiWalletFloor,
  replyLanguage,
} from "@/lib/guest-ai/rules";
import { buildSystemPrompt, buildUserPrompt, housePriceFacts, type GuestAiFacts, type PricedRoomRow } from "@/lib/guest-ai/prompt";
import {
  FACT_WINDOW_DAYS,
  availabilityFacts,
  bookingTermsFacts,
  extrasFacts,
  priceCalendarFacts,
  reviewFacts,
  shareExtras,
} from "@/lib/guest-ai/page-facts";
import { askGuestAi } from "@/lib/guest-ai/model";
import { notifyHostAlert } from "@/lib/notifications";
import { alertAdmins } from "@/lib/admin-alert";

export const maxDuration = 30;

/**
 * POST /api/guest-ai — the guest AI assistant on /[slug]/book (docs/ai-admin-plan.md, phase 2).
 *
 * Every reply is a paid Gemini call, so (security review F-01) a guest needs a
 * session created after Turnstile — no token at all is refused here, unlike
 * the booking routes — and every reply is counted against the session, the
 * host's and the platform's daily caps in one database call before the model
 * runs. The model sees only what the public page shows plus the host's notes
 * (F-03 / F-10); its answer is filtered for links and account numbers (F-03),
 * and its dates and houses are checked (F-08). No guest text is stored.
 */

const rateLimit = createRateLimiter({ limit: 20, windowMs: 60_000, name: "guest-ai" });
const COOKIE = "pn_guest_ai";
const SESSION_SECONDS = 2 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "private, no-store" };

type Code = "unavailable" | "verify" | "limit" | "failed" | "invalid";
const fail = (code: Code, status: number) => NextResponse.json({ code }, { status, headers: NO_STORE });

/** Why reserve_guest_ai_reply said no, as the page should hear it. */
const RESERVE_REFUSAL: Record<string, [Code, number]> = {
  platform_off: ["unavailable", 503],
  host_off: ["unavailable", 503],
  session_invalid: ["verify", 401],
  session_cap: ["verify", 401],
  host_cap: ["limit", 429],
  platform_cap: ["limit", 429],
  wallet_low: ["unavailable", 503],
};

/** A Bangkok YYYY-MM-DD plus n days (UTC arithmetic on the date, so no time zone can shift it). */
const addDaysKey = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** One "the assistant stopped: top up" notice a day at most. */
const WALLET_NOTICE_MS = 24 * 60 * 60 * 1000;

interface HomestayRow {
  id: string;
  name: string;
  tagline: string | null;
  location: string | null;
  description: string | null;
  amenities: string[] | null;
  prohibitions: string[] | null;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_info: string | null;
  policies: string | null;
  faq: { question: string; answer: string }[] | null;
  host:
    | (HostBlockRow & {
        id: string;
        status: string | null;
        phone: string | null;
        deposit_amount: number | null;
        deposit_by_month: Record<string, number> | null;
        cancellation_days: number | null;
      })
    | null;
}

export async function POST(req: NextRequest) {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  try {
    const limited = await rateLimit.check(req);
    if (limited) return limited;

    const parsed = guestAiRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("invalid", 400);
    const { slug, question, locale, history, turnstileToken } = parsed.data;

    const sc = createServiceRoleClient();
    const { data: homestayData } = await sc
      .from("homestays")
      .select(
        `id, name, tagline, location, description, amenities, prohibitions, check_in_time, check_out_time, check_in_info, policies, faq, host:hosts(id, status, phone, deposit_amount, deposit_by_month, cancellation_days, ${HOST_BLOCK_COLUMNS})`,
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    const homestay = homestayData as HomestayRow | null;
    const host = homestay?.host ?? null;
    if (!homestay || !host || !isHostApproved(host)) return fail("unavailable", 404);

    // The rest of what the reply needs, read together (each read used to wait for the one before).
    // Bookings and closed days give the page's availability calendar: dates and houses only, no guest data.
    const today = billingTodayStr();
    const windowEnd = addDaysKey(today, FACT_WINDOW_DAYS);
    const [{ data: settingsData }, blockState, { data: roomRows }, { data: bookedRows }, { data: blockedRows }, { data: ratingRows }] =
      await Promise.all([
      sc
        .from("host_ai_settings")
        .select("status, enabled, can_answer, can_set_dates, can_suggest_houses, can_navigate, instructions, wallet_low_notified_at")
        .eq("host_id", host.id)
        .maybeSingle(),
      hostBlockStateFrom(host.id, host, sc),
      sc
        .from("rooms")
        .select(
          "id, name, description, max_guests, quantity, price_per_night, room_seasonal_prices(name, start_date, end_date, price_per_night), room_special_prices(name, rule_type, weekdays, dates, start_date, end_date, surcharge, is_active), room_options(name, price, pricing_type, is_active), room_guest_pricing(adults, children, detail, surcharge, is_active)",
        )
        .eq("homestay_id", homestay.id)
        .eq("is_active", true),
      // The statuses /api/bookings/availability counts.
      sc
        .from("bookings")
        .select("room_id, check_in, check_out")
        .eq("homestay_id", homestay.id)
        .in("status", ["pending", "confirmed", "verified"])
        .gt("check_out", today)
        .lt("check_in", windowEnd),
      sc.from("blocked_dates").select("room_id, date").eq("homestay_id", homestay.id).gte("date", today).lt("date", windowEnd),
      sc.from("reviews").select("rating").eq("homestay_id", homestay.id),
    ]);
    const settings = settingsData as {
      status: string;
      enabled: boolean;
      can_answer: boolean;
      can_set_dates: boolean;
      can_suggest_houses: boolean;
      can_navigate: boolean;
      instructions: string | null;
      wallet_low_notified_at: string | null;
    } | null;
    if (!settings || settings.status !== "approved" || !settings.enabled) return fail("unavailable", 404);
    if (isHostBlocked(blockState)) return fail("unavailable", 404);
    const tLoaded = ms();

    // The guest's session: its random id is the cookie. A new one needs Turnstile.
    let sessionId = req.cookies.get(COOKIE)?.value ?? null;
    if (sessionId && !UUID.test(sessionId)) sessionId = null;
    let newSession = false;
    if (!sessionId) {
      if (!turnstileToken) return fail("verify", 401);
      const verdict = await verifyTurnstileToken(turnstileToken);
      if (verdict === "fail") return fail("verify", 401);
      const { data: created, error } = await sc
        .from("guest_ai_sessions")
        .insert({
          host_id: host.id,
          homestay_id: homestay.id,
          reply_cap: verdict === "pass" ? SESSION_REPLY_CAP : UNVERIFIED_SESSION_REPLY_CAP,
        } as never)
        .select("id")
        .single();
      if (error || !created) {
        console.error("[guest-ai] session insert failed:", error?.message);
        return fail("failed", 500);
      }
      sessionId = (created as { id: string }).id;
      newSession = true;
    }

    const reserveArgs = { p_session: sessionId, p_host: host.id, p_day: today };
    const { data: reserved, error: reserveError } = await sc.rpc(
      "reserve_guest_ai_reply" as never,
      { ...reserveArgs, p_floor: guestAiWalletFloor(host.plan_type) } as never,
    );
    if (reserveError) {
      console.error("[guest-ai] reserve failed:", reserveError.message);
      return fail("failed", 500);
    }
    if (reserved === "wallet_low") {
      const last = settings.wallet_low_notified_at ? Date.parse(settings.wallet_low_notified_at) : 0;
      if (Date.now() - last > WALLET_NOTICE_MS) after(() => notifyWalletLow(sc, host.id));
    }
    // Security review F-11: the platform cap is the money brake; admins hear when it bites (30-min throttle).
    if (reserved === "platform_cap") {
      after(() => alertAdmins("Guest AI: ครบเพดานคำตอบรวมของแพลตฟอร์มวันนี้แล้ว ผู้ช่วยหยุดตอบทุกที่พัก (/admin/guest-ai)", "guest-ai-platform-cap"));
    }
    if (reserved !== "ok") {
      const [code, status] = RESERVE_REFUSAL[reserved as string] ?? (["failed", 500] as [Code, number]);
      const res = fail(code, status);
      // A dead session is dropped so the next question starts a fresh one through Turnstile.
      if (code === "verify") res.cookies.delete({ name: COOKIE, path: "/api/guest-ai" });
      return res;
    }

    const tReserved = ms();
    const rooms = (roomRows ?? []) as (PricedRoomRow &
      Parameters<typeof extrasFacts>[0] & {
        id: string;
        name: string;
        description: string | null;
        max_guests: number;
        quantity: number | null;
      })[];

    const extras = shareExtras(
      rooms.map((r) => ({
        id: r.id,
        name: r.name,
        description: richTextToPlainText(r.description),
        max_guests: r.max_guests,
        units: r.quantity ?? 1,
        price: housePriceFacts(r, today),
        price_calendar: priceCalendarFacts(r, today),
        ...extrasFacts(r),
      })),
    );
    const facts: GuestAiFacts = {
      name: homestay.name,
      tagline: homestay.tagline,
      location: homestay.location,
      description: richTextToPlainText(homestay.description),
      amenities: homestay.amenities ?? [],
      prohibitions: homestay.prohibitions ?? [],
      check_in_time: homestay.check_in_time,
      check_out_time: homestay.check_out_time,
      check_in_info: richTextToPlainText(homestay.check_in_info),
      policies: richTextToPlainText(homestay.policies),
      faq: homestay.faq ?? [],
      houses: extras.houses,
      ...(extras.shared && { every_house: extras.shared }),
      availability: availabilityFacts(
        rooms,
        (bookedRows ?? []) as { room_id: string | null; check_in: string; check_out: string }[],
        (blockedRows ?? []) as { room_id: string | null; date: string }[],
        today,
      ),
      booking_terms: bookingTermsFacts(host),
      reviews: reviewFacts((ratingRows ?? []) as { rating: number }[]),
    };
    // The guest's language, not the page's: an English question on the Thai page gets English.
    const language = replyLanguage(question, locale);
    const permissions = {
      can_answer: settings.can_answer,
      can_set_dates: settings.can_set_dates,
      can_suggest_houses: settings.can_suggest_houses,
      can_navigate: settings.can_navigate,
    };

    let answer;
    try {
      answer = await askGuestAi(
        buildSystemPrompt({ today, locale: language, permissions }),
        buildUserPrompt({ facts, hostNotes: settings.instructions, question, history, language }),
      );
    } catch (err) {
      console.error("[guest-ai] model call failed after", ms() - tReserved, "ms:", (err as Error).message);
      // Not the guest's fault: give the reply back to the caps.
      const { error } = await sc.rpc("release_guest_ai_reply" as never, reserveArgs as never);
      if (error) console.error("[guest-ai] release failed:", error.message);
      return fail("failed", 502);
    }

    const tModel = ms();
    const { inputTokens, outputTokens } = answer;
    // 087: real token counts per host and day, for the admin cost report. Not on the guest's clock.
    after(async () => {
      const { error } = await sc.rpc(
        "record_guest_ai_tokens" as never,
        { p_host: host.id, p_day: today, p_input: inputTokens, p_output: outputTokens } as never,
      );
      if (error) console.error("[guest-ai] token count failed:", error.message);
    });

    const { response, filtered } = finalizeReply(answer.reply, {
      today,
      roomIds: rooms.map((r) => r.id),
      maxGuests: Object.fromEntries(rooms.map((r) => [r.id, r.max_guests])),
      permissions,
      allowedNumbers: host.phone ? [host.phone] : [],
      locale: language,
    });
    // Which homestay only: the guest's words and the model's reply stay out of the logs.
    if (filtered) {
      console.warn("[guest-ai] reply withheld (link or number) for homestay", homestay.id);
      // F-11: repeated withheld replies on one page can mean someone is probing it (or bad host notes).
      after(() =>
        alertAdmins(`Guest AI: ตัดคำตอบที่มีลิงก์หรือเลขบัญชีทิ้ง ที่พัก ${homestay.name} (${slug})`, `guest-ai-filtered:${homestay.id}`),
      );
    }

    // Where a reply's time goes (no guest text): data, session + reserve, Gemini, total.
    console.info(
      `[guest-ai] timing load=${tLoaded}ms reserve=${tReserved - tLoaded}ms model=${tModel - tReserved}ms total=${ms()}ms` +
        ` tokens=${inputTokens}/${outputTokens} answered=${response.answered} action=${response.action ?? "-"} filtered=${filtered}`,
    );
    const res = NextResponse.json(response, { headers: NO_STORE });
    if (newSession) {
      res.cookies.set({
        name: COOKIE,
        value: sessionId,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/guest-ai",
        maxAge: SESSION_SECONDS,
      });
    }
    return res;
  } catch (error) {
    console.error("[guest-ai] error:", (error as Error).message);
    return fail("failed", 500);
  }
}

/**
 * Tells the host, once a day, that the assistant stopped for want of money. The timestamp is
 * claimed first (conditional update), so two guests hitting the floor at once send one notice.
 */
async function notifyWalletLow(sc: ReturnType<typeof createServiceRoleClient>, hostId: string) {
  try {
    const cutoff = new Date(Date.now() - WALLET_NOTICE_MS).toISOString();
    const { data: claimed } = await sc
      .from("host_ai_settings")
      .update({ wallet_low_notified_at: new Date().toISOString() } as never)
      .eq("host_id", hostId)
      .or(`wallet_low_notified_at.is.null,wallet_low_notified_at.lt.${cutoff}`)
      .select("host_id")
      .maybeSingle();
    if (!claimed) return;
    const { data: hostRow } = await sc
      .from("hosts")
      .select("phone, email, notification_preference, line_channel_access_token, line_user_id")
      .eq("id", hostId)
      .maybeSingle();
    if (!hostRow) return;
    await notifyHostAlert(
      hostRow as Parameters<typeof notifyHostAlert>[0],
      "ผู้ช่วย AI หยุดตอบแขกชั่วคราว เงินในกระเป๋าไม่พอ เติมเงินได้ที่เมนูกระเป๋าเงิน",
      "ผู้ช่วย AI หยุดชั่วคราว: เติมเงินในกระเป๋า",
    );
  } catch (err) {
    console.error("[guest-ai] wallet notice failed:", (err as Error).message);
  }
}
