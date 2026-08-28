"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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

export type { PlatformPayment };

interface InvoicePayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which invoice is being paid (also drives `open`). */
  invoiceId: string | null;
  /** Invoice amount — used for the PromptPay QR payload and the displayed total. */
  amount: number;
  platformPayment: PlatformPayment | null;
  /** Called after a successful verification so the page can refresh its data. */
  onPaid: () => void;
}

/**
 * Shared invoice payment dialog used by both the Wallet ("ใบแจ้งหนี้") and Billing
 * ("การเรียกเก็บเงิน", fixed-rate) pages so the two can never diverge again.
 *
 * The payment body itself lives in SlipPaymentFields, shared in turn with
 * PlanActivationDialog. This component owns only the invoice-specific parts:
 * the copy and the POST to /api/host/invoices/{id}/pay.
 */
export function InvoicePayDialog({
  open,
  onOpenChange,
  invoiceId,
  amount,
  platformPayment,
  onPaid,
}: InvoicePayDialogProps) {
  const t = useTranslations("invoicePay");

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset the slip whenever the dialog closes.
  useEffect(() => {
    if (!open) setFile(null);
  }, [open]);

  const handleSubmit = async () => {
    if (!invoiceId || !file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/host/invoices/${invoiceId}/pay`, { method: "POST", body: form });
      const d = await res.json();
      if (d.success) {
        toast.success(t("verifiedToast"));
        onOpenChange(false);
        onPaid();
      } else {
        toast.error(d.error || d.message || t("verifyFailed"));
      }
    } catch {
      toast.error(t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("payInvoice")}</DialogTitle>
          <DialogDescription>{t("payInvoiceDesc")}</DialogDescription>
        </DialogHeader>

        <SlipPaymentFields
          open={open}
          amount={amount}
          platformPayment={platformPayment}
          file={file}
          onFileChange={setFile}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !file}
            className="bg-brand hover:bg-brand-hover"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {t("verifyAndPay")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
