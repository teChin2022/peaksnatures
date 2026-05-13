"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { format, parseISO } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import {
  Phone,
  Search,
  Loader2,
  Tag,
  Link as LinkIcon,
  Check,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { PayoutProgress } from "@/components/recommender/PayoutProgress";
import { ActivityRow, type PayoutStatus } from "@/components/recommender/ActivityRow";
import { StatsSkeleton } from "@/components/recommender/StatsSkeleton";

interface CodeAggregate {
  id: string;
  code: string;
  homestay_name: string;
  homestay_slug: string | null;
  total_redemptions: number;
  total_commission: number;
  paid_commission: number;
  pending_commission: number;
}

interface RecentActivity {
  id: string;
  code: string;
  homestay_name: string;
  commission_amount: number;
  payout_status: PayoutStatus;
  created_at: string;
}

interface StatsResponse {
  ok: boolean;
  reason?: string;
  phone?: string;
  codes?: CodeAggregate[];
  recent_activity?: RecentActivity[];
}

const fmtTHB = (n: number) => `฿${new Intl.NumberFormat("th-TH").format(n)}`;

export function RecommenderClient({ emptyState }: { emptyState: React.ReactNode }) {
  const t = useTranslations("recommenderStats");
  const locale = useLocale();
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatsResponse | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const monthLabel = useMemo(() => {
    return (iso: string) => {
      const d = parseISO(iso);
      if (locale === "th") {
        const m = format(d, "MMMM", { locale: thLocale });
        return `${m} ${d.getFullYear() + 543}`;
      }
      return format(d, "MMMM yyyy");
    };
  }, [locale]);

  const dayLabel = useMemo(() => {
    return (iso: string) => {
      const d = parseISO(iso);
      if (locale === "th") {
        const formatted = format(d, "d MMM", { locale: thLocale });
        return `${formatted} ${d.getFullYear() + 543}`;
      }
      return format(d, "d MMM yyyy");
    };
  }, [locale]);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const digits = phoneInput.replace(/\D/g, "");
    if (digits.length < 7) {
      toast.error(t("errorInvalidPhone"));
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/promos/recommender-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const data = (await res.json()) as StatsResponse;
      if (!res.ok || !data.ok) {
        toast.error(t(data.reason === "INVALID_PHONE" ? "errorInvalidPhone" : "errorGeneric"));
        return;
      }
      setResult(data);
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function copyShareLink(slug: string | null, code: string, codeId: string) {
    if (!slug) return;
    const url = `${window.location.origin}/${slug}?promo=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copyLinkDone"));
      setCopiedCodeId(codeId);
      window.setTimeout(() => setCopiedCodeId((current) => (current === codeId ? null : current)), 2000);
    } catch {
      // Silently ignore.
    }
  }

  const totals = result?.codes?.reduce(
    (acc, c) => ({
      uses: acc.uses + c.total_redemptions,
      total: acc.total + c.total_commission,
      paid: acc.paid + c.paid_commission,
      pending: acc.pending + c.pending_commission,
    }),
    { uses: 0, total: 0, paid: 0, pending: 0 },
  );

  const activityGroups = useMemo(() => {
    if (!result?.recent_activity?.length) return [] as { label: string; rows: RecentActivity[] }[];
    const groups: { label: string; rows: RecentActivity[] }[] = [];
    for (const row of result.recent_activity) {
      const label = monthLabel(row.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.rows.push(row);
      } else {
        groups.push({ label, rows: [row] });
      }
    }
    return groups;
  }, [result?.recent_activity, monthLabel]);

  const hasCodes = !!(result && result.codes && result.codes.length > 0 && totals);
  const showEmptyHint = !!(result && result.codes && result.codes.length === 0);
  const showEmptyState = !loading && !result;

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSearch}
        className="rounded-2xl border border-earth-200 bg-white p-4 shadow-sm md:p-5"
      >
        <label
          htmlFor="recommender-phone"
          className="block text-[12px] font-semibold uppercase tracking-[0.18em] text-earth-500"
        >
          {t("phoneLabel")}
        </label>
        <div className="mt-2 flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Phone
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400"
              size={16}
              aria-hidden="true"
            />
            <Input
              id="recommender-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder={t("phonePlaceholder")}
              inputMode="numeric"
              aria-describedby="recommender-privacy-hint"
              className="!h-12 rounded-xl !border-earth-200 !bg-white !pl-10 text-base transition-colors hover:!border-earth-400"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="h-12 cursor-pointer rounded-xl bg-brand px-6 text-white hover:bg-brand-hover md:min-w-[120px]"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("search")}
              </>
            )}
          </Button>
        </div>
        <p
          id="recommender-privacy-hint"
          className="mt-3 text-xs leading-relaxed text-earth-500"
        >
          {t("privacyHint")}
        </p>
      </form>

      {loading && <StatsSkeleton />}

      {showEmptyHint && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-earth-500">{t("noResults")}</p>
          </CardContent>
        </Card>
      )}

      {hasCodes && totals && (
        <>
          <Card>
            <CardContent className="space-y-5 p-5 md:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-earth-500">
                  {t("totalEarned")}
                </p>
                <p className="mt-1 font-serif text-3xl text-earth-900 tabular-nums md:text-4xl">
                  {fmtTHB(totals.total)}
                </p>
              </div>
              <PayoutProgress paid={totals.paid} pending={totals.pending} />
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-earth-100 pt-4 text-xs text-earth-500">
                <span>
                  <span className="font-semibold text-earth-900 tabular-nums">{totals.uses}</span>{" "}
                  {t("redemptions").toLowerCase()}
                </span>
                <span>
                  <span className="font-semibold text-earth-900 tabular-nums">
                    {result?.codes?.length ?? 0}
                  </span>{" "}
                  {t("activeCodes")}
                </span>
              </div>
            </CardContent>
          </Card>

          <section aria-labelledby="your-codes-title" className="space-y-3">
            <h2
              id="your-codes-title"
              className="text-sm font-semibold uppercase tracking-[0.18em] text-earth-500"
            >
              {t("yourCodes")}
            </h2>
            <div className="space-y-3">
              {result!.codes!.map((c) => {
                const copied = copiedCodeId === c.id;
                return (
                  <Card key={c.id}>
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Tag
                              className="h-4 w-4 shrink-0 text-earth-400"
                              aria-hidden="true"
                            />
                            <span className="truncate font-mono text-base font-semibold text-earth-900">
                              {c.code}
                            </span>
                          </div>
                          <p
                            className="mt-1 truncate text-xs text-earth-500"
                            title={c.homestay_name}
                          >
                            {c.homestay_name}
                          </p>
                        </div>
                        {c.homestay_slug && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => copyShareLink(c.homestay_slug, c.code, c.id)}
                            aria-label={t("copyLink")}
                            className="h-10 w-full cursor-pointer gap-1.5 rounded-xl border-earth-200 text-xs text-earth-700 transition-colors hover:border-brand hover:text-brand sm:w-auto"
                          >
                            {copied ? (
                              <>
                                <Check
                                  className="h-3.5 w-3.5 text-emerald-600"
                                  aria-hidden="true"
                                />
                                {t("copyDone")}
                              </>
                            ) : (
                              <>
                                <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                {t("copyLink")}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <PayoutProgress
                        paid={c.paid_commission}
                        pending={c.pending_commission}
                        size="sm"
                        hideLabels
                      />
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="text-earth-500">
                          <span className="font-semibold tabular-nums text-earth-900">
                            {c.total_redemptions}
                          </span>{" "}
                          {t("redemptions").toLowerCase()}
                        </span>
                        <span className="text-earth-500">
                          <span className="font-semibold tabular-nums text-earth-900">
                            {fmtTHB(c.total_commission)}
                          </span>{" "}
                          {t("totalEarned").toLowerCase()}
                        </span>
                        {c.paid_commission > 0 && (
                          <span className="flex items-center gap-1.5 text-emerald-700 tabular-nums">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            {fmtTHB(c.paid_commission)}
                          </span>
                        )}
                        {c.pending_commission > 0 && (
                          <span className="flex items-center gap-1.5 text-amber-700 tabular-nums">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            {fmtTHB(c.pending_commission)}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {activityGroups.length > 0 && (
            <section aria-labelledby="activity-title" className="space-y-3">
              <h2
                id="activity-title"
                className="text-sm font-semibold uppercase tracking-[0.18em] text-earth-500"
              >
                {t("recentActivity")}
              </h2>
              <Card>
                <CardContent className="p-0">
                  {activityGroups.map((group, gi) => (
                    <div key={group.label}>
                      <div className="bg-earth-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-earth-500">
                        {group.label}
                      </div>
                      <div className="divide-y divide-earth-100">
                        {group.rows.map((r) => (
                          <ActivityRow
                            key={r.id}
                            code={r.code}
                            homestayName={r.homestay_name}
                            dateLabel={dayLabel(r.created_at)}
                            amount={r.commission_amount}
                            status={r.payout_status}
                          />
                        ))}
                      </div>
                      {gi < activityGroups.length - 1 && (
                        <div className="border-b border-earth-100" />
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          <p className="flex items-start gap-2 rounded-xl bg-earth-100/60 px-4 py-3 text-xs leading-relaxed text-earth-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-earth-500" aria-hidden="true" />
            {t("payoutHint")}
          </p>
        </>
      )}

      {showEmptyState && emptyState}
    </div>
  );
}
