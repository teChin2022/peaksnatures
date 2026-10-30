"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import generatePayload from "promptpay-qr";
import { QRCodeCanvas } from "qrcode.react";
import { Download } from "lucide-react";
import { saveCanvasImage } from "@/lib/save-image";

interface PromptPayQrProps {
  promptpayId: string;
  /** Amount owed — baked into the QR payload and the saved file's name. 0 leaves it for the payer to enter. */
  amount: number;
}

/**
 * The platform's PromptPay QR with a "save image" button, so a host paying on
 * the same phone that shows the QR can open the image in their banking app.
 * Shared by SlipPaymentFields, the Billing invoice card and the Wallet top-up.
 */
export function PromptPayQr({ promptpayId, amount }: PromptPayQrProps) {
  const t = useTranslations("invoicePay");
  // A canvas, not an SVG: its PNG is ready synchronously, inside the tap that iOS sharing needs.
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleSaveQr = () => {
    if (!canvasRef.current) return;
    saveCanvasImage(canvasRef.current, amount > 0 ? `promptpay-${amount}.png` : "promptpay.png");
  };

  return (
    <div className="flex flex-col items-center">
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-earth-100">
        <QRCodeCanvas ref={canvasRef} value={generatePayload(promptpayId, { amount })} size={160} level="M" />
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
  );
}
