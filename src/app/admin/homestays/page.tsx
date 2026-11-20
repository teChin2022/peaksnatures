"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Home, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { PHONE_TAP, STICKY_END, TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { cn } from "@/lib/utils";
import { LoadError, NETWORK_ERROR, actionFailed } from "@/components/admin/load-error";
import { fmtDate } from "@/lib/format-date";

interface HomestayRow {
  id: string;
  host_id: string;
  name: string;
  slug: string;
  location: string;
  is_active: boolean;
  created_at: string;
  host: { name: string; email: string } | null;
}

interface PaginatedResponse {
  data: HomestayRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminHomestaysPage() {
  const [res, setRes] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [toggling, setToggling] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<HomestayRow | null>(null);

  const fetchHomestays = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/homestays?page=${p}&limit=20`);
      if (r.ok) setRes(await r.json());
      setLoadFailed(!r.ok);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHomestays(page);
  }, [page, fetchHomestays]);

  const handleToggle = async (homestayId: string) => {
    setToggling(homestayId);
    try {
      const r = await fetch(`/api/admin/homestays/${homestayId}/toggle`, { method: "PATCH" });
      if (r.ok) {
        const updated = await r.json();
        setRes((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: prev.data.map((h) =>
              h.id === homestayId ? { ...h, is_active: updated.is_active } : h
            ),
          };
        });
        toast.success(updated.is_active ? "Homestay is online" : "Homestay is offline");
      } else {
        toast.error(actionFailed("change the homestay"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setToggling(null);
      setConfirmOff(null);
    }
  };

  return (
    <div>
      <PageHeader
        subtitle={res ? `${res.total} total` : "Loading…"}
        title="Homestays"
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton-warm h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : loadFailed ? (
        <LoadError what="homestays" onRetry={() => fetchHomestays(page)} />
      ) : !res || res.data.length === 0 ? (
        <EmptyState
          icon={Home}
          title="No homestays found"
          description="Homestays created by approved hosts will appear here."
        />
      ) : (
        <>
          {/* Rows on phones (homestay and its switch, host, place), a table from md. */}
          <Card className={TABLE_CARD}>
            <CardContent className="p-0">
              <div className={TABLE_WRAP}>
                <table className={cn(TABLE, "md:min-w-[680px]")}>
                  <thead>
                    <tr className={TH_ROW}>
                      <th scope="col" className={cn(TH, "min-w-44")}>Homestay</th>
                      <th scope="col" className={TH}>Host</th>
                      <th scope="col" className={TH}>Location</th>
                      <th scope="col" className={cn(TH, "hidden xl:table-cell")}>Created</th>
                      <th scope="col" className={cn(TH, "w-px text-right", STICKY_END)}>Online</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {res.data.map((homestay) => (
                      <tr key={homestay.id} className={TR}>
                        <td className={TD_LEAD}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-earth-900">{homestay.name}</span>
                            <StatusBadge status={homestay.is_active ? "active" : "inactive"} />
                          </div>
                          <p className="mt-0.5 font-mono text-xs text-earth-600">/{homestay.slug}</p>
                        </td>
                        <td className={cn(TD, "max-md:mt-1")}>
                          {homestay.host ? (
                            <Link
                              href={`/admin/hosts/${homestay.host_id}`}
                              className="rounded underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                              {homestay.host.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                          {homestay.host?.email && <p className="mt-0.5 break-all text-xs text-earth-600 max-md:hidden">{homestay.host.email}</p>}
                        </td>
                        <td className={cn(TD, "max-md:text-xs max-md:text-earth-600 md:max-w-64")}>{homestay.location}</td>
                        <td className={cn(TD, "hidden whitespace-nowrap text-xs tabular-nums text-earth-600 xl:table-cell")}>
                          {fmtDate(new Date(homestay.created_at), "MMM d, yyyy · HH:mm", "en")}
                        </td>
                        <td className={cn(TD_TRAIL, STICKY_END)}>
                          {/* A label around the switch makes the whole 44px corner tappable on phones. */}
                          <label className="flex items-center justify-end gap-2 max-md:-mr-2 max-md:-mt-2.5 max-md:min-h-11 max-md:min-w-11 max-md:cursor-pointer max-md:justify-center">
                            <span className="text-xs text-earth-600 max-md:hidden" aria-hidden>{homestay.is_active ? "On" : "Off"}</span>
                            <Switch
                              checked={homestay.is_active}
                              aria-label={`${homestay.name} booking site online`}
                              // Taking a guest-facing site offline is confirmed; putting it back is one click.
                              onCheckedChange={() => (homestay.is_active ? setConfirmOff(homestay) : handleToggle(homestay.id))}
                              disabled={toggling === homestay.id}
                              className="cursor-pointer data-[state=checked]:bg-brand"
                            />
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {res.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between pt-2">
              <p className="text-sm text-earth-600">
                Page {res.page} of {res.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className={cn("cursor-pointer border-earth-200", PHONE_TAP)} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className={cn("cursor-pointer border-earth-200", PHONE_TAP)} onClick={() => setPage((p) => Math.min(res.totalPages, p + 1))} disabled={page >= res.totalPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!confirmOff} onOpenChange={(open) => { if (!open) setConfirmOff(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Take homestay offline</DialogTitle>
            <DialogDescription>
              Take <strong>{confirmOff?.name}</strong> offline? Guests can no longer open or book{" "}
              <span className="font-mono">/{confirmOff?.slug}</span> until you turn it back on. Existing bookings are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setConfirmOff(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={() => confirmOff && handleToggle(confirmOff.id)}
              disabled={toggling !== null}
            >
              {toggling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Take offline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
