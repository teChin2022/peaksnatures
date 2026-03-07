"use client";

import { useState, useEffect, useCallback } from "react";
import { Home, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

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
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-purple-100 p-2">
          <Home className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Homestays</h1>
          <p className="text-sm text-gray-500">{res ? `${res.total} total` : "Loading..."}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Homestays</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !res || res.data.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No homestays found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-3 pr-4 font-medium">Name</th>
                      <th className="pb-3 pr-4 font-medium">Slug</th>
                      <th className="pb-3 pr-4 font-medium">Host</th>
                      <th className="pb-3 pr-4 font-medium">Location</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 font-medium">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.map((homestay) => (
                      <tr key={homestay.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{homestay.name}</td>
                        <td className="py-3 pr-4 text-gray-500 font-mono text-xs">/{homestay.slug}</td>
                        <td className="py-3 pr-4 text-gray-600">
                          {homestay.host?.name || "—"}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 max-w-[200px] truncate">
                          {homestay.location}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={homestay.is_active ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {homestay.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Switch
                            checked={homestay.is_active}
                            onCheckedChange={() => handleToggle(homestay.id)}
                            disabled={toggling === homestay.id}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {res.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-gray-500">
                    Page {res.page} of {res.totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(res.totalPages, p + 1))}
                      disabled={page >= res.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
