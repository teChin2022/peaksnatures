"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Eye, Percent, CalendarX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import type { DemandStage } from "@/lib/demand-events";
import type { DemandStats } from "@/lib/demand-stats";
import { fmtDateStr } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export interface DemandPanelLabels {
  title: string;
  subtitle: string;
  funnelTitle: string;
  topDatesTitle: string;
  topDatesHint: string;
  stages: Record<DemandStage, string>;
  sessions: string;
  conversion: string;
  lostDemand: string;
  soldOutSuffix: string;
  empty: string;
  ranges: { d7: string; d30: string; d90: string };
}

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

/**
 * One horizontal bar row. Both charts in this panel render through it so their
 * label, track and trailing columns line up exactly — previously each loop
 * carried its own widths and the two charts' bars started and ended at
 * different x-positions.
 */
function BarRow({
  label,
  value,
  trailing,
  children,
}: {
  label: string;
  value: string;
  /** Right-most column: drop-off % on the funnel, sold-out count on the dates. */
  trailing?: React.ReactNode;
  /** The bar fill, rendered inside the shared track. */
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs text-gray-500 sm:w-36">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded bg-gray-50">{children}</div>
      <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-gray-900">
        {value}
      </span>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums">{trailing}</span>
    </div>
  );
}

/**
 * Guest demand funnel. Shared verbatim by the host dashboard (ภาพรวม tab) and
 * the platform admin overview — the only differences are the endpoint it reads
 * and the labels it is handed.
 *
 * All copy arrives through `labels` rather than next-intl, because /admin/* is
 * English-only and must not pull in useTranslations.
 *
 * The bars are plain divs rather than recharts: eight labelled horizontal rows
 * with a count, a percentage and a drop-off read better and behave better on
 * mobile than a chart component, and cost no hydration.
 */
export function DemandPanel({
  endpoint,
  labels,
  filter,
  locale = "en",
}: {
  endpoint: string;
  labels: DemandPanelLabels;
  /** Optional header slot — the admin homestay picker lives here. */
  filter?: React.ReactNode;
  locale?: string;
}) {
  const [days, setDays] = useState<Range>(30);
  // Keyed by the request that produced it, so `loading` is derived rather than
  // a second piece of state, and a slow response for 90d can never overwrite a
  // newer one for 7d.
  const requestKey = `${endpoint}|${days}`;
  const [result, setResult] = useState<{ key: string; stats: DemandStats | null } | null>(null);
  const loading = result?.key !== requestKey;
  const stats = result?.key === requestKey ? result.stats : null;

  useEffect(() => {
    let cancelled = false;
    // endpoint may already carry ?homestay_id=, so build rather than concat.
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("days", String(days));
    fetch(url.toString())
      .then((res) => (res.ok ? (res.json() as Promise<DemandStats>) : null))
      .then((json) => {
        if (!cancelled) setResult({ key: requestKey, stats: json });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, stats: null });
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, days, requestKey]);

  const rangeLabel = { 7: labels.ranges.d7, 30: labels.ranges.d30, 90: labels.ranges.d90 };
  // Scale to the largest stage rather than assuming page_view is it: the
  // page_view dwell delay means a stage can, in odd sessions, out-count it.
  const top = Math.max(0, ...(stats?.funnel ?? []).map((f) => f.sessions));
  const hasData = top > 0;
  const maxRequested = Math.max(1, ...(stats?.topDates ?? []).map((d) => d.requested));

  return (
    <Card className="border border-gray-100 shadow-sm rounded-2xl">
      <CardHeader className="pb-2 px-6 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold text-gray-900">{labels.title}</CardTitle>
            <p className="text-xs text-gray-400">{labels.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {filter}
            <div className="flex rounded-full bg-gray-100 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDays(r)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    days === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  {rangeLabel[r]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-5">
        {loading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : !stats || !hasData ? (
          <p className="py-10 text-center text-sm text-gray-300">{labels.empty}</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                title={labels.sessions}
                value={stats.totals.sessions.toLocaleString()}
                icon={<Eye className="h-4 w-4 text-gray-400" />}
              />
              <StatCard
                title={labels.conversion}
                value={`${stats.totals.conversionPct}%`}
                icon={<Percent className="h-4 w-4 text-gray-400" />}
              />
              <StatCard
                title={labels.lostDemand}
                value={stats.totals.lostDemand.toLocaleString()}
                icon={<CalendarX className="h-4 w-4 text-gray-400" />}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">{labels.funnelTitle}</p>
              <div className="space-y-1.5">
                {stats.funnel.map((row, i) => {
                  const prev = i === 0 ? null : stats.funnel[i - 1].sessions;
                  // Drop-off against the previous stage, not against the top —
                  // that is the number that says which screen loses people.
                  const dropPct =
                    prev && prev > 0 ? Math.round(((prev - row.sessions) / prev) * 100) : null;
                  const widthPct = top > 0 ? Math.max(1, (row.sessions / top) * 100) : 0;
                  return (
                    <BarRow
                      key={row.stage}
                      label={labels.stages[row.stage]}
                      value={row.sessions.toLocaleString()}
                      trailing={
                        dropPct !== null && dropPct > 0 ? (
                          <span className="text-gray-400">{`-${dropPct}%`}</span>
                        ) : null
                      }
                    >
                      <div className="h-full rounded bg-brand/80" style={{ width: `${widthPct}%` }} />
                    </BarRow>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700">{labels.topDatesTitle}</p>
              <p className="mb-2 text-xs text-gray-400">{labels.topDatesHint}</p>
              {stats.topDates.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-300">{labels.empty}</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.topDates.map((d) => {
                    const total = (d.requested / maxRequested) * 100;
                    // Amber slice = the share of that date's demand we could not
                    // serve. A tall amber bar is a date to unblock or re-price.
                    const lostShare = d.requested > 0 ? (d.unavailable / d.requested) * 100 : 0;
                    return (
                      <BarRow
                        key={d.date}
                        label={fmtDateStr(d.date, "d MMM", locale)}
                        value={d.requested.toLocaleString()}
                        trailing={
                          d.unavailable > 0 ? (
                            <span className="text-amber-600">
                              {`${d.unavailable} ${labels.soldOutSuffix}`}
                            </span>
                          ) : null
                        }
                      >
                        {/* overflow-hidden so the wrapper's rounding actually clips the
                            two segments — without it the amber tip stays square while
                            the funnel's single fill is rounded, and the two charts read
                            as different treatments again. */}
                        <div
                          className="flex h-full overflow-hidden rounded"
                          style={{ width: `${Math.max(1, total)}%` }}
                        >
                          <div className="h-full bg-brand/80" style={{ width: `${100 - lostShare}%` }} />
                          <div className="h-full bg-amber-400" style={{ width: `${lostShare}%` }} />
                        </div>
                      </BarRow>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
