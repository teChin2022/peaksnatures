"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface HostRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
  homestay: { name: string; slug: string; is_active: boolean } | null;
}

interface PaginatedResponse {
  data: HostRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminHostsPage() {
  const [res, setRes] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchHosts = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/hosts?page=${p}&limit=20`);
      if (r.ok) setRes(await r.json());
    } catch (err) {
      console.error("Failed to fetch hosts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHosts(page);
  }, [page, fetchHosts]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-blue-100 p-2">
          <Users className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Hosts</h1>
          <p className="text-sm text-gray-500">{res ? `${res.total} total` : "Loading..."}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Hosts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !res || res.data.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No hosts found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-3 pr-4 font-medium">Name</th>
                      <th className="pb-3 pr-4 font-medium">Email</th>
                      <th className="pb-3 pr-4 font-medium">Phone</th>
                      <th className="pb-3 pr-4 font-medium">Homestay</th>
                      <th className="pb-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.map((host) => (
                      <tr key={host.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{host.name}</td>
                        <td className="py-3 pr-4 text-gray-600">{host.email}</td>
                        <td className="py-3 pr-4 text-gray-600">{host.phone || "—"}</td>
                        <td className="py-3 pr-4">
                          {host.homestay ? (
                            <div className="flex items-center gap-2">
                              <span>{host.homestay.name}</span>
                              <Badge variant={host.homestay.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                                {host.homestay.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-gray-400">No homestay</span>
                          )}
                        </td>
                        <td className="py-3 text-gray-500">
                          {new Date(host.created_at).toLocaleDateString()}
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
