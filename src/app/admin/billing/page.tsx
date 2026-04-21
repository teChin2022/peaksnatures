"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CreditCard, Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700", icon: Clock },
  paid: { label: "Paid", color: "bg-green-100 text-green-700", icon: CheckCircle },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700", icon: AlertCircle },
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
      {/* ── Header ── */}
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-1">
          {total > 0 ? `${total} invoices` : "Invoice management"}
        </p>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-100 p-2">
            <CreditCard className="h-5 w-5 text-violet-600" />
          </div>
          <h1 className="text-2xl font-serif text-gray-900">Billing</h1>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="mb-4 flex gap-2">
        {["all", "pending", "paid", "overdue"].map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatusFilter(f); setPage(1); }}
            className={statusFilter === f ? "bg-slate-800 hover:bg-slate-700" : ""}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">No invoices found.</p>
      ) : (
        <>
          <div className="space-y-3">
            {invoices.map((inv, i) => {
              const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={inv.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900 truncate">
                              {inv.host?.name || "Unknown Host"}
                            </h3>
                            <Badge className={`text-[10px] shrink-0 ${cfg.color}`}>
                              <Icon className="h-3 w-3 mr-0.5" />
                              {cfg.label}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-500 space-y-0.5">
                            <p>
                              <span className="font-medium text-gray-700">฿{inv.amount.toLocaleString()}</span>
                              {" — "}
                              {new Date(inv.period_start).toLocaleDateString()} - {new Date(inv.period_end).toLocaleDateString()}
                            </p>
                            <p className="text-xs">
                              Due: {new Date(inv.due_date).toLocaleDateString()}
                              {inv.paid_at && ` | Paid: ${new Date(inv.paid_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
                          {inv.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 px-3 text-xs text-green-700 border-green-300 hover:bg-green-50"
                                onClick={() => setConfirmAction({ invoiceId: inv.id, status: "paid", hostName: inv.host?.name || "Unknown" })}
                                disabled={actionLoading === inv.id}
                              >
                                {actionLoading === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark Paid"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 px-3 text-xs text-red-700 border-red-300 hover:bg-red-50"
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
                              variant="outline"
                              className="h-9 px-3 text-xs text-green-700 border-green-300 hover:bg-green-50"
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
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
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
            <DialogTitle>
              {confirmAction?.status === "paid" ? "Mark as Paid" : "Mark as Overdue"}
            </DialogTitle>
            <DialogDescription>
              Mark invoice for <strong>{confirmAction?.hostName}</strong> as {confirmAction?.status}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              onClick={() => confirmAction && handleMarkStatus(confirmAction.invoiceId, confirmAction.status)}
              disabled={actionLoading !== null}
              className={confirmAction?.status === "paid" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
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
