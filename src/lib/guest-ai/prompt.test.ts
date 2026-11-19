import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt, describeToday, housePriceFacts, type GuestAiFacts } from "./prompt";

const ALL = { can_answer: true, can_set_dates: true, can_suggest_houses: true, can_navigate: true };
const FACTS: GuestAiFacts = {
  name: "ม่อนเงาะ",
  location: "เชียงใหม่",
  description: "",
  amenities: ["ที่จอดรถ"],
  prohibitions: [],
  check_in_time: "14:00",
  check_out_time: "11:00",
  check_in_info: "",
  policies: "",
  faq: [],
  houses: [{ id: "r1", name: "บ้าน A", description: "", max_guests: 2, units: 1 }],
};

describe("describeToday", () => {
  it("names the Bangkok day's weekday", () => {
    expect(describeToday("2026-11-19")).toBe("2026-11-19 (Thursday)");
    expect(describeToday("2026-11-21")).toBe("2026-11-21 (Saturday)");
  });
});

describe("buildSystemPrompt", () => {
  it("lists only what the host allows", () => {
    const all = buildSystemPrompt({ today: "2026-11-19", locale: "th", permissions: ALL });
    expect(all).toContain("intent.room_ids");
    expect(all).toContain("change_booking");

    const datesOnly = buildSystemPrompt({
      today: "2026-11-19",
      locale: "en",
      permissions: { can_answer: false, can_set_dates: true, can_suggest_houses: false, can_navigate: false },
    });
    expect(datesOnly).toContain("intent.check_in");
    expect(datesOnly).not.toContain("intent.room_ids");
    expect(datesOnly).not.toContain('action: "change_booking"');
    expect(datesOnly).toContain("Reply in English");
  });

  it("always carries the payment and link rules (F-03)", () => {
    const p = buildSystemPrompt({ today: "2026-11-19", locale: "th", permissions: ALL });
    expect(p).toMatch(/Never talk about payment/);
    expect(p).toMatch(/never write links/);
    // Owner 2026-11-19: per-night prices and the written cancellation policy may be quoted; totals,
    // discounts and refund promises never.
    expect(p).toMatch(/Never add up a stay's total and never offer or invent a discount/);
    expect(p).toMatch(/Never decide, promise or estimate a refund/);
    // Owner 2026-11-19: "my booking" refund questions get the policy and the contact buttons.
    expect(p).toMatch(/say the host confirms the amount, and set action "contact"/);
    expect(p).not.toMatch(/PromptPay, transfers or refunds/);
  });

  it("tells the model what the page shows under its reply, and the house vocabulary", () => {
    const p = buildSystemPrompt({ today: "2026-11-19", locale: "th", permissions: ALL });
    expect(p).toMatch(/never say you cannot check/);
    // Critique 2026-11-19 (second pass): replies said "ด้านล่างนี้" and named booked houses.
    expect(p).toMatch(/never name or recommend a particular house in that reply/);
    expect(p).toMatch(/Never point to a place on the page/);
    // Live run: "เสาร์นี้ 3 คน" set the dates and still asked "ขอทราบวันที่เช็กอินและเช็กเอาต์ค่ะ".
    expect(p).toMatch(/reply "เลือกวันให้แล้วค่ะ"/);
    expect(p).toMatch(/Never ask for dates you just set/);
    // Live runs read "เสาร์อาทิตย์หน้า" as 1 night once and 2 nights once.
    expect(p).toMatch(/เสาร์อาทิตย์หน้า\) the Saturday night after that, also 1 night/);
    expect(p).not.toMatch(/cards below|right under your reply/);
    expect(p).toMatch(/never say there is no phone or LINE/);
    expect(p).toMatch(/never ห้องพัก/);
    // Owner 2026-11-19: one voice, ค่ะ (live runs mixed ค่ะ and ครับ).
    expect(p).toMatch(/end polite sentences with ค่ะ \(questions คะ\), never ครับ/);
    expect(p).toMatch(/never tell them to check the website/);
    // Live run 2026-11-19: "01-31 ธ.ค. 2565" (wrong Buddhist year); a group of 6 turned away.
    expect(p).toMatch(/never a year/);
    expect(p).toMatch(/if one house holds the whole group, suggest that house/);
    expect(p).toMatch(/Only when no single house holds them, say they can book several houses in one booking/);
    expect(p).toMatch(/never ask for them again/);
  });
});

describe("housePriceFacts", () => {
  const room = {
    price_per_night: 1500,
    room_seasonal_prices: [
      { name: "ปีใหม่", start_date: "2026-12-28", end_date: "2027-01-03", price_per_night: 2500 },
      { name: "ฝน", start_date: "2026-06-01", end_date: "2026-10-31", price_per_night: 1200 },
    ],
    room_special_prices: [
      { name: "เสาร์", rule_type: "weekday" as const, weekdays: [6], dates: [], start_date: null, end_date: null, surcharge: 300, is_active: true },
      { name: "ปิด", rule_type: "weekday" as const, weekdays: [5], dates: [], start_date: null, end_date: null, surcharge: 999, is_active: false },
      { name: "จบแล้ว", rule_type: "date" as const, weekdays: [], dates: ["2026-11-01"], start_date: null, end_date: "2026-11-01", surcharge: 500, is_active: true },
      { name: "ลอยกระทง", rule_type: "date" as const, weekdays: [], dates: ["2026-11-01", "2026-11-24"], start_date: null, end_date: null, surcharge: 400, is_active: true },
    ],
  };

  it("gives the tiers the page charges: base, seasons not ended, live surcharges", () => {
    expect(housePriceFacts(room, "2026-11-19")).toEqual({
      base_per_night: 1500,
      seasons: [{ name: "ปีใหม่", from: "2026-12-28", to: "2027-01-03", per_night: 2500 }],
      surcharges: [
        { name: "เสาร์", adds: 300, on: "Saturday nights" },
        { name: "ลอยกระทง", adds: 400, on: "2026-11-24" },
      ],
    });
  });

  it("copes with a house that has no price tables", () => {
    expect(housePriceFacts({ price_per_night: 900 }, "2026-11-19")).toEqual({ base_per_night: 900, seasons: [], surcharges: [] });
  });
});

describe("buildUserPrompt", () => {
  it("fences the host notes and the guest's text as data", () => {
    const p = buildUserPrompt({ facts: FACTS, hostNotes: "จอดรถ 3 คัน", question: "มีที่จอดไหม", history: [] });
    expect(p).toContain('"""\nจอดรถ 3 คัน\n"""');
    expect(p).toContain('GUEST:\n"""\nมีที่จอดไหม\n"""');
    expect(p).not.toContain("EARLIER");
  });

  it("includes the last turns and says when there are no notes", () => {
    const p = buildUserPrompt({ facts: FACTS, hostNotes: null, question: "แล้ว 2 คืนล่ะ", history: [{ q: "เสาร์นี้", a: "เลือกวันให้แล้ว" }] });
    expect(p).toContain("(none)");
    expect(p).toContain("Guest: เสาร์นี้\nAssistant: เลือกวันให้แล้ว");
  });
});
