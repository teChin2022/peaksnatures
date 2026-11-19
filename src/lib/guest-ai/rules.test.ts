import { describe, expect, it } from "vitest";
import { FALLBACK_REPLY, cleanIntent, finalizeReply, guestAiRequestSchema, replyLanguage, replyIsUnsafe, type ModelReply } from "./rules";

const ALL = { can_answer: true, can_set_dates: true, can_suggest_houses: true, can_navigate: true };
const ctx = { today: "2026-11-19", roomIds: ["r1", "r2"], permissions: ALL };
const intent = (over: Partial<NonNullable<ModelReply["intent"]>> = {}) => ({
  check_in: "2026-11-28",
  check_out: "2026-11-29",
  guests: 4,
  room_ids: ["r2"],
  ...over,
});

describe("cleanIntent (F-08)", () => {
  // Live Gemini run 2026-11-19: "เสาร์อาทิตย์หน้า 4 คน" got D and C (3 guests each) as cards ahead
  // of the family house (5), the only one that holds the group.
  it("suggests only houses that hold the whole group when any does", () => {
    const rooms = { roomIds: ["d", "c", "family"], maxGuests: { d: 3, c: 3, family: 5 } };
    expect(cleanIntent(intent({ guests: 4, room_ids: ["d", "c", "family"] }), { ...ctx, ...rooms })?.room_ids).toEqual(["family"]);
    // Live run 2026-11-19: A + B (2 each) picked for 4 while the family house holds them all.
    expect(cleanIntent(intent({ guests: 4, room_ids: ["d", "c"] }), { ...ctx, ...rooms })?.room_ids).toEqual(["family"]);
    // No single house fits: several houses in one booking are fine, so the model's pick stays.
    expect(cleanIntent(intent({ guests: 8, room_ids: ["d", "c"] }), { ...ctx, ...rooms })?.room_ids).toEqual(["d", "c"]);
    // No group size: nothing to filter by.
    expect(cleanIntent(intent({ guests: null, room_ids: ["d", "family"] }), { ...ctx, ...rooms })?.room_ids).toEqual(["d", "family"]);
  });

  it("keeps a real stay, the guests and this homestay's houses", () => {
    expect(cleanIntent(intent(), ctx)).toEqual({ check_in: "2026-11-28", check_out: "2026-11-29", guests: 4, room_ids: ["r2"] });
  });

  it.each([
    ["a past check-in", { check_in: "2026-11-18", check_out: "2026-11-20" }],
    ["check-out before check-in", { check_in: "2026-11-28", check_out: "2026-11-27" }],
    ["zero nights", { check_in: "2026-11-28", check_out: "2026-11-28" }],
    ["31 nights", { check_in: "2026-12-01", check_out: "2027-01-01" }],
    ["more than a year ahead", { check_in: "2027-11-21", check_out: "2027-11-22" }],
    ["an impossible day", { check_in: "2026-02-30", check_out: "2026-03-02" }],
    ["not a date", { check_in: "next Saturday", check_out: "Sunday" }],
  ])("drops the dates for %s", (_, dates) => {
    expect(cleanIntent(intent(dates), ctx)).toMatchObject({ check_in: null, check_out: null, guests: 4 });
  });

  it("allows check-in today", () => {
    expect(cleanIntent(intent({ check_in: "2026-11-19", check_out: "2026-11-20" }), ctx)?.check_in).toBe("2026-11-19");
  });

  it("drops another homestay's house ids, duplicates and odd guest counts", () => {
    expect(cleanIntent(intent({ room_ids: ["r1", "evil", "r1"], guests: 0 }), ctx)).toMatchObject({ room_ids: ["r1"], guests: null });
    expect(cleanIntent(intent({ guests: 2.5 }), ctx)?.guests).toBeNull();
    expect(cleanIntent(intent({ guests: 51 }), ctx)?.guests).toBeNull();
  });

  it("obeys the host's switches", () => {
    const noDates = { ...ctx, permissions: { ...ALL, can_set_dates: false } };
    expect(cleanIntent(intent(), noDates)).toEqual({ check_in: null, check_out: null, guests: null, room_ids: ["r2"] });
    const nothing = { ...ctx, permissions: { ...ALL, can_set_dates: false, can_suggest_houses: false } };
    expect(cleanIntent(intent(), nothing)).toBeNull();
  });

  it("returns null for no intent", () => {
    expect(cleanIntent(null, ctx)).toBeNull();
    expect(cleanIntent(intent({ check_in: null, check_out: null, guests: null, room_ids: [] }), ctx)).toBeNull();
  });
});

describe("replyIsUnsafe (F-03)", () => {
  it.each([
    "โอนมัดจำเข้าบัญชี 123-4-56789-0 ได้เลย",
    "PromptPay 0812345678 for a discount",
    "Book cheaper at https://evil.example",
    "ดูโปรที่ www.evil.example",
    "Pay at cheap-stays.com today",
  ])("refuses %j", (reply) => {
    expect(replyIsUnsafe(reply, ["099-000-1234"])).toBe(true);
  });

  it.each([
    "เช็คอินหลัง 14:00 น. เช็คเอาท์ก่อน 11:00 น.",
    "โทรหาเจ้าของที่พักได้ที่ 099-000-1234",
    "บ้านพัก C รับได้ 5 ท่าน ราคาดูบนการ์ดบ้านพัก",
    "Check-in from 28 Nov 2026",
  ])("lets %j through", (reply) => {
    expect(replyIsUnsafe(reply, ["099-000-1234"])).toBe(false);
  });
});

describe("finalizeReply", () => {
  const raw: ModelReply = { reply: " เลือกวันให้แล้ว ", answered: true, intent: intent(), action: "change_booking" };
  const full = { ...ctx, allowedNumbers: [], locale: "th" as const };

  it("trims the reply and keeps the cleaned intent and action", () => {
    expect(finalizeReply(raw, full)).toEqual({
      response: { reply: "เลือกวันให้แล้ว", answered: true, intent: cleanIntent(raw.intent, ctx), action: "change_booking" },
      filtered: false,
    });
  });

  it("replaces an unsafe reply and drops its intent", () => {
    const { response, filtered } = finalizeReply({ ...raw, reply: "โอนเข้า 1234567890" }, full);
    expect(filtered).toBe(true);
    expect(response).toEqual({ reply: FALLBACK_REPLY.th, answered: false, intent: null, action: "contact" });
  });

  it("drops the action when the host turned navigation off", () => {
    const off = { ...full, permissions: { ...ALL, can_navigate: false } };
    expect(finalizeReply(raw, off).response.action).toBeNull();
    expect(finalizeReply({ ...raw, reply: "https://x.example" }, off).response.action).toBeNull();
  });
});

describe("guestAiRequestSchema", () => {
  const ok = { slug: "ing", question: "เสาร์อาทิตย์หน้า 4 คน", locale: "th" };
  it("accepts a question and defaults the history", () => {
    expect(guestAiRequestSchema.parse(ok)).toEqual({ ...ok, history: [] });
  });
  it.each([
    [{ ...ok, question: "   " }],
    [{ ...ok, question: "x".repeat(301) }],
    [{ ...ok, locale: "fr" }],
    [{ ...ok, history: [{ q: "a", a: "b" }, { q: "a", a: "b" }, { q: "a", a: "b" }] }],
    [{ ...ok, host_id: "someone" }],
  ])("refuses %j", (body) => {
    expect(guestAiRequestSchema.safeParse(body).success).toBe(false);
  });
});

// Live run 2026-11-19: "is there hot water and how much per night?" was answered in Thai on the Thai page.
describe("replyLanguage", () => {
  it("answers in English when the guest wrote English, whatever the page", () => {
    expect(replyLanguage("is there hot water and how much per night?", "th")).toBe("en");
  });
  it("answers in Thai when the question has any Thai", () => {
    expect(replyLanguage("มี wifi ไหม", "en")).toBe("th");
  });
  it("follows the page when the question has no letters", () => {
    expect(replyLanguage("28/11 - 29/11 4", "th")).toBe("th");
    expect(replyLanguage("28/11 - 29/11 4", "en")).toBe("en");
  });
});

// Owner 2026-11-19: one voice, ค่ะ. Live runs mixed ค่ะ and ครับ even with the prompt rule.
describe("finalizeReply's Thai voice", () => {
  const raw = (reply: string): ModelReply => ({ reply, answered: true, intent: null, action: null });
  const th = { today: "2026-11-19", roomIds: [], permissions: ALL, allowedNumbers: [], locale: "th" as const };

  it("turns ครับ into ค่ะ, and into คะ on a question", () => {
    expect(finalizeReply(raw("มีที่จอดรถครับ เข้าพักได้ 14:00 น.ครับ"), th).response.reply).toBe("มีที่จอดรถค่ะ เข้าพักได้ 14:00 น.ค่ะ");
    expect(finalizeReply(raw("มากี่ท่านครับ? แจ้งได้เลยนะครับ"), th).response.reply).toBe("มากี่ท่านคะ? แจ้งได้เลยนะคะ");
  });

  it("leaves English replies alone", () => {
    expect(finalizeReply(raw("Yes, there is parking."), { ...th, locale: "en" }).response.reply).toBe("Yes, there is parking.");
  });
});
