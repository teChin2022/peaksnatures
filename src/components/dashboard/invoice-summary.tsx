"use client";

import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateStr } from "@/lib/format-date";
import { billingTodayStr, isInvoiceBlocking } from "@/lib/billing-dates";

export interface InvoiceRow {
  id: string;
  amount: number;
  period_start: string;
  period_end: string;
  status: string;
  due_date: string;
  paid_at: string | null;
  term_months: number;
  discount_pct: number;
  slip_trans_ref: string | null;
  easyslip_verified: boolean;
}

/** Overdue from the day it blocks bookings, not only once the cron flips status. */
export function invoiceStatus(
  invoice: Pick<InvoiceRow, "status" | "due_date">,
  today = billingTodayStr(),
): string {
  return isInvoiceBlocking(invoice, today) ? "overdue" : invoice.status;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof CheckCircle }> = {
  pending: { color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",  icon: Clock },
  paid:    { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle },
  overdue: { color: "text-red-700",    bg: "bg-red-50 border-red-200",    icon: AlertTriangle },
};

/** The status pill, shared so an invoice status reads the same wherever it appears. */
export function InvoiceStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const t = useTranslations("walletPage");
  const conf = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = conf.icon;
  return (
    <Badge className={`rounded-full text-[11px] font-medium border ${conf.bg} ${conf.color} ${className}`}>
      <Icon className="h-3 w-3 mr-1" />
      {t(status)}
    </Badge>
  );
}

interface InvoiceSummaryProps {
  invoice: InvoiceRow;
  /** The host's current plan — only a Fixed Rate host is blocked by an unpaid invoice. */
  planType: string;
  /** Shows a pay button on an open invoice when given. */
  onPay?: () => void;
}

/**
 * One invoice: what it's for, amount, period, status, and how it was paid or
 * how late it is. Shared by the Wallet ("ใบแจ้งหนี้") and Billing
 * ("การเรียกเก็บเงิน") pages, which each supply their own container, so the
 * two lists can't drift apart again.
 */
export function InvoiceSummary({ invoice: inv, planType, onPay }: InvoiceSummaryProps) {
  const t = useTranslations("walletPage");
  const locale = useLocale();
  const today = billingTodayStr();
  const status = invoiceStatus(inv, today);
  // Both are bare dates, so this is a whole number of days.
  const daysOverdue = (Date.parse(today) - Date.parse(inv.due_date)) / 86_400_000;
  // A multi-month term can cross into the next year; then the start needs its own.
  const startPattern = inv.period_start.slice(0, 4) === inv.period_end.slice(0, 4) ? "d MMM" : "d MMM yyyy";

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        {/* Left: what it's for, amount, period */}
        <div className="min-w-0">
          <p className="text-xs font-medium text-earth-500">
            {t("invoiceTitle")}
            {inv.term_months > 1 && ` · ${t("invoiceTerm", { months: inv.term_months })}`}
          </p>
          <p className="text-2xl font-serif text-earth-900 leading-tight mt-1">
            ฿{inv.amount.toLocaleString()}
          </p>
          <p className="text-xs text-earth-400 mt-1">
            {fmtDateStr(inv.period_start, startPattern, locale)} — {fmtDateStr(inv.period_end, "d MMM yyyy", locale)}
            {inv.discount_pct > 0 && ` · ${t("invoiceDiscount", { pct: inv.discount_pct })}`}
          </p>
        </div>

        {/* Right: status badge */}
        <InvoiceStatusBadge status={status} />
      </div>

      {/* Footer: how it was paid, or when it's due and what overdue costs */}
      <div className="mt-4 pt-3 border-t border-earth-50 flex items-center justify-between gap-4">
        <div className="text-xs text-earth-400 space-y-0.5 min-w-0">
          {status === "paid" ? (
            <p>
              {[
                inv.paid_at && `${t("paidOn")} ${fmtDateStr(inv.paid_at, "d MMM yyyy, HH:mm", locale)}`,
                // No verified slip means an admin marked it paid (Set Plan or Mark Paid).
                inv.slip_trans_ref
                  ? t("transferRef", { ref: inv.slip_trans_ref })
                  : !inv.easyslip_verified && t("confirmedByAdmin"),
              ].filter(Boolean).join(" · ")}
            </p>
          ) : (
            <p>
              {t("dueDate")}: {fmtDateStr(inv.due_date, "d MMM yyyy", locale)}
              {status === "overdue" && daysOverdue > 0 && (
                <span className="text-red-600"> · {t("overdueDays", { days: daysOverdue })}</span>
              )}
            </p>
          )}
          {/* Only Fixed Rate hosts are blocked by an unpaid invoice (hostBlockStateFrom). */}
          {status === "overdue" && planType === "fixed_rate" && (
            <p className="text-red-600 font-medium">{t("overdueBlocked")}</p>
          )}
        </div>

        {onPay && (status === "pending" || status === "overdue") && (
          <Button
            size="sm"
            className="bg-brand hover:bg-brand-hover text-white rounded-full px-5 text-xs shadow-sm"
            onClick={onPay}
          >
            {t("payNow")}
          </Button>
        )}
      </div>
    </>
  );
}
