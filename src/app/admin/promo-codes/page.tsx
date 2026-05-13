"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { PromoCode, PromoRedemption } from "@/types/database";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";

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

  const [codesPage, setCodesPage] = useState(1);
  const [codesHasMore, setCodesHasMore] = useState(false);
  const [redemptionsPage, setRedemptionsPage] = useState(1);
  const [redemptionsHasMore, setRedemptionsHasMore] = useState(false);

  const loadCodes = useCallback(async (page: number) => {
    setLoadingCodes(true);
    try {
      const res = await fetch(`/api/admin/promo-codes?page=${page}&limit=${PAGE_SIZE}`).then((r) => r.json());
      setCodes((res.data as AdminCodeRow[]) || []);
      setCodesHasMore(!!res.hasMore);
    } catch {
      setCodes([]);
      setCodesHasMore(false);
    } finally {
      setLoadingCodes(false);
    }
  }, []);

  const loadRedemptions = useCallback(async (page: number) => {
    setLoadingRedemptions(true);
    try {
      const res = await fetch(`/api/admin/promo-redemptions?page=${page}&limit=${PAGE_SIZE}`).then((r) => r.json());
      setRedemptions((res.data as AdminRedemptionRow[]) || []);
      setRedemptionsHasMore(!!res.hasMore);
    } catch {
      setRedemptions([]);
      setRedemptionsHasMore(false);
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
        eyebrow="Read-only audit"
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

        <TabsContent value="codes" className="space-y-2">
          {loadingCodes ? (
            <div className="skeleton-warm h-40 w-full rounded-xl" />
          ) : codes.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No promo codes yet"
              description="Promo codes created by hosts will appear here."
            />
          ) : (
            <>
              {codes.map((c) => (
                <Card key={c.id} className="dashboard-card border-earth-100">
                  <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Tag className="h-4 w-4 text-earth-400" />
                        <span className="font-mono font-semibold text-earth-900">{c.code}</span>
                        <Badge variant="outline" className="border-earth-200 text-earth-700 tabular-nums">
                          {c.discount_type === "percentage" ? `${c.discount_value}%` : `฿${c.discount_value}`}
                        </Badge>
                        {!c.is_active && <StatusBadge status="inactive" />}
                        {c.recommender_name && (
                          <Badge className="bg-brand-50 text-brand border border-brand/15 text-[10px] px-1.5 py-0.5">
                            {c.recommender_name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-earth-500">
                        {c.homestay?.host?.name || "—"} · {c.homestay?.name || "—"}
                      </p>
                      <p className="text-xs text-earth-500 tabular-nums">
                        Used: {c.times_used}{c.max_uses != null ? ` / ${c.max_uses}` : ""}
                        {c.start_at && ` · From ${c.start_at}`}
                        {c.expires_at && ` · Until ${c.expires_at}`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <PaginationBar
                page={codesPage}
                hasMore={codesHasMore}
                onChange={setCodesPage}
                loading={loadingCodes}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="redemptions" className="space-y-2">
          {loadingRedemptions ? (
            <div className="skeleton-warm h-40 w-full rounded-xl" />
          ) : redemptions.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No redemptions yet"
              description="Once guests redeem a promo code, the activity will show up here."
            />
          ) : (
            <>
              {redemptions.map((r) => (
                <Card key={r.id} className="dashboard-card border-earth-100">
                  <CardContent className="flex flex-col gap-1 p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-earth-900">{r.promo_code?.code || "—"}</span>
                      <StatusBadge status={r.payout_status} />
                    </div>
                    <p className="text-xs text-earth-500">
                      {r.promo_code?.homestay?.host?.name || "—"} · {r.promo_code?.homestay?.name || "—"}
                    </p>
                    <p className="text-xs text-earth-600 tabular-nums">
                      Discount ฿{r.discount_amount.toLocaleString()}
                      {r.commission_amount > 0 && (
                        <> · Commission ฿{r.commission_amount.toLocaleString()} → {r.promo_code?.recommender_name || "—"}</>
                      )}
                    </p>
                  </CardContent>
                </Card>
              ))}
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
      <span className="text-xs text-earth-500">Page {page}</span>
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
