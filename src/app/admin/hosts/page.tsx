"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Users, CheckCircle, XCircle, Loader2, Mail, Phone, Home, Calendar as CalendarIcon,
  ShieldCheck, Wallet, CreditCard, Percent,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateStr } from "@/lib/format-date";
import { getPlanExpiryInfo } from "@/lib/plan-expiry";
import { fmtTHB } from "@/lib/format-currency";
import { billingToday, billingTodayStr } from "@/lib/billing-dates";
import { computeImmediateFixedRateInvoice } from "@/lib/billing-calc";
import type { PlatformBillingConfig } from "@/types/database";

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
  fixed_rate_term_months: number | null;
  fixed_rate_term_ends_at: string | null;
  homestay: { name: string; slug: string; is_active: boolean } | null;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  commission: "Commission",
  fixed_rate: "Fixed Rate",
};

/**
 * Is this host mid-term on Fixed Rate?
 *
 * Character-for-character the predicate the route uses to decide whether to
 * (re)start a term and bill for it — see the `alreadyActiveFixedRate` check in
 * api/admin/hosts/[id]/plan/route.ts, where `todayStr` is billingToday() in
 * YYYY-MM-DD, i.e. billingTodayStr(). Keeping one expression means the dialog
 * cannot offer a term the save would silently ignore. An expired or NULL term
 * is not active: the route starts a fresh one, so the picker stays open.
 */
function hasActiveTerm(host: HostRow): boolean {
  return (
    host.plan_type === "fixed_rate" &&
    !!host.fixed_rate_term_ends_at &&
    host.fixed_rate_term_ends_at >= billingTodayStr()
  );
}

const PLAN_TONES: Record<string, string> = {
  free:       "bg-earth-50 text-earth-700 border-earth-200/60",
  commission: "bg-brand-50 text-brand border-brand/15",
  fixed_rate: "bg-earth-100/60 text-earth-700 border-earth-200",
};

interface PaginatedResponse {
  data: HostRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type StatusFilter = "all" | "pending" | "approved";

type DialogState =
  | { type: "plan"; host: HostRow }
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

  const [planType, setPlanType] = useState("free");
  const [planExpiry, setPlanExpiry] = useState("");
  const [termMonths, setTermMonths] = useState<number | null>(null);
  // The term options and the monthly rate both live on the singleton billing
  // config, so the dialog offers exactly the tiers isValidTermMonths accepts
  // and exactly the tiers a host sees — edit them in Admin -> Settings.
  const [billingConfig, setBillingConfig] = useState<PlatformBillingConfig | null>(null);

  const [rateCommission, setRateCommission] = useState("");
  const [rateFixed, setRateFixed] = useState("");

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

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/billing-config");
        if (r.ok) setBillingConfig(await r.json());
      } catch {
        console.error("Failed to fetch billing config");
      }
    })();
  }, []);

  const handleFilterChange = (f: StatusFilter) => {
    setStatusFilter(f);
    setPage(1);
    const params = new URLSearchParams();
    if (f !== "all") params.set("status", f);
    router.replace(`/admin/hosts${params.toString() ? `?${params}` : ""}`);
  };

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

    setActionLoading(dialog.host.id);
    try {
      const r = await fetch(`/api/admin/hosts/${dialog.host.id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_type: planType,
          plan_free_expires_at: expiresAt,
          ...(planType === "fixed_rate" && termMonths ? { term_months: termMonths } : {}),
        }),
      });
      if (r.ok) {
        // The route skips billing for a host who is already mid-term, and skips
        // the invoice entirely when one is already open — say which happened
        // rather than a bare "Plan updated" after quoting a price.
        const d = (await r.json()) as {
          term_started?: boolean;
          invoice_created?: boolean;
          amount?: number | null;
        };
        if (planType !== "fixed_rate") {
          toast.success("Plan updated");
        } else if (!d.term_started) {
          toast.success("Plan updated — existing Fixed Rate term kept, nothing billed");
        } else if (d.invoice_created) {
          toast.success(`Plan updated — ${fmtTHB(d.amount ?? 0)} invoiced to the host`);
        } else {
          toast.success("Plan updated — term started, but no invoice: the host already has an open one");
        }
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

  const openPlanDialog = (host: HostRow) => {
    setPlanType(host.plan_type);
    setPlanExpiry(host.plan_free_expires_at ? host.plan_free_expires_at.split("T")[0] : "");
    const tiers = billingConfig?.fixed_rate_term_tiers || [];
    setTermMonths(
      host.fixed_rate_term_months &&
        tiers.some((t) => t.months === host.fixed_rate_term_months)
        ? host.fixed_rate_term_months
        : null,
    );
    setDialog({ type: "plan", host });
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

  // Fixed Rate without a term would fall through to the route's 1-month
  // default, which on any day but the 1st buys only the rest of this month —
  // so make the admin pick. A host already mid-term keeps theirs; nothing to
  // choose, nothing to block.
  const termRequired =
    dialog?.type === "plan" &&
    planType === "fixed_rate" &&
    !hasActiveTerm(dialog.host) &&
    !termMonths;

  return (
    <div>
      <PageHeader
        eyebrow={res ? `${res.total} total` : "Loading…"}
        title="Hosts"
        icon={Users}
      />

      <div className="mb-4 flex gap-2">
        {(["all", "pending", "approved"] as StatusFilter[]).map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? "default" : "outline"}
            size="sm"
            onClick={() => handleFilterChange(f)}
            className={cn(
              "cursor-pointer",
              statusFilter === f
                ? "bg-brand hover:bg-brand-hover text-white"
                : "border-earth-200 text-earth-700 hover:bg-earth-50 hover:text-brand"
            )}
          >
            {f === "all" ? "All" : f === "pending" ? "Pending" : "Approved"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton-warm h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : !res || res.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hosts found"
          description={statusFilter !== "all" ? "Try a different filter to see more hosts." : "New host signups will appear here."}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {res.data.map((host, i) => (
              <motion.div
                key={host.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
              >
                <Card className="dashboard-card border-earth-100 h-full">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="font-semibold text-earth-900 truncate">{host.name}</h3>
                          <StatusBadge status={host.status} />
                          {host.is_verified && (
                            <StatusBadge
                              status="verified"
                              tone="brand"
                              label="Verified"
                              icon={<ShieldCheck className="h-3 w-3" />}
                            />
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                              PLAN_TONES[host.plan_type] || PLAN_TONES.free
                            )}
                          >
                            {PLAN_LABELS[host.plan_type] || "Free"}
                          </span>
                          {host.plan_type === "free" && host.plan_free_expires_at && (
                            <span
                              className={cn(
                                "text-[10px]",
                                getPlanExpiryInfo(host.plan_type, host.plan_free_expires_at)
                                  .phase !== "active"
                                  ? "text-destructive font-medium"
                                  : "text-earth-500"
                              )}
                            >
                              exp {fmtDateStr(host.plan_free_expires_at, "MMM d, yyyy", "en")}
                            </span>
                          )}
                          {host.commission_pct_override != null && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] text-brand bg-brand-50">
                              {host.commission_pct_override}% override
                            </span>
                          )}
                          {host.fixed_rate_override != null && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] text-earth-700 bg-earth-50 tabular-nums">
                              {fmtTHB(host.fixed_rate_override)}/mo override
                            </span>
                          )}
                          {host.plan_type === "fixed_rate" && host.fixed_rate_term_ends_at && (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px]",
                                hasActiveTerm(host)
                                  ? "text-earth-700 bg-earth-50"
                                  : "text-destructive font-medium"
                              )}
                            >
                              {host.fixed_rate_term_months ? `${host.fixed_rate_term_months}mo · ` : ""}
                              {hasActiveTerm(host) ? "ends" : "ended"}{" "}
                              {fmtDateStr(host.fixed_rate_term_ends_at, "MMM d, yyyy", "en")}
                            </span>
                          )}
                          {host.plan_type === "commission" && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[10px] font-medium tabular-nums",
                                host.wallet_balance < 0 ? "text-destructive" : "text-earth-600"
                              )}
                            >
                              <Wallet className="h-3 w-3" />
                              {host.wallet_balance < 0 ? "-" : ""}{fmtTHB(Math.abs(host.wallet_balance))}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 text-sm text-earth-600">
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                            <span className="truncate">{host.email}</span>
                          </div>
                          {host.phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                              <span>{host.phone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Home className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                            {host.homestay ? (
                              <span className="flex items-center gap-1.5">
                                {host.homestay.name}
                                <StatusBadge
                                  status={host.homestay.is_active ? "active" : "inactive"}
                                  className="px-1.5 py-0"
                                />
                              </span>
                            ) : (
                              <span className="text-earth-400">No homestay</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-earth-500 pt-1">
                            <CalendarIcon className="h-3 w-3 shrink-0 text-earth-400" />
                            <span className="tabular-nums">Created {fmtDate(new Date(host.created_at), "MMM d, yyyy · HH:mm", "en")}</span>
                          </div>
                        </div>
                      </div>

                      {host.status === "approved" && (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5 justify-start sm:justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              "h-9 px-3 text-xs cursor-pointer",
                              host.is_verified
                                ? "text-brand border-brand/30 hover:bg-brand-50"
                                : "text-earth-700 border-earth-200 hover:bg-earth-50"
                            )}
                            onClick={() => handleVerify(host.id)}
                            disabled={actionLoading === host.id}
                          >
                            {actionLoading === host.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                            )}
                            {host.is_verified ? "Unverify" : "Verify"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 px-3 text-xs cursor-pointer text-earth-700 border-earth-200 hover:bg-earth-50 hover:text-brand"
                            onClick={() => openPlanDialog(host)}
                            disabled={actionLoading === host.id}
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1" />
                            Plan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 px-3 text-xs cursor-pointer text-earth-700 border-earth-200 hover:bg-earth-50 hover:text-brand"
                            onClick={() => openRateDialog(host)}
                            disabled={actionLoading === host.id}
                          >
                            <Percent className="h-3.5 w-3.5 mr-1" />
                            Rate
                          </Button>
                          {host.plan_type === "commission" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 px-3 text-xs cursor-pointer text-amber-700 border-amber-200 hover:bg-amber-50"
                              onClick={() => openWalletDialog(host)}
                              disabled={actionLoading === host.id}
                            >
                              <Wallet className="h-3.5 w-3.5 mr-1" />
                              Adjust
                            </Button>
                          )}
                        </div>
                      )}
                      {host.status === "pending" && (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5 justify-start sm:justify-end">
                          <Button
                            size="sm"
                            className="h-9 px-3 text-xs cursor-pointer bg-brand hover:bg-brand-hover text-white"
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
                            className="h-9 px-3 text-xs cursor-pointer text-destructive border-destructive/30 hover:bg-destructive/5"
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

      {/* ── Approve Confirmation ── */}
      <Dialog open={dialog?.type === "approve"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Approve Host</DialogTitle>
            <DialogDescription>
              Approve <strong>{dialog?.type === "approve" ? dialog.hostName : ""}</strong> to start using the platform?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={() => dialog?.type === "approve" && handleApprove(dialog.hostId)}
              disabled={actionLoading !== null}
              className="cursor-pointer bg-brand hover:bg-brand-hover text-white"
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
            <DialogTitle className="font-serif">Reject Host</DialogTitle>
            <DialogDescription>
              Reject and delete <strong>{dialog?.type === "reject" ? dialog.hostName : ""}</strong>? This will send a rejection email and permanently delete their account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Set Plan</DialogTitle>
            <DialogDescription>
              Set plan for <strong>{dialog?.type === "plan" ? dialog.host.name : ""}</strong>
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
                    onClick={() => setPlanType(pt)}
                    className={cn(
                      "cursor-pointer",
                      planType === pt
                        ? "bg-brand hover:bg-brand-hover text-white"
                        : "bg-white border border-earth-200 text-earth-700 hover:bg-earth-50"
                    )}
                  >
                    {PLAN_LABELS[pt]}
                  </Button>
                ))}
              </div>
            </div>
            {planType === "free" && (
              <div className="space-y-2">
                <Label>Free Plan Expires At</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal cursor-pointer border-earth-200"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {planExpiry
                        ? format(parseISO(planExpiry), "PPP", { locale: enUS })
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={enUS}
                      selected={planExpiry ? parseISO(planExpiry) : undefined}
                      onSelect={(date) =>
                        setPlanExpiry(date ? format(date, "yyyy-MM-dd") : "")
                      }
                    />
                  </PopoverContent>
                </Popover>
                {planExpiry && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-earth-500 px-0 h-auto cursor-pointer hover:text-brand"
                    onClick={() => setPlanExpiry("")}
                  >
                    Clear date
                  </Button>
                )}
                <p className="text-[11px] text-earth-400">Leave empty for no expiry</p>
              </div>
            )}
            {planType === "fixed_rate" && dialog?.type === "plan" && (
              <FixedRateTermField
                host={dialog.host}
                config={billingConfig}
                value={termMonths}
                onChange={setTermMonths}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={handleSetPlan}
              disabled={actionLoading !== null || termRequired}
              className="cursor-pointer bg-brand hover:bg-brand-hover text-white"
            >
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
            <DialogTitle className="font-serif">Rate Override</DialogTitle>
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
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleRateOverride} disabled={actionLoading !== null} className="cursor-pointer bg-brand hover:bg-brand-hover text-white">
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
            <DialogTitle className="font-serif">Wallet Adjustment</DialogTitle>
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
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={handleWalletAdjust}
              disabled={actionLoading !== null || !walletAmount || !walletReason.trim()}
              className="cursor-pointer bg-brand hover:bg-brand-hover text-white"
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

/**
 * Pick the Fixed Rate subscription term, with the amount the host will actually
 * be invoiced for each option.
 *
 * The options are whatever Admin -> Settings has configured — the same tiers
 * the host's own term picker shows and the same list the route validates
 * against, so a term offered here can never be one the save discards. Prices
 * come from computeImmediateFixedRateInvoice, the single function that decides
 * what a plan change costs, rather than a second formula that would drift from
 * the invoice the route writes a moment later.
 */
function FixedRateTermField({
  host,
  config,
  value,
  onChange,
}: {
  host: HostRow;
  config: PlatformBillingConfig | null;
  value: number | null;
  onChange: (months: number) => void;
}) {
  if (hasActiveTerm(host)) {
    return (
      <div className="space-y-2">
        <Label>Term</Label>
        <div className="rounded-xl border border-earth-200 bg-earth-50 px-3 py-2.5 space-y-1">
          <p className="text-xs font-medium text-earth-800">
            Active term
            {host.fixed_rate_term_months ? `: ${host.fixed_rate_term_months} months` : ""}, ends{" "}
            {fmtDateStr(host.fixed_rate_term_ends_at!, "d MMM yyyy", "en")}
          </p>
          <p className="text-[11px] text-earth-500">
            Saving keeps this term — nothing is billed and no invoice is created.
          </p>
        </div>
      </div>
    );
  }

  if (!config) {
    return <p className="text-xs text-earth-400">Loading terms…</p>;
  }

  const tiers = config.fixed_rate_term_tiers || [];
  if (tiers.length === 0) {
    return (
      <p className="text-xs text-destructive">
        No subscription terms configured — add one under Settings → Billing first.
      </p>
    );
  }

  // Bangkok calendar, never the browser's — the route anchors the same term to
  // billingToday(), and a UTC-derived date disagrees with it for the first
  // seven hours of every Thai day.
  const today = billingToday();
  const quoteFor = (months: number) =>
    computeImmediateFixedRateInvoice(
      { fixed_rate_override: host.fixed_rate_override },
      config,
      months,
      today,
    );

  const monthly = host.fixed_rate_override || config.fixed_rate_amount;
  const selected =
    value && tiers.some((t) => t.months === value) ? quoteFor(value) : null;
  const dayAfter = (date: string, offset = 1) => {
    const d = new Date(`${date}T00:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset))
      .toISOString()
      .split("T")[0];
  };
  const endOfStartMonth = (date: string) => {
    const d = new Date(`${date}T00:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().split("T")[0];
  };
  const fmt = (date: string) => fmtDateStr(date, "d MMM yyyy", "en");

  return (
    <div className="space-y-2">
      <Label>Term</Label>
      <div className="grid grid-cols-2 gap-2">
        {tiers.map((tier) => {
          const quote = quoteFor(tier.months);
          const isSelected = value === tier.months;
          return (
            <button
              key={tier.months}
              type="button"
              onClick={() => onChange(tier.months)}
              className={cn(
                "relative text-left rounded-xl border p-2.5 transition-colors cursor-pointer",
                isSelected
                  ? "border-brand bg-brand-50/60"
                  : "border-earth-200 hover:border-earth-300 hover:bg-earth-50/60",
              )}
            >
              {tier.discount_pct > 0 && (
                <span className="absolute top-1.5 right-1.5 bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded-full">
                  Save {tier.discount_pct}%
                </span>
              )}
              {/* A 1-month tier is "put this host on monthly billing", not a
                  prepaid month — it buys only the rest of the current month,
                  which is why its price looks small. */}
              <p className="text-xs font-medium text-earth-800">
                {tier.months === 1 ? "Monthly" : `${tier.months} months`}
              </p>
              <p className="text-base font-semibold tabular-nums text-earth-900 mt-0.5">
                {fmtTHB(quote.amount)}
              </p>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="rounded-xl border border-earth-200 bg-earth-50 px-3 py-2.5 space-y-1.5 text-xs">
          {selected.stub_amount > 0 && (
            <div className="flex justify-between gap-3">
              <span className="text-earth-600">
                {fmt(selected.period_start)} – {fmt(endOfStartMonth(selected.period_start))} (
                {selected.prorated_days} of {selected.days_in_month} days)
              </span>
              <span className="font-medium tabular-nums text-earth-900">{fmtTHB(selected.stub_amount)}</span>
            </div>
          )}
          {selected.term_amount > 0 && (
            <div className="flex justify-between gap-3">
              <span className="text-earth-600">
                {fmt(
                  selected.stub_amount > 0
                    ? dayAfter(endOfStartMonth(selected.period_start))
                    : selected.period_start,
                )}{" "}
                – {fmt(selected.period_end)} ({selected.term_months} months)
              </span>
              <span className="font-medium tabular-nums text-earth-900">{fmtTHB(selected.term_amount)}</span>
            </div>
          )}
          {selected.discount_pct > 0 && (
            <p className="text-brand">{selected.discount_pct}% term discount applied</p>
          )}
          <div className="flex justify-between gap-3 border-t border-earth-200 pt-1.5">
            <span className="font-medium text-earth-700">Invoiced now</span>
            <span className="font-semibold tabular-nums text-earth-900">{fmtTHB(selected.amount)}</span>
          </div>
          {monthly > 0 && (
            <p className="text-[11px] text-earth-500">
              From {fmt(dayAfter(selected.period_end))} the host is invoiced {fmtTHB(monthly)} on the 1st
              of each month.
            </p>
          )}
          <p className="text-[11px] text-earth-400">
            If the host already has an unpaid invoice, the term is still set but no new invoice is
            created.
          </p>
        </div>
      )}
    </div>
  );
}
