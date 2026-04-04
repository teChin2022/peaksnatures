"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Users, CheckCircle, XCircle, Loader2, Mail, Phone, Home, Calendar,
  ShieldCheck, Wallet, CreditCard, Percent,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

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

// Dialog types
type DialogState =
  | { type: "plan"; hostId: string; hostName: string }
  | { type: "rate"; host: HostRow }
  | { type: "wallet"; hostId: string; hostName: string }
  | { type: "approve"; hostId: string; hostName: string }
  | { type: "reject"; hostId: string; hostName: string }
  | null;

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
  const [dialog, setDialog] = useState<DialogState>(null);

  // Plan dialog form state
  const [planType, setPlanType] = useState("free");
  const [planExpiry, setPlanExpiry] = useState("");

  // Rate override dialog form state
  const [rateCommission, setRateCommission] = useState("");
  const [rateFixed, setRateFixed] = useState("");

  // Wallet adjust dialog form state
  const [walletAmount, setWalletAmount] = useState("");
  const [walletReason, setWalletReason] = useState("");

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

  // ── Actions ──
  const handleApprove = async (hostId: string) => {
    setActionLoading(hostId);
    try {
      const r = await fetch(`/api/admin/hosts/${hostId}/approve`, { method: "PATCH" });
      if (r.ok) {
        toast.success("Host approved");
        fetchHosts(page, statusFilter);
      } else {
        const data = await r.json();
        toast.error(data.error || "Failed to approve");
      }
    } catch {
      toast.error("Failed to approve");
    } finally {
      setActionLoading(null);
      setDialog(null);
    }
  };

  const handleReject = async (hostId: string) => {
    setActionLoading(hostId);
    try {
      const r = await fetch(`/api/admin/hosts/${hostId}/reject`, { method: "DELETE" });
      if (r.ok) {
        toast.success("Host rejected");
        fetchHosts(page, statusFilter);
      } else {
        const data = await r.json();
        toast.error(data.error || "Failed to reject");
      }
    } catch {
      toast.error("Failed to reject");
    } finally {
      setActionLoading(null);
      setDialog(null);
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
            ? { ...prev, data: prev.data.map((h) => (h.id === hostId ? { ...h, is_verified } : h)) }
            : prev
        );
        toast.success(is_verified ? "Host verified" : "Verification removed");
      } else {
        const data = await r.json();
        toast.error(data.error || "Failed to update");
      }
    } catch {
      toast.error("Failed to update verification");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetPlan = async () => {
    if (!dialog || dialog.type !== "plan") return;
    if (!["free", "commission", "fixed_rate"].includes(planType)) return;

    const expiresAt = planType === "free" && planExpiry ? new Date(planExpiry).toISOString() : null;

    setActionLoading(dialog.hostId);
    try {
      const r = await fetch(`/api/admin/hosts/${dialog.hostId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_type: planType, plan_free_expires_at: expiresAt }),
      });
      if (r.ok) {
        toast.success("Plan updated");
        fetchHosts(page, statusFilter);
      } else {
        const data = await r.json();
        toast.error(data.error || "Failed to set plan");
      }
    } catch {
      toast.error("Failed to set plan");
    } finally {
      setActionLoading(null);
      setDialog(null);
    }
  };

  const handleWalletAdjust = async () => {
    if (!dialog || dialog.type !== "wallet") return;
    const amount = parseInt(walletAmount);
    if (isNaN(amount) || amount === 0) { toast.error("Invalid amount"); return; }
    if (!walletReason.trim()) { toast.error("Please enter a reason"); return; }

    setActionLoading(dialog.hostId);
    try {
      const r = await fetch(`/api/admin/hosts/${dialog.hostId}/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: walletReason }),
      });
      if (r.ok) {
        toast.success("Wallet adjusted");
        fetchHosts(page, statusFilter);
      } else {
        const data = await r.json();
        toast.error(data.error || "Failed to adjust wallet");
      }
    } catch {
      toast.error("Failed to adjust wallet");
    } finally {
      setActionLoading(null);
      setDialog(null);
    }
  };

  const handleRateOverride = async () => {
    if (!dialog || dialog.type !== "rate") return;

    const commission_pct_override = rateCommission === "" ? null : parseFloat(rateCommission);
    const fixed_rate_override = rateFixed === "" ? null : parseInt(rateFixed);

    if (commission_pct_override !== null && isNaN(commission_pct_override)) {
      toast.error("Invalid commission percentage"); return;
    }
    if (fixed_rate_override !== null && isNaN(fixed_rate_override)) {
      toast.error("Invalid fixed rate"); return;
    }

    setActionLoading(dialog.host.id);
    try {
      const r = await fetch(`/api/admin/hosts/${dialog.host.id}/rate-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commission_pct_override, fixed_rate_override }),
      });
      if (r.ok) {
        toast.success("Rate override saved");
        fetchHosts(page, statusFilter);
      } else {
        const data = await r.json();
        toast.error(data.error || "Failed to set rate override");
      }
    } catch {
      toast.error("Failed to set rate override");
    } finally {
      setActionLoading(null);
      setDialog(null);
    }
  };

  // Dialog openers (reset form state)
  const openPlanDialog = (host: HostRow) => {
    setPlanType(host.plan_type);
    setPlanExpiry(host.plan_free_expires_at ? host.plan_free_expires_at.split("T")[0] : "");
    setDialog({ type: "plan", hostId: host.id, hostName: host.name });
  };

  const openRateDialog = (host: HostRow) => {
    setRateCommission(host.commission_pct_override != null ? String(host.commission_pct_override) : "");
    setRateFixed(host.fixed_rate_override != null ? String(host.fixed_rate_override) : "");
    setDialog({ type: "rate", host });
  };

  const openWalletDialog = (host: HostRow) => {
    setWalletAmount("");
    setWalletReason("");
    setDialog({ type: "wallet", hostId: host.id, hostName: host.name });
  };

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-1">
          {res ? `${res.total} total` : "Loading..."}
        </p>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <h1 className="text-2xl font-serif text-gray-900">Hosts</h1>
        </div>
      </div>

      {/* ── Filter tabs ── */}
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

      {/* ── Content ── */}
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
            {res.data.map((host, i) => (
              <motion.div
                key={host.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
              >
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Name + badges row */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                        </div>

                        {/* Plan info row */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge className={`text-[10px] shrink-0 ${PLAN_COLORS[host.plan_type] || PLAN_COLORS.free}`}>
                            {PLAN_LABELS[host.plan_type] || "Free"}
                          </Badge>
                          {host.plan_type === "free" && host.plan_free_expires_at && (
                            <span className={`text-[10px] ${new Date(host.plan_free_expires_at) < new Date() ? "text-red-600 font-medium" : "text-gray-400"}`}>
                              exp {new Date(host.plan_free_expires_at).toLocaleDateString()}
                            </span>
                          )}
                          {host.commission_pct_override != null && (
                            <span className="text-[10px] text-violet-500 bg-violet-50 rounded px-1.5 py-0.5">
                              {host.commission_pct_override}% override
                            </span>
                          )}
                          {host.fixed_rate_override != null && (
                            <span className="text-[10px] text-blue-500 bg-blue-50 rounded px-1.5 py-0.5">
                              ฿{host.fixed_rate_override.toLocaleString()}/mo override
                            </span>
                          )}
                          {host.plan_type === "commission" && (
                            <span className={`text-[10px] font-medium ${host.wallet_balance < 0 ? "text-red-600" : "text-gray-500"}`}>
                              <Wallet className="h-3 w-3 inline mr-0.5" />
                              {host.wallet_balance < 0 ? "-" : ""}฿{Math.abs(host.wallet_balance).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {/* Contact details */}
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

                      {/* ── Action Buttons ── */}
                      {host.status === "approved" && (
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="flex items-center gap-1 flex-wrap justify-end">
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
                              onClick={() => openPlanDialog(host)}
                              disabled={actionLoading === host.id}
                            >
                              <CreditCard className="h-3 w-3 mr-0.5" />
                              Plan
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] text-blue-700 border-blue-300 hover:bg-blue-50"
                              onClick={() => openRateDialog(host)}
                              disabled={actionLoading === host.id}
                            >
                              <Percent className="h-3 w-3 mr-0.5" />
                              Rate
                            </Button>
                            {host.plan_type === "commission" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] text-amber-700 border-amber-300 hover:bg-amber-50"
                                onClick={() => openWalletDialog(host)}
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
                            onClick={() => setDialog({ type: "approve", hostId: host.id, hostName: host.name })}
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
                            onClick={() => setDialog({ type: "reject", hostId: host.id, hostName: host.name })}
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
              </motion.div>
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

      {/* ═══════════════════════════════════════
          DIALOGS
      ═════════════════════════��═════════════ */}

      {/* ── Approve Confirmation ── */}
      <Dialog open={dialog?.type === "approve"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Approve Host</DialogTitle>
            <DialogDescription>
              Approve <strong>{dialog?.type === "approve" ? dialog.hostName : ""}</strong> to start using the platform?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={() => dialog?.type === "approve" && handleApprove(dialog.hostId)}
              disabled={actionLoading !== null}
              className="bg-brand hover:bg-brand-hover text-white"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Confirmation ── */}
      <Dialog open={dialog?.type === "reject"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Host</DialogTitle>
            <DialogDescription>
              Reject and delete <strong>{dialog?.type === "reject" ? dialog.hostName : ""}</strong>? This will send a rejection email and permanently delete their account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => dialog?.type === "reject" && handleReject(dialog.hostId)}
              disabled={actionLoading !== null}
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reject & Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Set Plan Dialog ── */}
      <Dialog open={dialog?.type === "plan"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Plan</DialogTitle>
            <DialogDescription>
              Set plan for <strong>{dialog?.type === "plan" ? dialog.hostName : ""}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Plan Type</Label>
              <div className="flex gap-2">
                {(["free", "commission", "fixed_rate"] as const).map((pt) => (
                  <Button
                    key={pt}
                    type="button"
                    size="sm"
                    variant={planType === pt ? "default" : "outline"}
                    onClick={() => setPlanType(pt)}
                    className={planType === pt ? "bg-slate-800 hover:bg-slate-700" : ""}
                  >
                    {PLAN_LABELS[pt]}
                  </Button>
                ))}
              </div>
            </div>
            {planType === "free" && (
              <div className="space-y-2">
                <Label htmlFor="plan-expiry">Free Plan Expires At</Label>
                <Input
                  id="plan-expiry"
                  type="date"
                  value={planExpiry}
                  onChange={(e) => setPlanExpiry(e.target.value)}
                  placeholder="Leave empty for no expiry"
                />
                <p className="text-[11px] text-gray-400">Leave empty for no expiry</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSetPlan} disabled={actionLoading !== null} className="bg-slate-900 hover:bg-slate-800">
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rate Override Dialog ── */}
      <Dialog open={dialog?.type === "rate"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rate Override</DialogTitle>
            <DialogDescription>
              Set per-host rate for <strong>{dialog?.type === "rate" ? dialog.host.name : ""}</strong>. Leave empty to use global defaults.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rate-commission">Commission % Override</Label>
              <Input
                id="rate-commission"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={rateCommission}
                onChange={(e) => setRateCommission(e.target.value)}
                placeholder="Global default"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate-fixed">Fixed Rate Override (THB/month)</Label>
              <Input
                id="rate-fixed"
                type="number"
                min="0"
                value={rateFixed}
                onChange={(e) => setRateFixed(e.target.value)}
                placeholder="Global default"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleRateOverride} disabled={actionLoading !== null} className="bg-slate-900 hover:bg-slate-800">
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Wallet Adjust Dialog ── */}
      <Dialog open={dialog?.type === "wallet"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Wallet Adjustment</DialogTitle>
            <DialogDescription>
              Adjust wallet for <strong>{dialog?.type === "wallet" ? dialog.hostName : ""}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wallet-amount">Amount</Label>
              <Input
                id="wallet-amount"
                type="number"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
                placeholder="Positive to add, negative to deduct"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wallet-reason">Reason</Label>
              <Input
                id="wallet-reason"
                value={walletReason}
                onChange={(e) => setWalletReason(e.target.value)}
                placeholder="e.g. Manual credit adjustment"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={handleWalletAdjust}
              disabled={actionLoading !== null || !walletAmount || !walletReason.trim()}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Adjust Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
