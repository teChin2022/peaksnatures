"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Users, CheckCircle, XCircle, Loader2, Mail, Phone, Home, Calendar, ShieldCheck, Wallet, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  is_verified: boolean;
  created_at: string;
  plan_type: string;
  wallet_balance: number;
  plan_free_expires_at: string | null;
  commission_pct_override: number | null;
  fixed_rate_override: number | null;
  homestay: { name: string; slug: string; is_active: boolean } | null;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  commission: "Commission",
  fixed_rate: "Fixed Rate",
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-700",
  commission: "bg-violet-100 text-violet-700",
  fixed_rate: "bg-blue-100 text-blue-700",
};

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

  const handleVerify = async (hostId: string) => {
    setActionLoading(hostId);
    try {
      const r = await fetch(`/api/admin/hosts/${hostId}/verify`, { method: "PATCH" });
      if (r.ok) {
        const { is_verified } = await r.json();
        setRes((prev) =>
          prev
            ? {
                ...prev,
                data: prev.data.map((h) =>
                  h.id === hostId ? { ...h, is_verified } : h
                ),
              }
            : prev
        );
      } else {
        const data = await r.json();
        alert(data.error || "Failed to update verification");
      }
    } catch {
      alert("Failed to update verification");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetPlan = async (hostId: string) => {
    const planType = prompt("Set plan type (free, commission, fixed_rate):", "free");
    if (!planType || !["free", "commission", "fixed_rate"].includes(planType)) return;

    let expiresAt: string | null = null;
    if (planType === "free") {
      const dateStr = prompt("Free plan expires at (YYYY-MM-DD, or leave empty for no expiry):");
      if (dateStr) expiresAt = new Date(dateStr).toISOString();
    }

    setActionLoading(hostId);
    try {
      const r = await fetch(`/api/admin/hosts/${hostId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_type: planType, plan_free_expires_at: expiresAt }),
      });
      if (r.ok) {
        fetchHosts(page, statusFilter);
      } else {
        const data = await r.json();
        alert(data.error || "Failed to set plan");
      }
    } catch {
      alert("Failed to set plan");
    } finally {
      setActionLoading(null);
    }
  };

  const handleWalletAdjust = async (hostId: string) => {
    const amountStr = prompt("Adjustment amount (positive to add, negative to deduct):");
    if (!amountStr) return;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount === 0) { alert("Invalid amount"); return; }

    const reason = prompt("Reason for adjustment:");
    if (!reason) return;

    setActionLoading(hostId);
    try {
      const r = await fetch(`/api/admin/hosts/${hostId}/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason }),
      });
      if (r.ok) {
        fetchHosts(page, statusFilter);
      } else {
        const data = await r.json();
        alert(data.error || "Failed to adjust wallet");
      }
    } catch {
      alert("Failed to adjust wallet");
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

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : !res || res.data.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">No hosts found.</p>
      ) : (
        <>
          <div className="space-y-3">
            {res.data.map((host) => (
              <Card key={host.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{host.name}</h3>
                        <Badge
                          className={`text-[10px] shrink-0 ${
                            host.status === "approved"
                              ? "bg-brand-50 text-brand"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {host.status}
                        </Badge>
                        {host.is_verified && (
                          <Badge className="text-[10px] shrink-0 bg-emerald-100 text-emerald-700">
                            <ShieldCheck className="h-3 w-3 mr-0.5" />
                            Verified
                          </Badge>
                        )}
                        <Badge className={`text-[10px] shrink-0 ${PLAN_COLORS[host.plan_type] || PLAN_COLORS.free}`}>
                          {PLAN_LABELS[host.plan_type] || "Free"}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{host.email}</span>
                        </div>
                        {host.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span>{host.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Home className="h-3.5 w-3.5 shrink-0" />
                          {host.homestay ? (
                            <span className="flex items-center gap-1.5">
                              {host.homestay.name}
                              <Badge variant={host.homestay.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                                {host.homestay.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </span>
                          ) : (
                            <span className="text-gray-400">No homestay</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>{new Date(host.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    {host.status === "approved" && (
                      <div className="flex flex-col items-end gap-1.5 shrink-0 mr-1.5">
                        {host.plan_type === "commission" && (
                          <span className={`text-xs font-medium ${host.wallet_balance < 0 ? "text-red-600" : "text-gray-600"}`}>
                            <Wallet className="h-3 w-3 inline mr-0.5" />
                            {host.wallet_balance < 0 ? "-" : ""}฿{Math.abs(host.wallet_balance).toLocaleString()}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-7 px-2 text-[11px] ${
                              host.is_verified
                                ? "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                : "text-gray-600 border-gray-300 hover:bg-gray-50"
                            }`}
                            onClick={() => handleVerify(host.id)}
                            disabled={actionLoading === host.id}
                          >
                            {actionLoading === host.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3 w-3 mr-0.5" />
                            )}
                            {host.is_verified ? "Unverify" : "Verify"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] text-violet-700 border-violet-300 hover:bg-violet-50"
                            onClick={() => handleSetPlan(host.id)}
                            disabled={actionLoading === host.id}
                          >
                            <CreditCard className="h-3 w-3 mr-0.5" />
                            Plan
                          </Button>
                          {host.plan_type === "commission" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] text-amber-700 border-amber-300 hover:bg-amber-50"
                              onClick={() => handleWalletAdjust(host.id)}
                              disabled={actionLoading === host.id}
                            >
                              <Wallet className="h-3 w-3 mr-0.5" />
                              Adjust
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    {host.status === "pending" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-xs text-brand border-brand/30 hover:bg-brand-50"
                          onClick={() => handleApprove(host.id)}
                          disabled={actionLoading === host.id}
                        >
                          {actionLoading === host.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-xs text-red-700 border-red-300 hover:bg-red-50"
                          onClick={() => handleReject(host.id)}
                          disabled={actionLoading === host.id}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {res.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between pt-2">
              <p className="text-sm text-gray-500">
                Page {res.page} of {res.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(res.totalPages, p + 1))} disabled={page >= res.totalPages}>
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
