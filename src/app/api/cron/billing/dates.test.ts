import { describe, expect, it } from "vitest";
import { cronBillingDates } from "./dates";

/** vercel.json runs the cron at `0 0 * * *` — 07:00 the same day in Bangkok. */
const SCHEDULED = new Date("2026-09-01T00:00:00Z");
/** The same Bangkok day, but an instant where UTC still says August. */
const JUST_AFTER_BANGKOK_MIDNIGHT = new Date("2026-08-31T18:00:00Z");

const dayAfter = (d: string) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().split("T")[0];

describe("cronBillingDates", () => {
  it("derives every window from the Bangkok calendar day", () => {
    expect(cronBillingDates(SCHEDULED)).toEqual({
      todayDate: new Date("2026-09-01T00:00:00Z"),
      today: "2026-09-01",
      tomorrow: "2026-09-02",
      in3Days: "2026-09-04",
      in3DaysNext: "2026-09-05",
      in7Days: "2026-09-08",
      in7DaysNext: "2026-09-09",
      ago5Days: "2026-08-27",
      ago5DaysNext: "2026-08-28",
      dueWarnDay: "2026-09-03",
      dueInFiveDays: "2026-09-06",
      isFirstOfMonth: true,
      monthStart: "2026-09-01",
      monthEnd: "2026-09-30",
      monthDueDate: "2026-09-05",
    });
  });

  it("gives the same answer whether it fires at 00:00 UTC or just after Bangkok midnight", () => {
    // The point of anchoring to the billing calendar: the result is a property
    // of the day, not of what time vercel.json happens to fire.
    expect(cronBillingDates(JUST_AFTER_BANGKOK_MIDNIGHT)).toEqual(
      cronBillingDates(SCHEDULED),
    );
  });

  describe("isFirstOfMonth — the monthly invoice trigger", () => {
    it("is true once Bangkok reaches the 1st, while UTC still reads the 31st", () => {
      expect(JUST_AFTER_BANGKOK_MIDNIGHT.getUTCDate()).toBe(31);
      expect(cronBillingDates(JUST_AFTER_BANGKOK_MIDNIGHT).isFirstOfMonth).toBe(true);
    });

    it("is still false on the last evening of the month in Bangkok", () => {
      // 23:00 on 31 Aug in Bangkok — 16:00 UTC, same UTC day.
      expect(cronBillingDates(new Date("2026-08-31T16:00:00Z"))).toMatchObject({
        today: "2026-08-31",
        isFirstOfMonth: false,
      });
    });

    it("is false mid-month", () => {
      expect(cronBillingDates(new Date("2026-02-15T03:00:00Z")).isFirstOfMonth).toBe(false);
    });
  });

  describe("the monthly invoice period", () => {
    it("ends on the real last day of a 30-day month", () => {
      // The failure the old local-time constructors produced was a periodEnd of
      // 29 Sep instead of 30 Sep.
      expect(cronBillingDates(SCHEDULED)).toMatchObject({
        monthStart: "2026-09-01",
        monthEnd: "2026-09-30",
      });
    });

    it("handles February", () => {
      expect(cronBillingDates(new Date("2026-02-15T03:00:00Z"))).toMatchObject({
        monthStart: "2026-02-01",
        monthEnd: "2026-02-28",
        monthDueDate: "2026-02-05",
      });
    });

    it("rolls the year over", () => {
      expect(cronBillingDates(new Date("2026-12-31T18:00:00Z"))).toMatchObject({
        today: "2027-01-01",
        isFirstOfMonth: true,
        monthStart: "2027-01-01",
        monthEnd: "2027-01-31",
        in3Days: "2027-01-04",
        ago5Days: "2026-12-27",
      });
    });
  });

  it("makes every lookup window exactly one day wide", () => {
    // Each pair is used as .gte(from).lt(to) — any other width would either
    // miss hosts or notify them twice.
    const d = cronBillingDates(SCHEDULED);
    expect(d.in3DaysNext).toBe(dayAfter(d.in3Days));
    expect(d.in7DaysNext).toBe(dayAfter(d.in7Days));
    expect(d.ago5DaysNext).toBe(dayAfter(d.ago5Days));
    expect(d.tomorrow).toBe(dayAfter(d.today));
  });

  it("anchors todayDate to UTC midnight so invoice periods start on the day itself", () => {
    // computeFixedRateInvoice reads this back with getUTCFullYear/Month/Date.
    const { todayDate, today } = cronBillingDates(JUST_AFTER_BANGKOK_MIDNIGHT);
    expect(todayDate.getTime() % 86_400_000).toBe(0);
    expect(todayDate.toISOString().split("T")[0]).toBe(today);
  });
});
