import { describe, expect, it } from "vitest";
import { formatSpecialPriceRule } from "@/lib/special-price-label";

type Rule = Parameters<typeof formatSpecialPriceRule>[0];

const rule = (over: Partial<Rule> = {}): Rule => ({
  rule_type: "weekday",
  weekdays: [6],
  dates: [],
  start_date: null,
  end_date: null,
  ...over,
});

describe("formatSpecialPriceRule — date rules", () => {
  it("lists the dates in chronological order", () => {
    const r = rule({ rule_type: "date", weekdays: [], dates: ["2026-12-25", "2026-12-24"] });
    expect(formatSpecialPriceRule(r, "th")).toBe("24 ธ.ค. 2569, 25 ธ.ค. 2569");
    expect(formatSpecialPriceRule(r, "en")).toBe("24 Dec 2026, 25 Dec 2026");
  });

  it("renders a single date", () => {
    const r = rule({ rule_type: "date", weekdays: [], dates: ["2026-12-31"] });
    expect(formatSpecialPriceRule(r, "en")).toBe("31 Dec 2026");
  });

  it("renders an empty string for a date rule with no dates", () => {
    expect(formatSpecialPriceRule(rule({ rule_type: "date", weekdays: [], dates: [] }), "th")).toBe("");
  });

  it("ignores any window on a date rule", () => {
    const r = rule({
      rule_type: "date",
      weekdays: [],
      dates: ["2026-12-24"],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    expect(formatSpecialPriceRule(r, "en")).toBe("24 Dec 2026");
  });

  it("does not mutate the caller's dates array", () => {
    const dates = ["2026-12-25", "2026-12-24"];
    formatSpecialPriceRule(rule({ rule_type: "date", weekdays: [], dates }), "en");
    expect(dates).toEqual(["2026-12-25", "2026-12-24"]);
  });
});

describe("formatSpecialPriceRule — weekday rules", () => {
  it("collapses all seven days to 'every day'", () => {
    const r = rule({ weekdays: [0, 1, 2, 3, 4, 5, 6] });
    expect(formatSpecialPriceRule(r, "th")).toBe("ทุกวัน");
    expect(formatSpecialPriceRule(r, "en")).toBe("Every day");
  });

  it("collapses Saturday and Sunday to a weekend phrase, in any order", () => {
    expect(formatSpecialPriceRule(rule({ weekdays: [0, 6] }), "th")).toBe("ทุกวันเสาร์-อาทิตย์");
    expect(formatSpecialPriceRule(rule({ weekdays: [6, 0] }), "en")).toBe("Every Sat–Sun");
  });

  it("names a single weekday", () => {
    expect(formatSpecialPriceRule(rule({ weekdays: [6] }), "th")).toBe("ทุกวันเสาร์");
    expect(formatSpecialPriceRule(rule({ weekdays: [6] }), "en")).toBe("Every Saturday");
  });

  it("lists weekdays Monday-first, the way a calendar reads", () => {
    expect(formatSpecialPriceRule(rule({ weekdays: [5, 1] }), "en")).toBe("Every Monday, Friday");
    // Sunday sorts last, not first, despite being weekday 0.
    expect(formatSpecialPriceRule(rule({ weekdays: [0, 1] }), "en")).toBe("Every Monday, Sunday");
    expect(formatSpecialPriceRule(rule({ weekdays: [0, 1] }), "th")).toBe("ทุกวันจันทร์, อาทิตย์");
  });

  it("renders an empty string when no weekdays are set", () => {
    expect(formatSpecialPriceRule(rule({ weekdays: [] }), "th")).toBe("");
  });
});

describe("formatSpecialPriceRule — windows", () => {
  it("appends a closed window after a separator", () => {
    const r = rule({ weekdays: [6], start_date: "2026-11-01", end_date: "2026-11-30" });
    expect(formatSpecialPriceRule(r, "th")).toBe("ทุกวันเสาร์ · 1 พ.ย. 2569 – 30 พ.ย. 2569");
    expect(formatSpecialPriceRule(r, "en")).toBe("Every Saturday · 1 Nov 2026 – 30 Nov 2026");
  });

  it("renders a start-only window as 'from'", () => {
    const r = rule({ weekdays: [6], start_date: "2026-11-01" });
    expect(formatSpecialPriceRule(r, "th")).toBe("ทุกวันเสาร์ · ตั้งแต่ 1 พ.ย. 2569");
    expect(formatSpecialPriceRule(r, "en")).toBe("Every Saturday · From 1 Nov 2026");
  });

  it("renders an end-only window as 'until'", () => {
    const r = rule({ weekdays: [6], end_date: "2026-11-30" });
    expect(formatSpecialPriceRule(r, "th")).toBe("ทุกวันเสาร์ · ถึง 30 พ.ย. 2569");
    expect(formatSpecialPriceRule(r, "en")).toBe("Every Saturday · Until 30 Nov 2026");
  });

  it("omits the separator entirely when the rule is open-ended", () => {
    expect(formatSpecialPriceRule(rule({ weekdays: [6] }), "en")).toBe("Every Saturday");
  });
});
