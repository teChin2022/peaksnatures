import { EventType } from "@/lib/history-event-types";
import type { CronHealth } from "@/lib/cron-health";

export const ATTENTION_WINDOW_DAYS = 30;
/** A guest's date-change request the host has left this long is worth a nudge. */
export const STALE_DATE_CHANGE_DAYS = 2;

export interface AttentionCounts {
  rejectedPayments: number;
  blockingInvoices: number;
  retriesExhausted: number;
  blockedHosts: number;
  staleDateChanges: number;
  cron: CronHealth;
}

export interface AttentionItem {
  key: "payments" | "invoices" | "retries" | "blocked" | "dateChanges" | "cron";
  label: string;
  value: string | number;
  href: string;
}

/** What needs an admin's hand on the overview, each linking to where it is settled. */
export function attentionItems(c: AttentionCounts): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (c.rejectedPayments > 0) {
    items.push({
      key: "payments",
      label: `Rejected payments, ${ATTENTION_WINDOW_DAYS}d`,
      value: c.rejectedPayments,
      href: "/admin/billing/rejected",
    });
  }
  if (c.blockingInvoices > 0) {
    items.push({ key: "invoices", label: "Overdue invoices", value: c.blockingInvoices, href: "/admin/billing?status=overdue" });
  }
  if (c.retriesExhausted > 0) {
    items.push({
      key: "retries",
      label: `Billing retries failed, ${ATTENTION_WINDOW_DAYS}d`,
      value: c.retriesExhausted,
      href: `/admin/logs?event_type=${EventType.BILLING_RETRY_EXHAUSTED}`,
    });
  }
  if (c.blockedHosts > 0) {
    items.push({ key: "blocked", label: "Hosts with bookings blocked", value: c.blockedHosts, href: "/admin/hosts?status=blocked" });
  }
  if (c.staleDateChanges > 0) {
    items.push({
      key: "dateChanges",
      label: `Date changes waiting over ${STALE_DATE_CHANGE_DAYS} days`,
      value: c.staleDateChanges,
      href: "/admin/bookings/date-changes",
    });
  }
  if (!c.cron.ok) {
    items.push({
      key: "cron",
      label: "Billing cron",
      value: c.cron.lastStatus === "failure" ? "Failed" : c.cron.lastRun ? "Late" : "Never ran",
      href: "/admin/logs?entity_type=system",
    });
  }
  return items;
}
