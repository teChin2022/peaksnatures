"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Users, CheckCircle, XCircle, Loader2, Mail, Phone, Calendar as CalendarIcon,
  ShieldCheck, Wallet, CreditCard, Percent, Settings2,
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { PHONE_ACTIONS, PHONE_TAP, STICKY_END, TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { SearchBox } from "@/components/admin/search-box";
import { LoadError, NETWORK_ERROR, actionFailed } from "@/components/admin/load-error";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateStr } from "@/lib/format-date";
import { getPlanExpiryInfo } from "@/lib/plan-expiry";
import { fmtTHB } from "@/lib/format-currency";
import { billingToday, billingTodayStr } from "@/lib/billing-dates";
import { computeImmediateFixedRateInvoice, fixedRateStartDate } from "@/lib/billing-calc";
import type { PlatformBillingConfig } from "@/types/database";
import { walletAdjustment, type WalletDirection } from "./wallet-adjust";

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
  quick_commission_pct_override: number | null;
  fixed_rate_override: number | null;
  fixed_rate_term_months: number | null;
  fixed_rate_term_ends_at: string | null;
  homestay: { name: string; slug: string; is_active: boolean } | null;
  /** Booking routes would refuse this host right now (same gate). */
  blocked: boolean;
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

/** One even stack in the table, so the pinned column stays one button wide. */
const ACTIONS_LAYOUT = "grid gap-1.5";
/** In the phone Manage sheet: full-width 44px rows. */
const SHEET_ACTION = "h-11 w-full justify-start px-4 text-sm";

interface PaginatedResponse {
  data: HostRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type StatusFilter = "all" | "pending" | "approved" | "blocked";
const STATUS_FILTERS: StatusFilter[] = ["all", "pending", "approved", "blocked"];
const FILTER_LABELS: Record<StatusFilter, string> = { all: "All", pending: "Pending", approved: "Approved", blocked: "Blocked" };

type DialogState =
  | { type: "plan"; host: HostRow }
  | { type: "rate"; host: HostRow }
  | { type: "wallet"; hostId: string; hostName: string; balance: number }
  | { type: "unverify"; hostId: string; hostName: string }
  | { type: "approve"; hostId: string; hostName: string }
  | { type: "reject"; hostId: string; hostName: string }
  | null;

export default function AdminHostsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [res, setRes] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [page, setPage] = useState(1);
  // An unknown ?status falls back to All (the route answers 400 to it).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = searchParams.get("status") as StatusFilter | null;
    return s && STATUS_FILTERS.includes(s) ? s : "all";
  });
  const [query, setQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  // Phones: an approved host's actions open from one Manage button (owner, 2026-11-20).
  // The host stays set after closing, so the sheet keeps its content while it slides away.
  const [manageHost, setManageHost] = useState<HostRow | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const [planType, setPlanType] = useState("free");
  const [planExpiry, setPlanExpiry] = useState("");
  const [termMonths, setTermMonths] = useState<number | null>(null);
  // The term options and the monthly rate both live on the singleton billing
  // config, so the dialog offers exactly the tiers isValidTermMonths accepts
  // and exactly the tiers a host sees — edit them in Admin -> Settings.
  const [billingConfig, setBillingConfig] = useState<PlatformBillingConfig | null>(null);

  const [rateCommission, setRateCommission] = useState("");
  const [rateQuickCommission, setRateQuickCommission] = useState("");
  const [rateFixed, setRateFixed] = useState("");

  const [walletAmount, setWalletAmount] = useState("");
  const [walletDirection, setWalletDirection] = useState<WalletDirection>("add");
  const [walletReason, setWalletReason] = useState("");

  const fetchHosts = useCallback(async (p: number, status: StatusFilter, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (status !== "all") params.set("status", status);
      if (q) params.set("q", q);
      const r = await fetch(`/api/admin/hosts?${params}`);
      if (r.ok) setRes(await r.json());
      setLoadFailed(!r.ok);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHosts(page, statusFilter, query);
  }, [page, statusFilter, query, fetchHosts]);

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
        fetchHosts(page, statusFilter, query);
      } else {
        const data = await r.json();
        toast.error(data.error || actionFailed("approve this host"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
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
        fetchHosts(page, statusFilter, query);
      } else {
        const data = await r.json();
        toast.error(data.error || actionFailed("reject this host"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
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
        toast.error(data.error || actionFailed("change verification"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setActionLoading(null);
      setDialog(null);
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
        // A re-save on a mid-term host starts nothing and records nothing —
        // say so rather than a bare "Plan updated" after quoting a price.
        const d = (await r.json()) as {
          term_started?: boolean;
          invoice_created?: boolean;
          amount?: number | null;
        };
        if (planType !== "fixed_rate") {
          toast.success("Plan updated");
        } else if (!d.term_started) {
          toast.success("Plan updated — existing Fixed Rate term kept, nothing recorded");
        } else {
          toast.success(`Plan updated — ${fmtTHB(d.amount ?? 0)} recorded as paid`);
        }
        fetchHosts(page, statusFilter, query);
      } else {
        const data = await r.json();
        toast.error(data.error || actionFailed("save the plan"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setActionLoading(null);
      setDialog(null);
    }
  };

  const handleWalletAdjust = async () => {
    if (!dialog || dialog.type !== "wallet") return;
    const adj = walletAdjustment(dialog.balance, walletAmount, walletDirection);
    if (!adj) { toast.error("Enter a whole baht amount above zero"); return; }
    const { amount } = adj;
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
        fetchHosts(page, statusFilter, query);
      } else {
        const data = await r.json();
        toast.error(data.error || actionFailed("adjust the wallet"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setActionLoading(null);
      setDialog(null);
    }
  };

  const handleRateOverride = async () => {
    if (!dialog || dialog.type !== "rate") return;

    const commission_pct_override = rateCommission === "" ? null : parseFloat(rateCommission);
    const quick_commission_pct_override = rateQuickCommission === "" ? null : parseFloat(rateQuickCommission);
    const fixed_rate_override = rateFixed === "" ? null : parseInt(rateFixed);

    if (commission_pct_override !== null && isNaN(commission_pct_override)) {
      toast.error("Guest booking commission must be a number from 0 to 100."); return;
    }
    if (quick_commission_pct_override !== null && isNaN(quick_commission_pct_override)) {
      toast.error("Quick booking commission must be a number from 0 to 100."); return;
    }
    if (fixed_rate_override !== null && isNaN(fixed_rate_override)) {
      toast.error("Fixed rate must be a whole number of baht."); return;
    }

    setActionLoading(dialog.host.id);
    try {
      const r = await fetch(`/api/admin/hosts/${dialog.host.id}/rate-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commission_pct_override, quick_commission_pct_override, fixed_rate_override }),
      });
      if (r.ok) {
        toast.success("Rate override saved");
        fetchHosts(page, statusFilter, query);
      } else {
        const data = await r.json();
        toast.error(data.error || actionFailed("save the rate override"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
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
    setRateQuickCommission(host.quick_commission_pct_override != null ? String(host.quick_commission_pct_override) : "");
    setRateFixed(host.fixed_rate_override != null ? String(host.fixed_rate_override) : "");
    setDialog({ type: "rate", host });
  };

  const openWalletDialog = (host: HostRow) => {
    setWalletAmount("");
    setWalletReason("");
    setWalletDirection("add");
    setDialog({ type: "wallet", hostId: host.id, hostName: host.name, balance: host.wallet_balance });
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

  // The approved host's actions: stacked in the table, full width in the phone Manage sheet.
  const approvedActions = (host: HostRow, size = "h-9 px-3 text-xs") => (
    <>
      <Button
        size="sm"
        variant="outline"
        className={cn(
          size,
          "cursor-pointer",
          host.is_verified
            ? "text-earth-700 border-earth-200 hover:bg-earth-50 hover:text-brand"
            : "text-brand border-brand/30 hover:bg-brand-50"
        )}
        // Removing the badge guests see is confirmed first; granting it is one click.
        onClick={() =>
          host.is_verified
            ? setDialog({ type: "unverify", hostId: host.id, hostName: host.name })
            : handleVerify(host.id)
        }
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
        className={cn(size, "cursor-pointer text-earth-700 border-earth-200 hover:bg-earth-50 hover:text-brand")}
        onClick={() => openPlanDialog(host)}
        disabled={actionLoading === host.id}
      >
        <CreditCard className="h-3.5 w-3.5 mr-1" />
        Plan
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn(size, "cursor-pointer text-earth-700 border-earth-200 hover:bg-earth-50 hover:text-brand")}
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
          className={cn(size, "cursor-pointer text-amber-700 border-amber-200 hover:bg-amber-50")}
          onClick={() => openWalletDialog(host)}
          disabled={actionLoading === host.id}
        >
          <Wallet className="h-3.5 w-3.5 mr-1" />
          Adjust
        </Button>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        subtitle={res ? `${res.total} total` : "Loading…"}
        title="Hosts"
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchBox
        value={query}
        onSearch={(q) => { setQuery(q); setPage(1); }}
        label="Search hosts by name, phone or email"
        placeholder="Name, phone or email"
      />
      <div className="flex flex-wrap gap-2 sm:order-first">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f}
            variant="outline"
            size="sm"
            aria-pressed={statusFilter === f}
            onClick={() => handleFilterChange(f)}
            className={cn(
              "cursor-pointer rounded-full",
              PHONE_TAP,
              statusFilter === f
                ? "border-brand bg-brand-50 text-brand hover:bg-brand-50"
                : "border-earth-200 bg-white text-earth-700 hover:bg-earth-50 hover:text-brand"
            )}
          >
            {FILTER_LABELS[f]}
          </Button>
        ))}
      </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton-warm h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : loadFailed ? (
        <LoadError what="hosts" onRetry={() => fetchHosts(page, statusFilter, query)} />
      ) : !res || res.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hosts found"
          description={
            statusFilter === "blocked" && !query
              ? "Every approved host can take bookings."
              : query || statusFilter !== "all"
                ? "Nothing matches this search and filter."
                : "New host signups will appear here."
          }
        />
      ) : (
        <>
          {/* Rows on phones, a table from md (owner, 2026-11-20); one markup for both. */}
          <Card className={TABLE_CARD}>
            <CardContent className="p-0">
              <div className={TABLE_WRAP}>
                <table className={cn(TABLE, "md:min-w-[680px]")}>
                  <thead>
                    <tr className={TH_ROW}>
                      <th scope="col" className={cn(TH, "min-w-52")}>Host</th>
                      <th scope="col" className={TH}>Homestay</th>
                      <th scope="col" className={TH}>Plan</th>
                      <th scope="col" className={cn(TH, "hidden xl:table-cell")}>Joined</th>
                      <th scope="col" className={cn(TH, "w-px text-right", STICKY_END)}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {res.data.map((host) => (
                      <tr key={host.id} className={TR}>
                        <td className={TD_LEAD}>
                          <Link
                            href={`/admin/hosts/${host.id}`}
                            className="rounded font-semibold text-earth-900 underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {host.name}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <StatusBadge status={host.status} />
                              {host.is_verified && (
                                <StatusBadge
                                  status="verified"
                                  tone="brand"
                                  label="Verified"
                                  icon={<ShieldCheck className="h-3 w-3" />}
                                />
                              )}
                            {host.blocked && <StatusBadge status="blocked" tone="destructive" label="Bookings blocked" />}
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-earth-600">
                            <Mail className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                            {/* Phones: one line, not an address broken mid-word. */}
                            <span className="min-w-0 truncate md:whitespace-normal md:break-all" title={host.email}>{host.email}</span>
                          </p>
                          {host.phone && (
                            <p className="flex items-center gap-1.5 text-earth-600">
                              <Phone className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                              {host.phone}
                            </p>
                          )}
                        </td>
                        <td className={cn(TD, "max-md:mt-1")}>
                        {host.homestay ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            {host.homestay.name}
                            <StatusBadge
                              status={host.homestay.is_active ? "active" : "inactive"}
                              className="px-1.5 py-0"
                            />
                          </span>
                        ) : (
                          <span className="text-earth-600">No homestay</span>
                        )}
                        </td>
                        <td className={TD}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                              PLAN_TONES[host.plan_type] || PLAN_TONES.free
                            )}
                          >
                            {PLAN_LABELS[host.plan_type] || "Free"}
                          </span>
                          {host.plan_type === "free" && host.plan_free_expires_at && (
                            <span
                              className={cn(
                                "text-xs",
                                getPlanExpiryInfo(host.plan_type, host.plan_free_expires_at)
                                  .phase !== "active"
                                  ? "text-destructive font-medium"
                                  : "text-earth-600"
                              )}
                            >
                              exp {fmtDateStr(host.plan_free_expires_at, "MMM d, yyyy", "en")}
                            </span>
                          )}
                          {host.commission_pct_override != null && (
                            <span className="rounded-full px-2 py-0.5 text-xs text-brand bg-brand-50">
                              {host.commission_pct_override}% guest override
                            </span>
                          )}
                          {host.quick_commission_pct_override != null && (
                            <span className="rounded-full px-2 py-0.5 text-xs text-brand bg-brand-50">
                              {host.quick_commission_pct_override}% quick override
                            </span>
                          )}
                          {host.fixed_rate_override != null && (
                            <span className="rounded-full px-2 py-0.5 text-xs text-earth-700 bg-earth-50 tabular-nums">
                              {fmtTHB(host.fixed_rate_override)}/mo override
                            </span>
                          )}
                          {host.plan_type === "fixed_rate" && host.fixed_rate_term_ends_at && (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs",
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
                                "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
                                host.wallet_balance < 0 ? "text-destructive" : "text-earth-600"
                              )}
                            >
                              <Wallet className="h-3 w-3" />
                              {host.wallet_balance < 0 ? "-" : ""}{fmtTHB(Math.abs(host.wallet_balance))}
                            </span>
                          )}
                        </div>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-xs tabular-nums text-earth-600 xl:table-cell">
                          {fmtDate(new Date(host.created_at), "MMM d, yyyy · HH:mm", "en")}
                        </td>
                        <td className={cn(host.status === "approved" ? TD_TRAIL : TD, STICKY_END)}>
                          {host.status === "approved" && (
                            <>
                              <Button
                                variant="outline"
                                className={cn("cursor-pointer border-earth-200 text-earth-800 hover:bg-earth-50 hover:text-brand md:hidden", PHONE_TAP)}
                                onClick={() => {
                                  setManageHost(host);
                                  setManageOpen(true);
                                }}
                                aria-label={`Manage ${host.name}`}
                              >
                                <Settings2 className="h-4 w-4" />
                                Manage
                              </Button>
                              <div className={cn(ACTIONS_LAYOUT, "max-md:hidden")}>{approvedActions(host)}</div>
                            </>
                          )}
                          {host.status === "pending" && (
                            <div className={cn(PHONE_ACTIONS, "md:grid")}>
                              <Button
                                size="sm"
                                className={cn("h-9 px-3 text-xs cursor-pointer bg-brand hover:bg-brand-hover text-white max-md:text-sm", PHONE_TAP)}
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
                                className={cn("h-9 px-3 text-xs cursor-pointer text-destructive border-destructive/30 hover:bg-destructive/5 max-md:text-sm", PHONE_TAP)}
                                onClick={() => setDialog({ type: "reject", hostId: host.id, hostName: host.name })}
                                disabled={actionLoading === host.id}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
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

      {/* ── Phone Manage sheet: the table's buttons; a tap runs the action, then closes the sheet ── */}
      <Sheet open={manageOpen} onOpenChange={setManageOpen}>
        <SheetContent
          side="bottom"
          className="gap-0 rounded-t-2xl border-earth-100 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <SheetHeader className="pb-2">
            <SheetTitle className="font-serif text-earth-900">{manageHost?.name}</SheetTitle>
            <SheetDescription className="text-earth-600">
              {manageHost ? PLAN_LABELS[manageHost.plan_type] || "Free" : ""}
              {manageHost?.plan_type === "commission" ? ` · wallet ${fmtTHB(manageHost.wallet_balance)}` : ""}
            </SheetDescription>
          </SheetHeader>
          {manageHost && (
            // Closed on bubble, after the tapped button's own handler has run.
            <div className="grid gap-2 px-4" onClick={() => setManageOpen(false)}>
              {approvedActions(manageHost, SHEET_ACTION)}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Unverify Confirmation ── */}
      <Dialog open={dialog?.type === "unverify"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Remove verification</DialogTitle>
            <DialogDescription>
              Remove the verified badge from <strong>{dialog?.type === "unverify" ? dialog.hostName : ""}</strong>? Guests stop seeing it on their booking page. You can verify them again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={() => dialog?.type === "unverify" && handleVerify(dialog.hostId)}
              disabled={actionLoading !== null}
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Remove verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        {/* Fixed Rate adds the term grid and breakdown: on a short phone the dialog scrolls inside the screen. */}
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
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
                    aria-pressed={planType === pt}
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
                    className="text-xs text-earth-600 px-0 h-auto cursor-pointer hover:text-brand"
                    onClick={() => setPlanExpiry("")}
                  >
                    Clear date
                  </Button>
                )}
                <p className="text-xs text-earth-600">Leave empty for no expiry</p>
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
              <Label htmlFor="rate-commission">Guest Booking Commission % Override</Label>
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
              <Label htmlFor="rate-quick-commission">Quick Booking Commission % Override</Label>
              <Input
                id="rate-quick-commission"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={rateQuickCommission}
                onChange={(e) => setRateQuickCommission(e.target.value)}
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
              <Label id="wallet-direction-label">Direction</Label>
              <div role="radiogroup" aria-labelledby="wallet-direction-label" className="grid grid-cols-2 gap-2">
                {(["add", "deduct"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={walletDirection === d}
                    onClick={() => setWalletDirection(d)}
                    className={cn(
                      "h-10 rounded-full border text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                      walletDirection === d
                        ? "border-brand bg-brand-50 text-brand"
                        : "border-earth-200 bg-white text-earth-700 hover:bg-earth-50",
                    )}
                  >
                    {d === "add" ? "Add credit" : "Deduct"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wallet-amount">Amount (THB)</Label>
              <Input
                id="wallet-amount"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
                placeholder="e.g. 500"
                aria-describedby="wallet-preview"
              />
              {dialog?.type === "wallet" && (
                <WalletPreview balance={dialog.balance} adj={walletAdjustment(dialog.balance, walletAmount, walletDirection)} />
              )}
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
              disabled={
                actionLoading !== null ||
                dialog?.type !== "wallet" ||
                !walletAdjustment(dialog.balance, walletAmount, walletDirection) ||
                !walletReason.trim()
              }
              className="cursor-pointer bg-brand hover:bg-brand-hover text-white"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {walletDirection === "deduct" ? "Deduct from wallet" : "Add to wallet"}
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
          <p className="text-xs text-earth-600">
            Saving keeps this term — nothing is billed and no invoice is created.
          </p>
        </div>
      </div>
    );
  }

  if (!config) {
    return <p className="text-xs text-earth-600">Loading terms…</p>;
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
      // The route prices a lapsed Fixed Rate host from the 1st; quote the same.
      fixedRateStartDate(host, today),
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
                <span className="absolute top-1.5 right-1.5 bg-amber-50 text-amber-700 text-xs font-medium py-0.5 px-2 rounded-full">
                  Save {tier.discount_pct}%
                </span>
              )}
              {/* A 1-month tier is "put this host on monthly billing", not a
                  prepaid month — for a host new to Fixed Rate it buys only the
                  rest of the current month, which is why its price can look
                  small. A lapsed Fixed Rate host pays the whole month. */}
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
            <span className="font-medium text-earth-700">Recorded as paid</span>
            <span className="font-semibold tabular-nums text-earth-900">{fmtTHB(selected.amount)}</span>
          </div>
          {monthly > 0 && (
            <p className="text-xs text-earth-600">
              From {fmt(dayAfter(selected.period_end))} the host is invoiced {fmtTHB(monthly)} on the 1st
              of each month.
            </p>
          )}
          <p className="text-xs text-earth-600">
            Saved as a paid invoice — the host is not billed for this and is never blocked over it.
            Any unrelated unpaid invoice they have stays open.
          </p>
        </div>
      )}
    </div>
  );
}

function WalletPreview({ balance, adj }: { balance: number; adj: { after: number } | null }) {
  const money = (n: number) => `${n < 0 ? "-" : ""}${fmtTHB(Math.abs(n))}`;
  return (
    <p id="wallet-preview" className="text-xs text-earth-600 tabular-nums" aria-live="polite">
      Balance {money(balance)}
      {adj && (
        <>
          {" "}→ <span className={cn("font-semibold", adj.after < 0 ? "text-destructive" : "text-earth-900")}>{money(adj.after)}</span>
        </>
      )}
    </p>
  );
}
