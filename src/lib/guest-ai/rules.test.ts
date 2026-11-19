import { describe, expect, it } from "vitest";
import { FALLBACK_REPLY, cleanIntent, finalizeReply, guestAiRequestSchema, replyIsUnsafe, type ModelReply } from "./rules";

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
