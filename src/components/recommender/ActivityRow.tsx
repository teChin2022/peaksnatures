"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type PayoutStatus = "pending" | "paid" | "cancelled";

interface ActivityRowProps {
  code: string;
  homestayName: string;
  dateLabel: string;
  amount: number;
  status: PayoutStatus;
}

const fmtTHB = (n: number) => `฿${new Intl.NumberFormat("th-TH").format(n)}`;

export function ActivityRow({
  code,
  homestayName,
  dateLabel,
  amount,
  status,
}: ActivityRowProps) {
  const t = useTranslations("recommenderStats");
  const isCancelled = status === "cancelled";
  const isZero = amount === 0 && !isCancelled;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-4 transition-colors duration-150 hover:bg-earth-50 ${
        isCancelled ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-sm font-semibold text-earth-900">{code}</p>
        <p
          className="mt-0.5 truncate text-xs text-earth-500"
          title={`${homestayName} · ${dateLabel}`}
        >
          {homestayName} · {dateLabel}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`text-sm font-semibold tabular-nums ${
            isZero ? "text-earth-500" : "text-earth-900"
          }`}
        >
          {fmtTHB(amount)}
        </span>
        {!isZero &&
          (status === "paid" ? (
            <Badge className="bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {t("statusPaid")}
            </Badge>
          ) : status === "pending" ? (
            <Badge className="bg-amber-100 text-amber-700">
              <Clock className="mr-1 h-3 w-3" />
              {t("statusPending")}
            </Badge>
          ) : (
            <Badge className="bg-gray-100 text-gray-600">
              <XCircle className="mr-1 h-3 w-3" />
              {t("statusCancelled")}
            </Badge>
          ))}
      </div>
    </div>
  );
}
