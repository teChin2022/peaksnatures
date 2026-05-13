"use client";

import { useTranslations } from "next-intl";

interface PayoutProgressProps {
  paid: number;
  pending: number;
  size?: "sm" | "md";
  hideLabels?: boolean;
}

const fmtTHB = (n: number) => `฿${new Intl.NumberFormat("th-TH").format(n)}`;

export function PayoutProgress({
  paid,
  pending,
  size = "md",
  hideLabels = false,
}: PayoutProgressProps) {
  const t = useTranslations("recommenderStats");
  const total = paid + pending;
  const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
  const pendingPct = total > 0 ? 100 - paidPct : 0;

  const trackHeight = size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className="w-full">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={paidPct}
        aria-label={`${paidPct}% ${t("paid")}, ${pendingPct}% ${t("pending")}`}
        className={`flex w-full overflow-hidden rounded-full bg-earth-100 ${trackHeight}`}
      >
        {paid > 0 && (
          <span
            className="block bg-emerald-500 motion-safe:transition-[width] motion-safe:duration-500"
            style={{ width: `${paidPct}%` }}
          />
        )}
        {pending > 0 && (
          <span
            className="block bg-amber-400 motion-safe:transition-[width] motion-safe:duration-500"
            style={{ width: `${pendingPct}%` }}
          />
        )}
      </div>
      {!hideLabels && (paid > 0 || pending > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
          {paid > 0 && (
            <span className="flex items-center gap-1.5 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {fmtTHB(paid)} {t("paid").toLowerCase()}
            </span>
          )}
          {pending > 0 && (
            <span className="flex items-center gap-1.5 text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {fmtTHB(pending)} {t("pending").toLowerCase()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
