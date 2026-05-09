"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag, Loader2 } from "lucide-react";
import type { PromoCode, PromoRedemption } from "@/types/database";

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

  const load = async () => {
    setLoadingCodes(true);
    setLoadingRedemptions(true);
    const [c, r] = await Promise.all([
      fetch("/api/admin/promo-codes?limit=100").then((res) => res.json()).catch(() => ({ data: [] })),
      fetch("/api/admin/promo-redemptions?limit=100").then((res) => res.json()).catch(() => ({ data: [] })),
    ]);
    setCodes((c.data as AdminCodeRow[]) || []);
    setRedemptions((r.data as AdminRedemptionRow[]) || []);
    setLoadingCodes(false);
    setLoadingRedemptions(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-earth-900">Promo Codes</h1>
        <p className="mt-1 text-sm text-earth-500">Read-only view of all promo codes and redemptions across hosts.</p>
      </div>

      <Tabs defaultValue="codes" className="w-full">
        <TabsList>
          <TabsTrigger value="codes">Codes ({codes.length})</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions ({redemptions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="codes" className="mt-4 space-y-2">
          {loadingCodes ? (
            <Skeleton className="h-40 w-full" />
          ) : codes.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-earth-500">No promo codes yet.</CardContent></Card>
          ) : (
            codes.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-earth-400" />
                      <span className="font-mono font-semibold">{c.code}</span>
                      <Badge variant="outline">
                        {c.discount_type === "percentage" ? `${c.discount_value}%` : `฿${c.discount_value}`}
                      </Badge>
                      {!c.is_active && <Badge className="bg-gray-100 text-gray-600">inactive</Badge>}
                      {c.recommender_name && <Badge className="bg-violet-100 text-violet-700">{c.recommender_name}</Badge>}
                    </div>
                    <p className="text-xs text-earth-500">
                      {c.homestay?.host?.name || "—"} · {c.homestay?.name || "—"}
                    </p>
                    <p className="text-xs text-earth-500">
                      Used: {c.times_used}{c.max_uses != null ? ` / ${c.max_uses}` : ""}
                      {c.start_at && ` · From ${c.start_at}`}
                      {c.expires_at && ` · Until ${c.expires_at}`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="redemptions" className="mt-4 space-y-2">
          {loadingRedemptions ? (
            <Skeleton className="h-40 w-full" />
          ) : redemptions.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-earth-500">No redemptions yet.</CardContent></Card>
          ) : (
            redemptions.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-1 p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{r.promo_code?.code || "—"}</span>
                    <Badge className={
                      r.payout_status === "paid"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.payout_status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                    }>{r.payout_status}</Badge>
                  </div>
                  <p className="text-xs text-earth-500">
                    {r.promo_code?.homestay?.host?.name || "—"} · {r.promo_code?.homestay?.name || "—"}
                  </p>
                  <p className="text-xs text-earth-600">
                    Discount ฿{r.discount_amount.toLocaleString()}
                    {r.commission_amount > 0 && (
                      <> · Commission ฿{r.commission_amount.toLocaleString()} → {r.promo_code?.recommender_name || "—"}</>
                    )}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load}>
          {(loadingCodes || loadingRedemptions) && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Refresh
        </Button>
      </div>
    </div>
  );
}
