"use client";

import {
  Ban,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface ProhibitionsSectionProps {
  prohibitions: string[];
  themeColor?: string;
}

export function ProhibitionsSection({
  prohibitions,
  themeColor = "#16a34a",
}: ProhibitionsSectionProps) {
  const t = useTranslations("prohibitions");

  if (!prohibitions || prohibitions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: themeColor + "15" }}
        >
          <ShieldAlert className="h-4.5 w-4.5" style={{ color: themeColor }} />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{t("title")}</h2>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {prohibitions.map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:border-gray-300"
          >
            <Ban className="h-4 w-4 shrink-0 text-red-400" />
            <span className="truncate">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
