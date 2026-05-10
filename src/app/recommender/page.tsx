"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { format, parseISO } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import { Phone, Search, Loader2, CheckCircle2, Clock, XCircle, Tag, Wallet, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
  payout_status: "pending" | "paid" | "cancelled";
  created_at: string;
}

interface StatsResponse {
  ok: boolean;
  reason?: string;
  phone?: string;
  codes?: CodeAggregate[];
  recent_activity?: RecentActivity[];
}

export default function RecommenderStatsPage() {
  const t = useTranslations("recommenderStats");
  const locale = useLocale();
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatsResponse | null>(null);

  const fmt = (s: string) => {
    const d = parseISO(s);
    if (locale === "th") {
      const formatted = format(d, "d MMM", { locale: thLocale });
      return `${formatted} ${d.getFullYear() + 543}`;
    }
    return format(d, "d MMM yyyy");
  };

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

  async function copyShareLink(slug: string | null, code: string) {
    if (!slug) return;
    // Click-time origin keeps preview deploys producing preview URLs, prod producing prod URLs.
    const url = `${window.location.origin}/${slug}?promo=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copyLinkDone"));
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

  return (
    <div className="min-h-screen bg-earth-50 px-4 py-12 md:py-16">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
            <Wallet className="h-6 w-6 text-brand" />
          </div>
          <h1 className="font-serif text-3xl font-normal text-earth-900 md:text-4xl">{t("title")}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-earth-500">{t("subtitle")}</p>
        </div>

        <form onSubmit={handleSearch} className="rounded-2xl border border-earth-200 bg-white p-4 shadow-sm md:p-5">
          <label className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">
            {t("phoneLabel")}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400" size={16} />
              <Input
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder={t("phonePlaceholder")}
                inputMode="numeric"
                className="!pl-10 p-3.5 !h-auto rounded-xl !border !border-earth-200 !bg-white hover:!border-earth-400 transition-all text-sm"
              />
            </div>
            <Button type="submit" disabled={loading} className="rounded-xl px-6">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="mr-2 h-4 w-4" />{t("search")}</>}
            </Button>
          </div>
        </form>

        {result && result.codes && result.codes.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center">
              <p className="text-sm text-earth-500">{t("noResults")}</p>
            </CardContent>
          </Card>
        )}

        {result && result.codes && result.codes.length > 0 && totals && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card><CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-earth-400">{t("redemptions")}</p>
                <p className="mt-1 text-2xl font-bold text-earth-900">{totals.uses}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-earth-400">{t("totalEarned")}</p>
                <p className="mt-1 text-2xl font-bold text-earth-900">฿{totals.total.toLocaleString()}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-amber-600">{t("pending")}</p>
                <p className="mt-1 text-2xl font-bold text-amber-700">฿{totals.pending.toLocaleString()}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-emerald-600">{t("paid")}</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">฿{totals.paid.toLocaleString()}</p>
              </CardContent></Card>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-earth-500">{t("yourCodes")}</h2>
              {result.codes.map((c) => (
                <Card key={c.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <CardTitle className="order-1 truncate text-base font-semibold text-earth-900 md:order-2 md:text-xs md:font-normal md:text-earth-500">
                        {c.homestay_name}
                      </CardTitle>
                      <div className="order-2 flex flex-wrap items-center gap-x-2 gap-y-1 md:order-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <Tag className="h-4 w-4 shrink-0 text-earth-400" />
                          <span className="truncate font-mono text-sm text-earth-900 md:text-base">{c.code}</span>
                        </div>
                        {c.homestay_slug && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs text-earth-500 hover:text-brand"
                            onClick={() => copyShareLink(c.homestay_slug, c.code)}
                            aria-label={t("copyLink")}
                          >
                            <LinkIcon className="h-3.5 w-3.5" />
                            {t("copyLink")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 pt-0 text-sm md:grid-cols-4">
                    <div>
                      <p className="text-xs text-earth-400">{t("redemptions")}</p>
                      <p className="font-semibold text-earth-900">{c.total_redemptions}</p>
                    </div>
                    <div>
                      <p className="text-xs text-earth-400">{t("totalEarned")}</p>
                      <p className="font-semibold text-earth-900">฿{c.total_commission.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-amber-600">{t("pending")}</p>
                      <p className="font-semibold text-amber-700">฿{c.pending_commission.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-600">{t("paid")}</p>
                      <p className="font-semibold text-emerald-700">฿{c.paid_commission.toLocaleString()}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {result.recent_activity && result.recent_activity.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-earth-500">{t("recentActivity")}</h2>
                <Card>
                  <CardContent className="divide-y divide-earth-100 p-0">
                    {result.recent_activity.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold text-earth-900">{r.code}</p>
                          <p className="truncate text-xs text-earth-500">{r.homestay_name} · {fmt(r.created_at)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-sm font-semibold text-earth-900">฿{r.commission_amount.toLocaleString()}</span>
                          {r.payout_status === "paid" ? (
                            <Badge className="bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="mr-1 h-3 w-3" />{t("statusPaid")}
                            </Badge>
                          ) : r.payout_status === "pending" ? (
                            <Badge className="bg-amber-100 text-amber-700">
                              <Clock className="mr-1 h-3 w-3" />{t("statusPending")}
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600">
                              <XCircle className="mr-1 h-3 w-3" />{t("statusCancelled")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            <p className="text-center text-xs text-earth-400">{t("payoutHint")}</p>
          </>
        )}
      </div>
    </div>
  );
}
