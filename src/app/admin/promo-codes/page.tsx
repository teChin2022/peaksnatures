"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { PromoCode, PromoRedemption } from "@/types/database";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { LoadError } from "@/components/admin/load-error";
import { STICKY_START, TD, TH, TH_ROW } from "@/components/admin/table-classes";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type AdminCodeRow = PromoCode & {
  homestay: {
    id: string;
    name: string;
    slug: string;
    host: { id: string; name: string } | null;
  } | null;
};

type AdminRedemptionRow = PromoRedemption & {
  promo_code: {
    id: string;
    code: string;
    recommender_name: string | null;
    homestay: { name: string; slug: string; host: { name: string } | null } | null;
  } | null;
};

export default function AdminPromoCodesPage() {
  const [codes, setCodes] = useState<AdminCodeRow[]>([]);
  const [redemptions, setRedemptions] = useState<AdminRedemptionRow[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [loadingRedemptions, setLoadingRedemptions] = useState(true);
  const [codesFailed, setCodesFailed] = useState(false);
  const [redemptionsFailed, setRedemptionsFailed] = useState(false);

  const [codesPage, setCodesPage] = useState(1);
  const [codesHasMore, setCodesHasMore] = useState(false);
  const [redemptionsPage, setRedemptionsPage] = useState(1);
  const [redemptionsHasMore, setRedemptionsHasMore] = useState(false);

  const loadCodes = useCallback(async (page: number) => {
    setLoadingCodes(true);
    try {
      const r = await fetch(`/api/admin/promo-codes?page=${page}&limit=${PAGE_SIZE}`);
      if (!r.ok) throw new Error(String(r.status));
      const res = await r.json();
      setCodes((res.data as AdminCodeRow[]) || []);
      setCodesHasMore(!!res.hasMore);
      setCodesFailed(false);
    } catch {
      setCodes([]);
      setCodesHasMore(false);
      setCodesFailed(true);
    } finally {
      setLoadingCodes(false);
    }
  }, []);

  const loadRedemptions = useCallback(async (page: number) => {
    setLoadingRedemptions(true);
    try {
      const r = await fetch(`/api/admin/promo-redemptions?page=${page}&limit=${PAGE_SIZE}`);
      if (!r.ok) throw new Error(String(r.status));
      const res = await r.json();
      setRedemptions((res.data as AdminRedemptionRow[]) || []);
      setRedemptionsHasMore(!!res.hasMore);
      setRedemptionsFailed(false);
    } catch {
      setRedemptions([]);
      setRedemptionsHasMore(false);
      setRedemptionsFailed(true);
    } finally {
      setLoadingRedemptions(false);
    }
  }, []);

  useEffect(() => {
    loadCodes(codesPage);
  }, [codesPage, loadCodes]);

  useEffect(() => {
    loadRedemptions(redemptionsPage);
  }, [redemptionsPage, loadRedemptions]);

  return (
    <div>
      <PageHeader
        subtitle="Read-only audit"
        title="Promo Codes"
        icon={Tag}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadCodes(codesPage);
              loadRedemptions(redemptionsPage);
            }}
            className="cursor-pointer border-earth-200 text-earth-700 hover:bg-earth-50 hover:text-brand"
          >
            {(loadingCodes || loadingRedemptions) && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Refresh
          </Button>
        }
      />

      <Tabs defaultValue="codes" className="w-full">
        <TabsList className="mb-4 bg-earth-50 border border-earth-100">
          <TabsTrigger value="codes" className="cursor-pointer data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
            Codes
          </TabsTrigger>
          <TabsTrigger value="redemptions" className="cursor-pointer data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
            Redemptions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="codes" className="space-y-3">
          {loadingCodes ? (
            <div className="skeleton-warm h-40 w-full rounded-xl" />
          ) : codesFailed ? (
            <LoadError what="promo codes" onRetry={() => loadCodes(codesPage)} />
          ) : codes.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No promo codes yet"
              description="Promo codes created by hosts will appear here."
            />
          ) : (
            <>
              <Card className="overflow-hidden border-earth-100 bg-white py-0">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className={TH_ROW}>
                          <th scope="col" className={cn(TH, STICKY_START)}>Code</th>
                          <th scope="col" className={cn(TH, "text-right")}>Discount</th>
                          <th scope="col" className={TH}>Host · homestay</th>
                          <th scope="col" className={cn(TH, "text-right")}>Used</th>
                          <th scope="col" className={TH}>Valid</th>
                          <th scope="col" className={TH}>Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-earth-100 text-earth-800">
                        {codes.map((c) => (
                          <tr key={c.id} className="align-top">
                            <td className={cn(TD, STICKY_START)}>
                              <span className="font-mono font-semibold text-earth-900">{c.code}</span>
                              {c.recommender_name && <p className="mt-0.5 text-xs text-earth-600">Recommended by {c.recommender_name}</p>}
                            </td>
                            <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>
                              {c.discount_type === "percentage" ? `${c.discount_value}%` : `฿${c.discount_value.toLocaleString()}`}
                            </td>
                            <td className={TD}>
                              {c.homestay?.host?.name || "—"}
                              <p className="text-xs text-earth-600">{c.homestay?.name || "—"}</p>
                            </td>
                            <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>
                              {c.times_used}{c.max_uses != null ? ` / ${c.max_uses}` : ""}
                            </td>
                            <td className={cn(TD, "whitespace-nowrap text-xs tabular-nums text-earth-600")}>
                              {c.start_at || c.expires_at ? `${c.start_at ?? "Any time"} → ${c.expires_at ?? "No end"}` : "Always"}
                            </td>
                            <td className={TD}>
                              <StatusBadge status={c.is_active ? "active" : "inactive"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <PaginationBar
                page={codesPage}
                hasMore={codesHasMore}
                onChange={setCodesPage}
                loading={loadingCodes}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="redemptions" className="space-y-3">
          {loadingRedemptions ? (
            <div className="skeleton-warm h-40 w-full rounded-xl" />
          ) : redemptionsFailed ? (
            <LoadError what="redemptions" onRetry={() => loadRedemptions(redemptionsPage)} />
          ) : redemptions.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No redemptions yet"
              description="Once guests redeem a promo code, the activity will show up here."
            />
          ) : (
            <>
              <Card className="overflow-hidden border-earth-100 bg-white py-0">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className={TH_ROW}>
                          <th scope="col" className={cn(TH, STICKY_START)}>Code</th>
                          <th scope="col" className={TH}>Host · homestay</th>
                          <th scope="col" className={cn(TH, "text-right")}>Discount</th>
                          <th scope="col" className={cn(TH, "text-right")}>Commission</th>
                          <th scope="col" className={TH}>Recommender</th>
                          <th scope="col" className={TH}>Payout</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-earth-100 text-earth-800">
                        {redemptions.map((r) => (
                          <tr key={r.id} className="align-top">
                            <td className={cn(TD, "font-mono font-semibold text-earth-900", STICKY_START)}>{r.promo_code?.code || "—"}</td>
                            <td className={TD}>
                              {r.promo_code?.homestay?.host?.name || "—"}
                              <p className="text-xs text-earth-600">{r.promo_code?.homestay?.name || "—"}</p>
                            </td>
                            <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>฿{r.discount_amount.toLocaleString()}</td>
                            <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>
                              {r.commission_amount > 0 ? `฿${r.commission_amount.toLocaleString()}` : "—"}
                            </td>
                            <td className={TD}>{r.commission_amount > 0 ? r.promo_code?.recommender_name || "—" : "—"}</td>
                            <td className={TD}>
                              <StatusBadge status={r.payout_status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <PaginationBar
                page={redemptionsPage}
                hasMore={redemptionsHasMore}
                onChange={setRedemptionsPage}
                loading={loadingRedemptions}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaginationBar({
  page,
  hasMore,
  onChange,
  loading,
}: {
  page: number;
  hasMore: boolean;
  onChange: (p: number) => void;
  loading: boolean;
}) {
  if (page === 1 && !hasMore) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <span className="text-xs text-earth-600">Page {page}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="cursor-pointer border-earth-200"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page + 1)}
          disabled={!hasMore || loading}
          className="cursor-pointer border-earth-200"
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
