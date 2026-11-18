"use client";

import { useState, useEffect, useCallback } from "react";
import { Home, MapPin, User, Mail, Clock, Loader2 } from "lucide-react";
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
  const [page, setPage] = useState(1);
  const [toggling, setToggling] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<HomestayRow | null>(null);

  const fetchHomestays = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/homestays?page=${p}&limit=20`);
      if (r.ok) setRes(await r.json());
    } catch (err) {
      console.error("Failed to fetch homestays:", err);
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
        toast.error("Couldn't change the homestay. Reload and try again.");
      }
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
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
        icon={Home}
      />

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton-warm h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : !res || res.data.length === 0 ? (
        <EmptyState
          icon={Home}
          title="No homestays found"
          description="Homestays created by approved hosts will appear here."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {res.data.map((homestay) => (
              <Card key={homestay.id} className="dashboard-card border-earth-100 h-full">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-earth-900 truncate">{homestay.name}</h2>
                        <StatusBadge status={homestay.is_active ? "active" : "inactive"} />
                      </div>
                      <p className="mt-0.5 text-xs text-earth-600 font-mono">/{homestay.slug}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-xs text-earth-600" aria-hidden>{homestay.is_active ? "On" : "Off"}</span>
                      <Switch
                        checked={homestay.is_active}
                        aria-label={`${homestay.name} booking site online`}
                        // Taking a guest-facing site offline is confirmed; putting it back is one click.
                        onCheckedChange={() => (homestay.is_active ? setConfirmOff(homestay) : handleToggle(homestay.id))}
                        disabled={toggling === homestay.id}
                        className="cursor-pointer data-[state=checked]:bg-brand"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-earth-700">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                      <span className="truncate">{homestay.host?.name || "—"}</span>
                    </div>
                    {homestay.host?.email && (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                        <span className="truncate text-earth-600">{homestay.host.email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 min-w-0 sm:col-span-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                      <span className="truncate">{homestay.location}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-earth-100/70 text-xs text-earth-600 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">Created {fmtDate(new Date(homestay.created_at), "MMM d, yyyy · HH:mm", "en")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {res.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between pt-2">
              <p className="text-sm text-earth-600">
                Page {res.page} of {res.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="cursor-pointer border-earth-200" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className="cursor-pointer border-earth-200" onClick={() => setPage((p) => Math.min(res.totalPages, p + 1))} disabled={page >= res.totalPages}>
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
