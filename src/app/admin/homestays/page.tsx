"use client";

import { useState, useEffect, useCallback } from "react";
import { Home, MapPin, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";

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
      }
    } catch (err) {
      console.error("Failed to toggle homestay:", err);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={res ? `${res.total} total` : "Loading…"}
        title="Homestays"
        icon={Home}
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-warm h-24 w-full rounded-xl" />
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
          <div className="space-y-3">
            {res.data.map((homestay) => (
              <Card key={homestay.id} className="dashboard-card border-earth-100">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-earth-900 truncate">{homestay.name}</h3>
                        <StatusBadge status={homestay.is_active ? "active" : "inactive"} />
                      </div>
                      <p className="text-xs text-earth-400 font-mono mb-1.5">/{homestay.slug}</p>
                      <div className="space-y-1 text-sm text-earth-600">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                          <span className="truncate">{homestay.host?.name || "—"}</span>
                          {homestay.host?.email && (
                            <span className="text-xs text-earth-400 truncate">({homestay.host.email})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                          <span className="truncate">{homestay.location}</span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-xs text-earth-500">{homestay.is_active ? "On" : "Off"}</span>
                      <Switch
                        checked={homestay.is_active}
                        onCheckedChange={() => handleToggle(homestay.id)}
                        disabled={toggling === homestay.id}
                        className="cursor-pointer data-[state=checked]:bg-brand"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {res.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between pt-2">
              <p className="text-sm text-earth-500">
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
    </div>
  );
}
