"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Eye, Percent, CalendarX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  /** Rows under "booked": standard bookings and quick bookings. */
  bookedStandard: string;
  bookedQuick: string;
  sessions: string;
  conversion: string;
  lostDemand: string;
  soldOutSuffix: string;
  empty: string;
  /** The request failed: not the same as "no demand yet". */
  error: string;
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
  indent,
  children,
}: {
  label: string;
  value: string;
  /** A side row that is part of the row above, not a step of its own. */
  indent?: boolean;
  /** Right-most column: drop-off % on the funnel, sold-out count on the dates. */
  trailing?: React.ReactNode;
  /** The bar fill, rendered inside the shared track. */
  children: React.ReactNode;
}) {
  return (
    // Phones: label, value and trailing on one line, the bar full width under them
    // (beside a 112px label the bar was ~40px and unreadable). From sm: one row.
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1 sm:flex sm:gap-3">
      <span className={cn("truncate text-xs text-earth-600 sm:w-40 sm:shrink-0", indent && "pl-3")}>{label}</span>
      <div className="col-span-3 row-start-2 h-4 overflow-hidden rounded bg-earth-50 sm:h-5 sm:flex-1">{children}</div>
      <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-earth-900">
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
  const [result, setResult] = useState<{ key: string; stats: DemandStats | null; failed?: boolean } | null>(null);
  const loading = result?.key !== requestKey;
  const stats = result?.key === requestKey ? result.stats : null;
  const failed = result?.key === requestKey && !!result.failed;

  useEffect(() => {
    let cancelled = false;
    // endpoint may already carry ?homestay_id=, so build rather than concat.
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("days", String(days));
    fetch(url.toString())
      .then((res) => (res.ok ? (res.json() as Promise<DemandStats>) : Promise.reject(new Error(String(res.status)))))
      .then((json) => {
        if (!cancelled) setResult({ key: requestKey, stats: json });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, stats: null, failed: true });
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
  // The slip row is a side row: quick booking uploads no slip on the page, so it gets no
  // drop-off of its own and "booked" is compared with the payment page instead.
  const steps = (stats?.funnel ?? []).filter((f) => f.stage !== "slip_uploaded");
  const quick = stats?.totals?.quickConversions ?? 0;
  const barWidth = (n: number) => `${top > 0 ? Math.max(1, (n / top) * 100) : 0}%`;

  return (
    <Card className="border border-earth-100 shadow-sm rounded-2xl">
      <CardHeader className="pb-2 px-6 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold text-earth-900">{labels.title}</CardTitle>
            <p className="text-xs text-earth-600">{labels.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {filter}
            <div className="flex rounded-full bg-earth-100 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={days === r}
                  onClick={() => setDays(r)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    days === r ? "bg-white text-earth-900 shadow-sm" : "text-earth-600 hover:text-earth-800",
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
              <div key={i} className="h-6 animate-pulse rounded bg-earth-100" />
            ))}
          </div>
        ) : failed ? (
          <p role="alert" className="py-10 text-center text-sm text-red-700">{labels.error}</p>
        ) : !stats || !hasData ? (
          <p className="py-10 text-center text-sm text-earth-600">{labels.empty}</p>
        ) : (
          <div className="space-y-6">
            {/* One inset strip, not three cards inside the card (DESIGN.md: one surface deep). */}
            <div className="grid grid-cols-3 divide-x divide-earth-200 rounded-xl bg-earth-50">
              {[
                { title: labels.sessions, value: stats.totals.sessions.toLocaleString(), Icon: Eye },
                { title: labels.conversion, value: `${stats.totals.conversionPct}%`, Icon: Percent },
                { title: labels.lostDemand, value: stats.totals.lostDemand.toLocaleString(), Icon: CalendarX },
              ].map(({ title, value, Icon }) => (
                <div key={title} className="min-w-0 px-3 py-3 sm:px-4">
                  <p className="flex items-center gap-1.5 text-xs text-earth-600">
                    {/* No icon on phones: a third of 343px holds the word, not the word and an icon. */}
                    <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden />
                    <span className="break-words">{title}</span>
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-earth-900 sm:text-2xl">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-earth-800">{labels.funnelTitle}</p>
              <div className="space-y-1.5">
                {stats.funnel.map((row) => {
                  const side = row.stage === "slip_uploaded";
                  const i = steps.indexOf(row);
                  const prev = side || i <= 0 ? null : steps[i - 1].sessions;
                  // Drop-off against the previous stage, not against the top —
                  // that is the number that says which screen loses people.
                  const dropPct =
                    prev && prev > 0 ? Math.round(((prev - row.sessions) / prev) * 100) : null;
                  return (
                    <React.Fragment key={row.stage}>
                      <BarRow
                        label={labels.stages[row.stage]}
                        value={row.sessions.toLocaleString()}
                        indent={side}
                        trailing={
                          dropPct !== null && dropPct > 0 ? (
                            <span className="text-earth-600">{`-${dropPct}%`}</span>
                          ) : null
                        }
                      >
                        <div className="h-full rounded bg-brand/80" style={{ width: barWidth(row.sessions) }} />
                      </BarRow>
                      {row.stage === "booking_submitted" &&
                        quick > 0 &&
                        ([
                          [labels.bookedStandard, row.sessions - quick],
                          [labels.bookedQuick, quick],
                        ] as const).map(([label, n]) => (
                          <BarRow key={label} label={label} value={n.toLocaleString()} indent>
                            <div className="h-full rounded bg-brand/80" style={{ width: barWidth(n) }} />
                          </BarRow>
                        ))}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-earth-800">{labels.topDatesTitle}</p>
              <p className="mb-2 text-xs text-earth-600">{labels.topDatesHint}</p>
              {stats.topDates.length === 0 ? (
                <p className="py-6 text-center text-sm text-earth-600">{labels.empty}</p>
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
                            <span className="text-amber-800">
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
