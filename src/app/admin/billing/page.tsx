"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { PHONE_ACTIONS, PHONE_TAP, STICKY_END, TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { LoadError, NETWORK_ERROR, actionFailed } from "@/components/admin/load-error";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateStr } from "@/lib/format-date";
import { fmtTHB } from "@/lib/format-currency";

interface InvoiceRow {
  id: string;
  host_id: string;
  amount: number;
  period_start: string;
  period_end: string;
  status: string;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  host: { id: string; name: string; email: string } | null;
}

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  pending: Clock,
  paid: CheckCircle,
  overdue: AlertCircle,
};

const FILTERS = ["all", "pending", "paid", "overdue"];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  overdue: "Overdue",
};

export default function AdminBillingPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // The filter lives in the URL, so Back and a shared link keep it.
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("status") ?? "all";
  const [statusFilter, setStatusFilter] = useState<string>(FILTERS.includes(urlStatus) ? urlStatus : "all");
  const [confirmAction, setConfirmAction] = useState<{ invoice: InvoiceRow; status: string; hostName: string } | null>(null);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const r = await fetch(`/api/admin/invoices?${params}`);
      if (r.ok) {
        const data = await r.json();
        setInvoices(data.invoices);
        setTotal(data.total);
      }
      setLoadFailed(!r.ok);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleMarkStatus = async (invoiceId: string, status: string) => {
    setActionLoading(invoiceId);
    try {
      const r = await fetch(`/api/admin/invoices/${invoiceId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (r.ok) {
        toast.success(`Invoice marked as ${status}`);
        fetchInvoices();
      } else {
        const data = await r.json();
        toast.error(data.error || actionFailed("update the invoice"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  return (
    <div>
      <PageHeader
        subtitle={total > 0 ? `${total} invoices` : "Invoice management"}
        title="Billing"
        icon={CreditCard}
        actions={
          <Link
            href="/admin/billing/rejected"
            className="inline-flex h-11 items-center rounded-full border border-earth-200 bg-white px-4 text-sm font-medium text-earth-800 hover:border-brand/40 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10"
          >
            Rejected payments
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant="outline"
            aria-pressed={statusFilter === f}
            onClick={() => {
              setStatusFilter(f);
              setPage(1);
              router.replace(f === "all" ? "/admin/billing" : `/admin/billing?status=${f}`, { scroll: false });
            }}
            className={cn(
              "cursor-pointer rounded-full",
              PHONE_TAP,
              statusFilter === f
                ? "border-brand bg-brand-50 text-brand hover:bg-brand-50"
                : "border-earth-200 bg-white text-earth-700 hover:bg-earth-50 hover:text-brand"
            )}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton-warm h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : loadFailed ? (
        <LoadError what="invoices" onRetry={fetchInvoices} />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No invoices found"
          description={statusFilter !== "all" ? "Try a different filter to see more invoices." : "Generated invoices for hosts will appear here."}
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
                      <th scope="col" className={cn(TH, "min-w-44")}>Host</th>
                      <th scope="col" className={TH}>Period · due</th>
                      <th scope="col" className={cn(TH, "text-right")}>Amount</th>
                      <th scope="col" className={TH}>Status</th>
                      <th scope="col" className={cn(TH, "w-px text-right", STICKY_END)}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {invoices.map((inv) => {
                      const Icon = STATUS_ICONS[inv.status] || Clock;
                      const label = STATUS_LABELS[inv.status] || inv.status;
                      const hostName = inv.host?.name || "Unknown host";
                      return (
                        <tr key={inv.id} className={TR}>
                          <td className={TD_LEAD}>
                            {inv.host ? (
                              <Link
                                href={`/admin/hosts/${inv.host.id}`}
                                className="rounded font-semibold text-earth-900 underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                              >
                                {hostName}
                              </Link>
                            ) : (
                              <span className="font-semibold text-earth-900">{hostName}</span>
                            )}
                            {inv.host?.email && <p className="mt-0.5 break-all text-xs text-earth-600 max-md:hidden">{inv.host.email}</p>}
                            <p className="mt-0.5 text-xs tabular-nums text-earth-600 max-md:hidden">
                              Created {fmtDate(new Date(inv.created_at), "MMM d, yyyy", "en")}
                            </p>
                          </td>
                          <td className={cn(TD, "tabular-nums md:whitespace-nowrap")}>
                            {fmtDateStr(inv.period_start, "MMM d", "en")} → {fmtDateStr(inv.period_end, "MMM d, yyyy", "en")}
                            <p className="text-xs text-earth-600 max-md:inline max-md:before:content-['_·_']">
                              due {fmtDateStr(inv.due_date, "MMM d, yyyy", "en")}
                            </p>
                          </td>
                          <td className={cn(TD_TRAIL, "whitespace-nowrap text-right font-semibold tabular-nums text-earth-900")}>{fmtTHB(inv.amount)}</td>
                          <td className={cn(TD, "max-md:mt-1")}>
                            <StatusBadge status={inv.status} label={label} icon={<Icon className="h-3 w-3" />} />
                            {inv.paid_at && (
                              <p className="mt-1 whitespace-nowrap text-xs tabular-nums text-earth-600">
                                {fmtDate(new Date(inv.paid_at), "MMM d, yyyy · HH:mm", "en")}
                              </p>
                            )}
                          </td>
                          <td className={cn(TD, STICKY_END, inv.status === "paid" && "max-md:hidden")}>
                            <div className={cn(PHONE_ACTIONS, "md:grid")}>
                              {(inv.status === "pending" || inv.status === "overdue") && (
                                <Button
                                  size="sm"
                                  className={cn("h-9 px-3 text-xs cursor-pointer bg-brand hover:bg-brand-hover text-white max-md:text-sm", PHONE_TAP)}
                                  onClick={() => setConfirmAction({ invoice: inv, status: "paid", hostName })}
                                  disabled={actionLoading === inv.id}
                                >
                                  {actionLoading === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark Paid"}
                                </Button>
                              )}
                              {inv.status === "paid" && <span className="text-center text-earth-600"><span aria-hidden>—</span><span className="sr-only">No action</span></span>}
                              {inv.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={cn("h-9 px-3 text-xs cursor-pointer text-destructive border-destructive/30 hover:bg-destructive/5 max-md:text-sm", PHONE_TAP)}
                                  onClick={() => setConfirmAction({ invoice: inv, status: "overdue", hostName })}
                                  disabled={actionLoading === inv.id}
                                >
                                  Overdue
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between pt-2">
              <p className="text-sm text-earth-600">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className={cn("cursor-pointer border-earth-200", PHONE_TAP)} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className={cn("cursor-pointer border-earth-200", PHONE_TAP)} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Confirm Dialog ── */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {confirmAction?.status === "paid" ? "Mark as Paid" : "Mark as Overdue"}
            </DialogTitle>
            <DialogDescription>
              Mark this invoice for <strong>{confirmAction?.hostName}</strong> as {confirmAction?.status}?
            </DialogDescription>
          </DialogHeader>
          {confirmAction && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-earth-100 px-4 py-3 text-sm tabular-nums">
              <dt className="text-earth-700">Amount</dt>
              <dd className="font-semibold text-earth-900">{fmtTHB(confirmAction.invoice.amount)}</dd>
              <dt className="text-earth-700">Period</dt>
              <dd className="text-earth-900">
                {fmtDateStr(confirmAction.invoice.period_start, "MMM d", "en")} → {fmtDateStr(confirmAction.invoice.period_end, "MMM d, yyyy", "en")}
              </dd>
              <dt className="text-earth-700">Due</dt>
              <dd className="text-earth-900">{fmtDateStr(confirmAction.invoice.due_date, "MMM d, yyyy", "en")}</dd>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              onClick={() => confirmAction && handleMarkStatus(confirmAction.invoice.id, confirmAction.status)}
              disabled={actionLoading !== null}
              className={cn(
                "cursor-pointer text-white",
                confirmAction?.status === "paid"
                  ? "bg-brand hover:bg-brand-hover"
                  : "bg-destructive hover:bg-destructive/90"
              )}
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {confirmAction?.status === "paid" ? "Mark Paid" : "Mark Overdue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
