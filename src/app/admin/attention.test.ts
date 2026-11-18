import { describe, expect, it } from "vitest";
import { attentionItems, type AttentionCounts } from "./attention";

const healthy: AttentionCounts = {
  rejectedPayments: 0,
  blockingInvoices: 0,
  retriesExhausted: 0,
  blockedHosts: 0,
  staleDateChanges: 0,
  cron: { ok: true, lastRun: "2026-11-18T00:00:05Z", lastStatus: "success" },
};

describe("attentionItems", () => {
  it("is empty when nothing needs an admin", () => {
    expect(attentionItems(healthy)).toEqual([]);
  });

  it("lists each problem with its count and where to settle it", () => {
    const items = attentionItems({ ...healthy, rejectedPayments: 2, blockingInvoices: 3, retriesExhausted: 1 });
    expect(items).toEqual([
      { key: "payments", label: "Rejected payments, 30d", value: 2, href: "/admin/billing/rejected" },
      { key: "invoices", label: "Overdue invoices", value: 3, href: "/admin/billing" },
      { key: "retries", label: "Billing retries failed, 30d", value: 1, href: "/admin/logs?event_type=BILLING_RETRY_EXHAUSTED" },
    ]);
  });

  it("flags blocked hosts and date changes left waiting", () => {
    expect(attentionItems({ ...healthy, blockedHosts: 2, staleDateChanges: 3 })).toEqual([
      { key: "blocked", label: "Hosts with bookings blocked", value: 2, href: "/admin/hosts" },
      { key: "dateChanges", label: "Date changes waiting over 2 days", value: 3, href: "/admin/bookings/date-changes" },
    ]);
  });

  it.each([
    [{ ok: false, lastRun: "2026-11-18T00:00:05Z", lastStatus: "failure" as const }, "Failed"],
    [{ ok: false, lastRun: "2026-11-16T00:00:05Z", lastStatus: "success" as const }, "Late"],
    [{ ok: false, lastRun: null, lastStatus: null }, "Never ran"],
  ])("flags an unhealthy billing cron (%o → %s)", (cron, value) => {
    expect(attentionItems({ ...healthy, cron })).toEqual([
      { key: "cron", label: "Billing cron", value, href: "/admin/logs?entity_type=system" },
    ]);
  });
});
