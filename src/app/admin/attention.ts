import { EventType } from "@/lib/history-event-types";
import type { CronHealth } from "@/lib/cron-health";

export const ATTENTION_WINDOW_DAYS = 30;

export interface AttentionCounts {
  rejectedPayments: number;
  blockingInvoices: number;
  retriesExhausted: number;
  cron: CronHealth;
}

export interface AttentionItem {
  key: "payments" | "invoices" | "retries" | "cron";
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
    items.push({ key: "invoices", label: "Overdue invoices", value: c.blockingInvoices, href: "/admin/billing" });
  }
  if (c.retriesExhausted > 0) {
    items.push({
      key: "retries",
      label: `Billing retries failed, ${ATTENTION_WINDOW_DAYS}d`,
      value: c.retriesExhausted,
      href: `/admin/logs?event_type=${EventType.BILLING_RETRY_EXHAUSTED}`,
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
