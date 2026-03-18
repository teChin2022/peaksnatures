"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Users, ChevronLeft, ChevronRight, CheckCircle, XCircle, Loader2 } from "lucide-react";
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
  status: string;
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

type StatusFilter = "all" | "pending" | "approved";

export default function AdminHostsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [res, setRes] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (searchParams.get("status") as StatusFilter) || "all"
  );
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchHosts = useCallback(async (p: number, status: StatusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (status !== "all") params.set("status", status);
      const r = await fetch(`/api/admin/hosts?${params}`);
      if (r.ok) setRes(await r.json());
    } catch (err) {
      console.error("Failed to fetch hosts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHosts(page, statusFilter);
  }, [page, statusFilter, fetchHosts]);

  const handleFilterChange = (f: StatusFilter) => {
    setStatusFilter(f);
    setPage(1);
    const params = new URLSearchParams();
    if (f !== "all") params.set("status", f);
    router.replace(`/admin/hosts${params.toString() ? `?${params}` : ""}`);
  };

  const handleApprove = async (hostId: string) => {
    if (!confirm("Approve this host?")) return;
    setActionLoading(hostId);
    try {
      const r = await fetch(`/api/admin/hosts/${hostId}/approve`, { method: "PATCH" });
      if (r.ok) {
        fetchHosts(page, statusFilter);
      } else {
        const data = await r.json();
        alert(data.error || "Failed to approve");
      }
    } catch {
      alert("Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (hostId: string) => {
    if (!confirm("Reject and delete this host? This will send a rejection email and permanently delete their account.")) return;
    setActionLoading(hostId);
    try {
      const r = await fetch(`/api/admin/hosts/${hostId}/reject`, { method: "DELETE" });
      if (r.ok) {
        fetchHosts(page, statusFilter);
      } else {
        const data = await r.json();
        alert(data.error || "Failed to reject");
      }
    } catch {
      alert("Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

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

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        {(["all", "pending", "approved"] as StatusFilter[]).map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? "default" : "outline"}
            size="sm"
            onClick={() => handleFilterChange(f)}
            className={statusFilter === f ? "bg-slate-800 hover:bg-slate-700" : ""}
          >
            {f === "all" ? "All" : f === "pending" ? "Pending" : "Approved"}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {statusFilter === "all" ? "All Hosts" : statusFilter === "pending" ? "Pending Hosts" : "Approved Hosts"}
          </CardTitle>
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
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">Homestay</th>
                      <th className="pb-3 pr-4 font-medium">Created</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.map((host) => (
                      <tr key={host.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{host.name}</td>
                        <td className="py-3 pr-4 text-gray-600">{host.email}</td>
                        <td className="py-3 pr-4 text-gray-600">{host.phone || "—"}</td>
                        <td className="py-3 pr-4">
                          <Badge
                            className={`text-[10px] ${
                              host.status === "approved"
                                ? "bg-brand-50 text-brand"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {host.status}
                          </Badge>
                        </td>
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
                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                          {new Date(host.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          {host.status === "pending" ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-brand border-brand/30 hover:bg-brand-50"
                                onClick={() => handleApprove(host.id)}
                                disabled={actionLoading === host.id}
                              >
                                {actionLoading === host.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-red-700 border-red-300 hover:bg-red-50"
                                onClick={() => handleReject(host.id)}
                                disabled={actionLoading === host.id}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
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
