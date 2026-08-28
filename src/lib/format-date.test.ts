import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateStr } from "@/lib/format-date";

const FEB_15 = new Date(2026, 1, 15); // a Sunday

describe("fmtDate", () => {
  it("formats English dates with no year conversion", () => {
    expect(fmtDate(FEB_15, "d MMM yyyy", "en")).toBe("15 Feb 2026");
    expect(fmtDate(FEB_15, "d MMMM yyyy", "en")).toBe("15 February 2026");
    expect(fmtDate(FEB_15, "dd/MM/yyyy", "en")).toBe("15/02/2026");
  });

  it("uses Thai month names and the Buddhist Era year", () => {
    expect(fmtDate(FEB_15, "d MMM yyyy", "th")).toBe("15 ก.พ. 2569");
    expect(fmtDate(FEB_15, "d MMMM yyyy", "th")).toBe("15 กุมภาพันธ์ 2569");
    expect(fmtDate(FEB_15, "dd/MM/yyyy", "th")).toBe("15/02/2569");
  });

  it("adds exactly 543 to the year", () => {
    expect(fmtDate(FEB_15, "yyyy", "th")).toBe("2569");
    expect(fmtDate(new Date(2000, 0, 1), "yyyy", "th")).toBe("2543");
  });

  it("localises weekday names in Thai", () => {
    expect(fmtDate(FEB_15, "EEEE d MMM yyyy", "th")).toBe("อาทิตย์ 15 ก.พ. 2569");
    expect(fmtDate(FEB_15, "EEEE d MMM yyyy", "en")).toBe("Sunday 15 Feb 2026");
  });

  it("treats any locale other than th as English", () => {
    expect(fmtDate(FEB_15, "d MMM yyyy", "de")).toBe("15 Feb 2026");
  });

  // KNOWN GAP: the BE conversion is a plain replace of the four-digit year, so a
  // two-digit-year pattern has nothing to match and silently keeps the CE year.
  // Pinned deliberately — flagged for review rather than assumed correct.
  it("silently leaves a two-digit year in CE under a th locale", () => {
    expect(fmtDate(FEB_15, "dd/MM/yy", "th")).toBe("15/02/26"); // not 15/02/69
  });
});

describe("fmtDateStr", () => {
  it("parses an ISO date string and formats it", () => {
    expect(fmtDateStr("2026-12-24", "d MMM yyyy", "en")).toBe("24 Dec 2026");
    expect(fmtDateStr("2026-11-01", "d MMM yyyy", "th")).toBe("1 พ.ย. 2569");
  });

  it("reads the date in local time, not UTC, so the day never slips", () => {
    expect(fmtDateStr("2026-01-01", "yyyy-MM-dd", "en")).toBe("2026-01-01");
    expect(fmtDateStr("2026-12-31", "yyyy-MM-dd", "en")).toBe("2026-12-31");
  });
});
