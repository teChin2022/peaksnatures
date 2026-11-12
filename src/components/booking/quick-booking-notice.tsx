"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { HostContactLinks } from "@/components/booking/host-contact-links";

/**
 * What a guest sees right after placing a quick booking: the code to quote in
 * chat, what to transfer, and how to reach the host. Nothing has been paid or
 * checked yet, so it says what to do next rather than that the booking is done.
 */
export function QuickBookingNotice({
  code,
  amountToTransfer,
  facebookUrl,
  hostPhone,
}: {
  code: string;
  amountToTransfer: number;
  facebookUrl: string | null | undefined;
  hostPhone: string | null | undefined;
}) {
  const t = useTranslations("booking");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // No clipboard (insecure context, permission): the code is on screen to read.
    }
  };

  return (
    <div className="mt-4 w-full space-y-4 text-left">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
        <p className="text-sm text-amber-800">{t("quickCodeLabel")}</p>
        <p className="mt-1 font-mono text-3xl font-bold text-earth-900">{code}</p>
        <button
          type="button"
          onClick={copy}
          className="mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? t("quickCodeCopied") : t("quickCodeCopy")}
        </button>
        <span className="sr-only" role="status">
          {copied ? t("quickCodeCopied") : ""}
        </span>
      </div>

      <div className="flex items-baseline justify-between rounded-2xl bg-earth-50 px-4 py-3">
        <span className="text-sm text-earth-600">{t("amountToTransfer")}</span>
        <span className="text-lg font-bold text-earth-900 tabular-nums">฿{amountToTransfer.toLocaleString()}</span>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-earth-900">{t("quickNextTitle")}</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-earth-700 marker:font-semibold">
          <li>{t("quickNextStep1")}</li>
          <li>{t("quickNextStep2")}</li>
        </ol>
      </div>

      <HostContactLinks facebookUrl={facebookUrl} hostPhone={hostPhone} />
    </div>
  );
}
