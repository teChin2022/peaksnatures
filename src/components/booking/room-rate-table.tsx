"use client";

import { useTranslations, useLocale } from "next-intl";
import { Sparkles } from "lucide-react";
import { formatSpecialPriceRule } from "@/lib/special-price-label";
import { fmtDateStr } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Room, RoomSeasonalPrice, RoomSpecialPrice } from "@/types/database";

/**
 * A house's base, special and seasonal rates: what it costs across the year.
 * Shared by the house card's "วันว่าง & ราคา" dialog and the availability
 * calendar's house detail, so the two cannot drift apart.
 */
export function RoomRateTable({
  room,
  seasonalPrices,
  specialPrices,
  className,
}: {
  room: Room;
  seasonalPrices: RoomSeasonalPrice[];
  specialPrices: RoomSpecialPrice[];
  className?: string;
}) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const seasons = seasonalPrices.slice().sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div className={cn("rounded-2xl bg-mist px-5 py-5", className)}>
      {/* Eyebrow + hairline */}
      <div className="mb-4 flex items-center gap-3">
        <h4 className="text-xs font-semibold text-ink-3">{t("priceDetailsTitle")}</h4>
        <div className="h-px flex-1 bg-line" />
      </div>

      {/* Base price — the anchor. Labelled just "price" here (owner, 2026-11-14); the house cards keep "standard rate". */}
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-ink">{t("ratePrice")}</span>
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className="text-2xl font-bold text-ink">฿{room.price_per_night.toLocaleString()}</span>
          <span className="text-xs text-ink-3">{tc("perNight")}</span>
        </div>
      </div>

      {specialPrices.length > 0 && (
        <div className="mt-5 border-t border-dashed border-line-strong pt-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-pine" strokeWidth={2.5} />
            <span className="text-xs font-semibold text-ink-3">{t("specialRates")}</span>
          </div>
          <ul className="space-y-3">
            {specialPrices.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-4">
                <div className="min-w-0 pr-2">
                  <div className="truncate text-sm font-medium text-ink">{s.name}</div>
                  <div className="mt-0.5 text-xs text-ink-3 tabular-nums">{formatSpecialPriceRule(s, locale)}</div>
                </div>
                <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
                  <span className="text-lg font-bold text-pine">+฿{s.surcharge.toLocaleString()}</span>
                  <span className="text-xs text-ink-3">{tc("perNight")}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {seasons.length > 0 && (
        <div className="mt-5 border-t border-dashed border-line-strong pt-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-pine" strokeWidth={2.5} />
            <span className="text-xs font-semibold text-ink-3">{t("seasonalRates")}</span>
          </div>
          <ul className="space-y-3">
            {seasons.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-4">
                <div className="min-w-0 pr-2">
                  <div className="truncate text-sm font-medium text-ink">{s.name}</div>
                  <div className="mt-0.5 text-xs text-ink-3 tabular-nums">
                    {fmtDateStr(s.start_date, "d MMM", locale)} – {fmtDateStr(s.end_date, "d MMM yyyy", locale)}
                  </div>
                </div>
                <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
                  <span className="text-lg font-bold text-pine">฿{s.price_per_night.toLocaleString()}</span>
                  <span className="text-xs text-ink-3">{tc("perNight")}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
