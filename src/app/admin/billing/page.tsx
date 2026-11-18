"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
import { STICKY_END, TD, TH, TH_ROW } from "@/components/admin/table-classes";
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [confirmAction, setConfirmAction] = useState<{ invoiceId: string; status: string; hostName: string } | null>(null);

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
            className="rounded-md border border-earth-200 bg-white px-3 py-2 text-sm text-earth-700 hover:border-brand/40 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Rejected payments
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "pending", "paid", "overdue"].map((f) => (
          <Button
            key={f}
            size="sm"
            variant="outline"
            aria-pressed={statusFilter === f}
            onClick={() => { setStatusFilter(f); setPage(1); }}
            className={cn(
              "cursor-pointer rounded-full",
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
          {/* A table scans faster than cards for staff working a list (audit X3). */}
          <Card className="overflow-hidden border-earth-100 bg-white py-0">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className={TH_ROW}>
                      <th scope="col" className={cn(TH, "min-w-48")}>Host</th>
                      <th scope="col" className={TH}>Period</th>
                      <th scope="col" className={TH}>Due</th>
                      <th scope="col" className={cn(TH, "text-right")}>Amount</th>
                      <th scope="col" className={TH}>Status</th>
                      <th scope="col" className={cn(TH, "w-px text-right", STICKY_END)}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-earth-100 text-earth-800">
                    {invoices.map((inv) => {
                      const Icon = STATUS_ICONS[inv.status] || Clock;
                      const label = STATUS_LABELS[inv.status] || inv.status;
                      const hostName = inv.host?.name || "Unknown host";
                      return (
                        <tr key={inv.id} className="align-top">
                          <td className={TD}>
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
                            {inv.host?.email && <p className="mt-0.5 break-all text-xs text-earth-600">{inv.host.email}</p>}
                            <p className="mt-0.5 text-xs tabular-nums text-earth-600">
                              Created {fmtDate(new Date(inv.created_at), "MMM d, yyyy", "en")}
                            </p>
                          </td>
                          <td className={cn(TD, "whitespace-nowrap tabular-nums")}>
                            {fmtDateStr(inv.period_start, "MMM d", "en")} → {fmtDateStr(inv.period_end, "MMM d, yyyy", "en")}
                          </td>
                          <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{fmtDateStr(inv.due_date, "MMM d, yyyy", "en")}</td>
                          <td className={cn(TD, "whitespace-nowrap text-right font-semibold tabular-nums text-earth-900")}>{fmtTHB(inv.amount)}</td>
                          <td className={TD}>
                            <StatusBadge status={inv.status} label={label} icon={<Icon className="h-3 w-3" />} />
                            {inv.paid_at && (
                              <p className="mt-1 whitespace-nowrap text-xs tabular-nums text-earth-600">
                                {fmtDate(new Date(inv.paid_at), "MMM d, yyyy · HH:mm", "en")}
                              </p>
                            )}
                          </td>
                          <td className={cn(TD, STICKY_END)}>
                            <div className="grid gap-1.5">
                              {(inv.status === "pending" || inv.status === "overdue") && (
                                <Button
                                  size="sm"
                                  className="h-9 px-3 text-xs cursor-pointer bg-brand hover:bg-brand-hover text-white"
                                  onClick={() => setConfirmAction({ invoiceId: inv.id, status: "paid", hostName })}
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
                                  className="h-9 px-3 text-xs cursor-pointer text-destructive border-destructive/30 hover:bg-destructive/5"
                                  onClick={() => setConfirmAction({ invoiceId: inv.id, status: "overdue", hostName })}
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
                <Button variant="outline" size="sm" className="cursor-pointer border-earth-200" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className="cursor-pointer border-earth-200" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
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
              Mark invoice for <strong>{confirmAction?.hostName}</strong> as {confirmAction?.status}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer border-earth-200" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              onClick={() => confirmAction && handleMarkStatus(confirmAction.invoiceId, confirmAction.status)}
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
