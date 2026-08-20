"use client";

import * as React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Host dashboard KPI tile. Lifted verbatim out of src/app/dashboard/page.tsx so
 * the demand panel can reuse it instead of duplicating it.
 *
 * `change` / `changeLabel` are optional: a metric with no period-over-period
 * comparison (the demand tiles) just renders title + value, which is what the
 * original already did whenever change was null.
 */
export function StatCard({
  title,
  value,
  change = null,
  changeLabel = "",
  icon,
  isDelta = false,
  invertColor = false,
}: {
  title: string;
  value: string;
  change?: number | null;
  changeLabel?: string;
  icon: React.ReactNode;
  isDelta?: boolean;
  /** For metrics where up is bad (cancellations): flips green/red. */
  invertColor?: boolean;
}) {
  const isPositive = change !== null && change > 0;
  const isNegative = change !== null && change < 0;
  const isNeutral = change === null || change === 0;

  const greenCondition = invertColor ? isNegative : isPositive;

  return (
    <Card className="border border-gray-100 shadow-sm rounded-2xl">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-500 leading-tight">{title}</p>
          {icon}
        </div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {!isNeutral && (
          <div className="flex items-center gap-1 mt-1.5">
            {greenCondition ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
            )}
            <span className={`text-xs font-medium ${greenCondition ? "text-emerald-600" : "text-rose-500"}`}>
              {isDelta
                ? `${change! > 0 ? "+" : ""}${change}`
                : `${change! > 0 ? "+" : ""}${change}%`
              }
            </span>
            <span className="text-xs text-gray-400">{changeLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
