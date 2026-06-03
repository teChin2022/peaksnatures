"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import generatePayload from "promptpay-qr";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Upload, ImageIcon, Download } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface PlatformPayment {
  promptpay_id: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  payment_display: string;
}

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
 * Fully self-contained: owns the slip file + preview, the "upload from phone"
 * session/polling, and the POST to /api/host/invoices/{id}/pay.
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
  const isMobile = useIsMobile();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // Keep the preview object-URL in sync with the selected file.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Reset the slip whenever the dialog closes.
  useEffect(() => {
    if (!open) setFile(null);
  }, [open]);

  // ── "Upload slip from your phone" (desktop only) ──
  const [sessionId] = useState(() => crypto.randomUUID());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uploadLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/upload-slip/${sessionId}`;
  }, [sessionId]);

  useEffect(() => {
    if (!open || isMobile || file) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/slip-upload/${sessionId}`);
        const data = await res.json();
        if (data.uploaded && data.url) {
          const slipRes = await fetch(data.url);
          const blob = await slipRes.blob();
          setFile(new File([blob], data.filename || "slip.jpg", { type: blob.type }));
          if (pollingRef.current) clearInterval(pollingRef.current);
          toast.success(t("phoneSlipReceived"));
        }
      } catch {
        /* ignore */
      }
    }, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [open, isMobile, file, sessionId, t]);

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

  // Render the PromptPay QR to a 2x PNG and trigger a download.
  const handleSaveQr = useCallback(() => {
    const svgEl = qrContainerRef.current?.querySelector("svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const link = document.createElement("a");
      link.download = `promptpay-${amount}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }, [amount]);

  const showBank =
    platformPayment?.payment_display === "bank" &&
    !!platformPayment.bank_name &&
    !!platformPayment.bank_account_number;
  const showQr = !showBank && !!platformPayment?.promptpay_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("payInvoice")}</DialogTitle>
          <DialogDescription>{t("payInvoiceDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Payment method */}
          {showBank ? (
            <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand mb-3">
                {t("transferTo")}
              </p>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span className="text-earth-500">{t("bankLabel")}</span>
                  <span className="font-medium text-earth-900">{platformPayment!.bank_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-earth-500">{t("accountNoLabel")}</span>
                  <span className="font-mono font-medium text-earth-900">{platformPayment!.bank_account_number}</span>
                </div>
                {platformPayment!.bank_account_name && (
                  <div className="flex justify-between">
                    <span className="text-earth-500">{t("accountNameLabel")}</span>
                    <span className="font-medium text-earth-900">{platformPayment!.bank_account_name}</span>
                  </div>
                )}
              </div>
            </div>
          ) : showQr ? (
            <div className="flex flex-col items-center">
              <div ref={qrContainerRef} className="bg-white p-3 rounded-2xl shadow-sm border border-earth-100">
                <QRCodeSVG
                  value={generatePayload(platformPayment!.promptpay_id!, { amount })}
                  size={160}
                  level="M"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveQr}
                className="mt-3 flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-medium text-earth-700 border border-earth-200 hover:bg-earth-50"
              >
                <Download className="h-3.5 w-3.5" />
                {t("saveQrImage")}
              </button>
            </div>
          ) : null}

          {(showBank || showQr) && (
            <p className="text-center text-xl font-bold text-earth-900">฿{amount.toLocaleString()}</p>
          )}

          {/* Upload slip */}
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">{t("paymentSlip")}</Label>

            {file ? (
              <div className="rounded-2xl border bg-earth-50 p-3">
                <p className="mb-2 text-center text-xs font-medium text-earth-500">{t("slipPreview")}</p>
                {preview && (
                  <img src={preview} alt={t("slipPreview")} className="mx-auto max-h-52 rounded-xl object-contain" />
                )}
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full"
                  >
                    <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                    {t("changeSlip")}
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-earth-300 p-4 text-left transition-colors hover:border-earth-400 hover:bg-earth-50"
                >
                  <div className="rounded-xl bg-earth-100 p-2.5">
                    <ImageIcon className="h-5 w-5 text-earth-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-earth-700">{t("chooseFromGallery")}</p>
                    <p className="text-xs text-earth-400">{t("clickUpload")}</p>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {!isMobile && (
                  <>
                    <div className="relative flex items-center gap-3 py-1">
                      <div className="flex-1 border-t border-earth-200" />
                      <span className="text-xs font-medium text-earth-400">{t("orUploadFromPhone")}</span>
                      <div className="flex-1 border-t border-earth-200" />
                    </div>
                    <div className="rounded-2xl border bg-earth-50 p-4 text-center">
                      <p className="mb-3 text-xs text-earth-500">{t("scanToUploadSlip")}</p>
                      <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-xl border bg-white p-2">
                        <QRCodeSVG value={uploadLink} size={100} level="M" />
                      </div>
                      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-earth-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t("waitingForPhoneUpload")}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

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
