import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_TIME_ZONE,
  billingToday,
  billingTodayStr,
  blockingInvoiceFilter,
} from "@/lib/billing-dates";

const iso = (d: Date) => d.toISOString().split("T")[0];

afterEach(() => {
  vi.useRealTimers();
});

describe("billingToday", () => {
  it("runs on the Bangkok calendar", () => {
    expect(BILLING_TIME_ZONE).toBe("Asia/Bangkok");
  });

  it("returns the Bangkok calendar date, pinned to UTC midnight", () => {
    const today = billingToday(new Date("2026-06-15T10:00:00Z"));
    expect(iso(today)).toBe("2026-06-15");
    expect(today.getTime() % 86_400_000).toBe(0);
  });

  it("has already rolled over to tomorrow once Bangkok has", () => {
    // 01:00 on 1 Sep in Bangkok, still 18:00 on 31 Aug in UTC. Reading the UTC
    // parts here is what produced the spurious 31 August stub.
    expect(iso(billingToday(new Date("2026-08-31T18:00:00Z")))).toBe("2026-09-01");
  });

  it("holds the previous day right up to the Bangkok midnight boundary", () => {
    expect(iso(billingToday(new Date("2026-08-31T16:59:59Z")))).toBe("2026-08-31");
    expect(iso(billingToday(new Date("2026-08-31T17:00:00Z")))).toBe("2026-09-01");
  });

  it("defaults to the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T18:00:00Z"));
    expect(iso(billingToday())).toBe("2026-09-01");
  });
});

describe("billingTodayStr", () => {
  it("is billingToday serialised, so the two can never disagree", () => {
    const now = new Date("2026-08-31T18:00:00Z");
    expect(billingTodayStr(now)).toBe(iso(billingToday(now)));
    expect(billingTodayStr(now)).toBe("2026-09-01");
  });

  it("defaults to the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T18:00:00Z"));
    expect(billingTodayStr()).toBe("2026-09-01");
  });

  it("parses back to the same instant the server anchors terms to", () => {
    // The dashboard does date arithmetic as `new Date(todayStr)`, and the
    // server as billingToday(). Both must land on the same UTC midnight or the
    // forfeited-days figure the host is shown drifts from the one logged.
    const now = new Date("2026-08-31T18:00:00Z");
    expect(new Date(billingTodayStr(now)).getTime()).toBe(billingToday(now).getTime());
  });
});

describe("blockingInvoiceFilter", () => {
  it("matches overdue invoices and pending ones past their due date", () => {
    expect(blockingInvoiceFilter("2026-06-15")).toBe(
      "status.eq.overdue,and(status.eq.pending,due_date.lt.2026-06-15)",
    );
  });

  it("uses a strict less-than, so an invoice due today does not block yet", () => {
    expect(blockingInvoiceFilter("2026-06-15")).toContain("due_date.lt.");
    expect(blockingInvoiceFilter("2026-06-15")).not.toContain("due_date.lte.");
  });

  it("defaults to today on the Bangkok calendar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00Z"));
    expect(blockingInvoiceFilter()).toContain("2026-06-15");
  });

  it("starts blocking at Bangkok midnight, not seven hours later", () => {
    // 01:00 on the 6th in Bangkok. An invoice due on the 5th is past due for
    // the host right now; off the UTC clock it stayed unblocked until 07:00.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T18:00:00Z"));
    expect(blockingInvoiceFilter()).toContain("due_date.lt.2026-09-06");
  });

  it("still lets an invoice due today through", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T10:00:00Z"));
    expect(blockingInvoiceFilter()).toContain("due_date.lt.2026-09-05");
  });
});
