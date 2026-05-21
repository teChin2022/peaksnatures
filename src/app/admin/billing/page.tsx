"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CreditCard, Loader2, CheckCircle, AlertCircle, Clock, CalendarRange, CalendarClock, Wallet, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
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
    } catch {
      console.error("Failed to fetch invoices");
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
        toast.error(data.error || "Failed to update");
      }
    } catch {
      toast.error("Failed to update invoice");
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={total > 0 ? `${total} invoices` : "Invoice management"}
        title="Billing"
        icon={CreditCard}
      />

      <div className="mb-4 flex gap-2">
        {["all", "pending", "paid", "overdue"].map((f) => (
          <Button
            key={f}
            size="sm"
            onClick={() => { setStatusFilter(f); setPage(1); }}
            className={cn(
              "cursor-pointer",
              statusFilter === f
                ? "bg-brand hover:bg-brand-hover text-white"
                : "bg-white border border-earth-200 text-earth-700 hover:bg-earth-50 hover:text-brand"
            )}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-warm h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No invoices found"
          description={statusFilter !== "all" ? "Try a different filter to see more invoices." : "Generated invoices for hosts will appear here."}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {invoices.map((inv, i) => {
              const Icon = STATUS_ICONS[inv.status] || Clock;
              const label = STATUS_LABELS[inv.status] || inv.status;
              return (
                <motion.div
                  key={inv.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                >
                  <Card className="dashboard-card border-earth-100 h-full">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-earth-900 truncate">
                              {inv.host?.name || "Unknown Host"}
                            </h3>
                            <StatusBadge
                              status={inv.status}
                              label={label}
                              icon={<Icon className="h-3 w-3" />}
                            />
                          </div>
                          {inv.host?.email && (
                            <p className="mt-0.5 text-xs text-earth-500 flex items-center gap-1.5 truncate">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{inv.host.email}</span>
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-earth-900 tabular-nums flex items-center gap-1.5 justify-end">
                            <Wallet className="h-3.5 w-3.5 text-earth-400" />
                            {fmtTHB(inv.amount)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-earth-700">
                        <div className="flex items-center gap-1.5">
                          <CalendarRange className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                          <span className="tabular-nums">
                            {fmtDateStr(inv.period_start, "MMM d", "en")} → {fmtDateStr(inv.period_end, "MMM d, yyyy", "en")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                          <span className="tabular-nums">Due {fmtDateStr(inv.due_date, "MMM d, yyyy", "en")}</span>
                        </div>
                        {inv.paid_at && (
                          <div className="flex items-center gap-1.5 sm:col-span-2">
                            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-brand" />
                            <span className="tabular-nums text-earth-600">Paid {fmtDate(new Date(inv.paid_at), "MMM d, yyyy · HH:mm", "en")}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-earth-100/70 flex items-center justify-between gap-2">
                        <span className="text-xs text-earth-500 flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          <span className="tabular-nums">Created {fmtDate(new Date(inv.created_at), "MMM d, yyyy · HH:mm", "en")}</span>
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                          {inv.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                className="h-9 px-3 text-xs cursor-pointer bg-brand hover:bg-brand-hover text-white"
                                onClick={() => setConfirmAction({ invoiceId: inv.id, status: "paid", hostName: inv.host?.name || "Unknown" })}
                                disabled={actionLoading === inv.id}
                              >
                                {actionLoading === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark Paid"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 px-3 text-xs cursor-pointer text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => setConfirmAction({ invoiceId: inv.id, status: "overdue", hostName: inv.host?.name || "Unknown" })}
                                disabled={actionLoading === inv.id}
                              >
                                Overdue
                              </Button>
                            </>
                          )}
                          {inv.status === "overdue" && (
                            <Button
                              size="sm"
                              className="h-9 px-3 text-xs cursor-pointer bg-brand hover:bg-brand-hover text-white"
                              onClick={() => setConfirmAction({ invoiceId: inv.id, status: "paid", hostName: inv.host?.name || "Unknown" })}
                              disabled={actionLoading === inv.id}
                            >
                              {actionLoading === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark Paid"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between pt-2">
              <p className="text-sm text-earth-500">Page {page} of {totalPages}</p>
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
