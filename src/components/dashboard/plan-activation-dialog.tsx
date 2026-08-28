"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SlipPaymentFields, type PlatformPayment } from "@/components/dashboard/slip-payment-fields";
import { fmtDateStr } from "@/lib/format-date";

/** The 402 PAYMENT_REQUIRED body from POST /api/host/plan/switch. */
export interface PlanQuote {
  amount: number;
  stub_amount: number;
  term_amount: number;
  period_start: string;
  period_end: string;
  term_months: number;
  discount_pct: number;
  prorated_days: number;
  days_in_month: number;
}

interface PlanActivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: PlanQuote | null;
  platformPayment: PlatformPayment | null;
  /** Monthly rate, for the "from next month you'll be billed X" line. */
  monthlyRate: number;
  /** Called after a successful activation so the page can refresh its data. */
  onActivated: () => void;
}

/**
 * Pay for Fixed Rate and switch onto it in one step.
 *
 * The quote is advisory — /api/host/plan/activate recomputes the amount
 * server-side before charging — so this dialog only has to explain it. Nothing
 * is persisted if the host closes it, which is why there is no cleanup here and
 * no invoice to cancel.
 */
export function PlanActivationDialog({
  open,
  onOpenChange,
  quote,
  platformPayment,
  monthlyRate,
  onActivated,
}: PlanActivationDialogProps) {
  const t = useTranslations("planActivation");
  const ti = useTranslations("invoicePay");
  const locale = useLocale();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) setFile(null);
  }, [open]);

  const handleSubmit = async () => {
    if (!quote || !file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("term_months", String(quote.term_months));
      const res = await fetch("/api/host/plan/activate", { method: "POST", body: form });
      const d = await res.json();
      if (d.success) {
        toast.success(t("activatedToast"));
        onOpenChange(false);
        onActivated();
      } else {
        toast.error(d.error || d.message || t("verifyFailed"));
      }
    } catch {
      toast.error(t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (d: string) => fmtDateStr(d, "d MMM", locale);

  // The stub ends where the prepaid months begin — the last day of the month
  // the host switched in.
  const stubEnd = quote
    ? (() => {
        const start = new Date(`${quote.period_start}T00:00:00Z`);
        return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
          .toISOString()
          .split("T")[0];
      })()
    : "";
  const termStart = quote
    ? (() => {
        const start = new Date(`${quote.period_start}T00:00:00Z`);
        return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
          .toISOString()
          .split("T")[0];
      })()
    : "";
  // Monthly billing resumes the day after the paid period ends.
  const nextBilled = quote
    ? (() => {
        const end = new Date(`${quote.period_end}T00:00:00Z`);
        return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1))
          .toISOString()
          .split("T")[0];
      })()
    : "";

  const breakdown = quote ? (
    <div className="rounded-xl border border-earth-200 bg-earth-50 px-4 py-3 space-y-2 text-sm">
      {quote.stub_amount > 0 && (
        <div className="flex justify-between gap-3">
          <span className="text-earth-600">
            {t("partialMonth", { start: fmt(quote.period_start), end: fmt(stubEnd) })}
          </span>
          <span className="font-medium text-earth-900">฿{quote.stub_amount.toLocaleString()}</span>
        </div>
      )}
      {quote.term_amount > 0 && (
        <div className="flex justify-between gap-3">
          <span className="text-earth-600">
            {t("prepaidTerm", {
              start: fmt(quote.stub_amount > 0 ? termStart : quote.period_start),
              end: fmt(quote.period_end),
              months: quote.term_months,
            })}
          </span>
          <span className="font-medium text-earth-900">฿{quote.term_amount.toLocaleString()}</span>
        </div>
      )}
      {quote.discount_pct > 0 && (
        <p className="text-xs text-brand">{t("discountNote", { pct: quote.discount_pct })}</p>
      )}
      <div className="flex justify-between gap-3 border-t border-earth-200 pt-2">
        <span className="font-medium text-earth-700">{t("total")}</span>
        <span className="font-semibold text-earth-900">฿{quote.amount.toLocaleString()}</span>
      </div>
      {monthlyRate > 0 && (
        <p className="text-xs text-earth-500">
          {t("afterwards", { date: fmtDateStr(nextBilled, "d MMM yyyy", locale), amount: monthlyRate.toLocaleString() })}
        </p>
      )}
    </div>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
        </DialogHeader>

        <SlipPaymentFields
          open={open}
          amount={quote?.amount ?? 0}
          platformPayment={platformPayment}
          file={file}
          onFileChange={setFile}
          breakdown={breakdown}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {ti("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !file || !quote}
            className="bg-brand hover:bg-brand-hover"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {t("verifyAndActivate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
