import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt, describeToday, type GuestAiFacts } from "./prompt";

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
    expect(p).toMatch(/Never state prices/);
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
