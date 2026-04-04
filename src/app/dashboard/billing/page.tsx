"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  CreditCard,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Upload,
  Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface BillingData {
  plan_type: string;
  plan_free_expires_at: string | null;
  plan_pending_type: string | null;
  plan_pending_effective_at: string | null;
  wallet_balance: number;
  effective_commission_pct: number | null;
  effective_fixed_rate: number | null;
  platform_payment: {
    promptpay_id: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
    payment_display: string;
  } | null;
  invoices: InvoiceRow[];
  recent_transactions: TransactionRow[];
}

interface InvoiceRow {
  id: string;
  amount: number;
  period_start: string;
  period_end: string;
  status: string;
  due_date: string;
  paid_at: string | null;
}

interface TransactionRow {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  commission: "Commission",
  fixed_rate: "Fixed Rate",
};

export default function DashboardBillingPage() {
  const t = useTranslations("billing");
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupFile, setTopupFile] = useState<File | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupResult, setTopupResult] = useState<string | null>(null);
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payResult, setPayResult] = useState<string | null>(null);

  const fetchBilling = useCallback(async () => {
    try {
      const res = await fetch("/api/host/billing");
      if (res.ok) setData(await res.json());
    } catch {
      console.error("Failed to fetch billing");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const handlePlanSwitch = async (planType: string) => {
    if (!confirm(`Switch to ${PLAN_LABELS[planType]}? This will take effect on the 1st of next month.`)) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/host/plan/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_type: planType }),
      });
      if (res.ok) {
        fetchBilling();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to switch plan");
      }
    } catch {
      alert("Failed to switch plan");
    } finally {
      setSwitching(false);
    }
  };

  const handleCancelSwitch = async () => {
    if (!confirm(t("cancelSwitchConfirm"))) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/host/plan/cancel", { method: "POST" });
      if (res.ok) {
        fetchBilling();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to cancel");
      }
    } catch {
      alert("Failed to cancel plan switch");
    } finally {
      setCancelling(false);
    }
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topupFile || !topupAmount) return;
    setTopupLoading(true);
    setTopupResult(null);
    try {
      const form = new FormData();
      form.append("file", topupFile);
      form.append("amount", topupAmount);
      const res = await fetch("/api/host/wallet/topup", { method: "POST", body: form });
      const d = await res.json();
      if (d.success) {
        setTopupResult(`Top-up successful! New balance: ฿${d.new_balance.toLocaleString()}`);
        setTopupFile(null);
        setTopupAmount("");
        setTopupOpen(false);
        fetchBilling();
      } else {
        setTopupResult(d.error || d.message || "Verification failed");
      }
    } catch {
      setTopupResult("Something went wrong");
    } finally {
      setTopupLoading(false);
    }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    if (!payFile) return;
    setPayLoading(true);
    setPayResult(null);
    try {
      const form = new FormData();
      form.append("file", payFile);
      const res = await fetch(`/api/host/invoices/${invoiceId}/pay`, { method: "POST", body: form });
      const d = await res.json();
      if (d.success) {
        setPayResult("Payment verified! Invoice marked as paid.");
        setPayFile(null);
        setPayInvoiceId(null);
        fetchBilling();
      } else {
        setPayResult(d.error || d.message || "Verification failed");
      }
    } catch {
      setPayResult("Something went wrong");
    } finally {
      setPayLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-gray-500 py-12 text-center">Failed to load billing information.</p>;
  }

  const isFreeExpired = data.plan_type === "free" && data.plan_free_expires_at && new Date(data.plan_free_expires_at) < new Date();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-violet-100 p-2">
          <CreditCard className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
      </div>

      {/* Free plan expiry warning */}
      {isFreeExpired && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">{t("freeExpiredTitle")}</p>
            <p className="text-xs text-amber-600">{t("freeExpiredDesc")}</p>
          </div>
        </div>
      )}

      {/* Plan Status */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("currentPlan")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-3">
            <Badge className="text-sm px-3 py-1 bg-violet-100 text-violet-700">
              {PLAN_LABELS[data.plan_type] || data.plan_type}
            </Badge>
            {data.plan_type === "free" && data.plan_free_expires_at && (
              <span className="text-xs text-gray-500">
                {t("expiresOn")} {new Date(data.plan_free_expires_at).toLocaleDateString()}
              </span>
            )}
            {data.plan_type === "commission" && data.effective_commission_pct != null && (
              <span className="text-xs text-gray-500">{data.effective_commission_pct}% {t("perBooking")}</span>
            )}
            {data.plan_type === "fixed_rate" && data.effective_fixed_rate != null && (
              <span className="text-xs text-gray-500">฿{data.effective_fixed_rate.toLocaleString()}/{t("month")}</span>
            )}
          </div>

          {data.plan_pending_type && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700 mb-3 flex items-center justify-between gap-2">
              <span>
                <Clock className="h-4 w-4 inline mr-1" />
                {t("pendingSwitch")} <strong>{PLAN_LABELS[data.plan_pending_type]}</strong> {t("effectiveOn")} {data.plan_pending_effective_at}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs text-red-600 border-red-300 hover:bg-red-50 shrink-0"
                onClick={handleCancelSwitch}
                disabled={cancelling}
              >
                {cancelling ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {t("cancelSwitch")}
              </Button>
            </div>
          )}

          {/* Plan switch (only if not already on free - free is admin-assigned) */}
          {!data.plan_pending_type && (
            <div className="flex gap-2 mt-2">
              {data.plan_type !== "commission" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePlanSwitch("commission")}
                  disabled={switching}
                  className="text-xs"
                >
                  {switching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  {t("switchToCommission")}
                </Button>
              )}
              {data.plan_type !== "fixed_rate" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePlanSwitch("fixed_rate")}
                  disabled={switching}
                  className="text-xs"
                >
                  {switching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  {t("switchToFixedRate")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wallet (commission plan) */}
      {data.plan_type === "commission" && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                {t("wallet")}
              </CardTitle>
              <Button size="sm" onClick={() => setTopupOpen(!topupOpen)} className="bg-violet-600 hover:bg-violet-700 text-xs">
                <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                {t("topUp")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold mb-4 ${data.wallet_balance < 0 ? "text-red-600" : "text-gray-900"}`}>
              {data.wallet_balance < 0 ? "-" : ""}฿{Math.abs(data.wallet_balance).toLocaleString()}
            </div>

            {data.wallet_balance < 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                {t("negativeBalance")}
              </div>
            )}

            {/* Top-up form */}
            {topupOpen && (
              <div className="border rounded-lg p-4 mb-4 bg-gray-50">
                {/* Platform payment details */}
                {data.platform_payment && (
                  <div className="mb-4 p-3 bg-white rounded border text-sm">
                    <p className="font-medium text-gray-700 mb-1">{t("transferTo")}</p>
                    {data.platform_payment.payment_display === "qr" && data.platform_payment.promptpay_id && (
                      <p className="text-gray-600">PromptPay: <span className="font-mono">{data.platform_payment.promptpay_id}</span></p>
                    )}
                    {data.platform_payment.payment_display === "bank" && (
                      <>
                        {data.platform_payment.bank_name && <p className="text-gray-600">{data.platform_payment.bank_name}</p>}
                        {data.platform_payment.bank_account_number && <p className="text-gray-600 font-mono">{data.platform_payment.bank_account_number}</p>}
                        {data.platform_payment.bank_account_name && <p className="text-gray-600">{data.platform_payment.bank_account_name}</p>}
                      </>
                    )}
                  </div>
                )}

                <form onSubmit={handleTopup} className="space-y-3">
                  <div className="space-y-2">
                    <Label>{t("amount")} (THB)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      placeholder="e.g. 1000"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("paymentSlip")}</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setTopupFile(e.target.files?.[0] || null)}
                      required
                    />
                  </div>
                  {topupResult && (
                    <p className={`text-sm ${topupResult.includes("successful") ? "text-green-700" : "text-red-700"}`}>
                      {topupResult}
                    </p>
                  )}
                  <Button type="submit" disabled={topupLoading || !topupFile || !topupAmount} className="w-full">
                    {topupLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {t("verifyAndTopUp")}
                  </Button>
                </form>
              </div>
            )}

            {/* Recent transactions */}
            {data.recent_transactions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">{t("recentTransactions")}</p>
                <div className="space-y-2">
                  {data.recent_transactions.map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2">
                        {txn.amount > 0 ? (
                          <ArrowUpCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <ArrowDownCircle className="h-4 w-4 text-red-500" />
                        )}
                        <div>
                          <p className="text-sm text-gray-700">{txn.description || txn.type}</p>
                          <p className="text-xs text-gray-400">{new Date(txn.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-medium ${txn.amount > 0 ? "text-green-600" : "text-red-600"}`}>
                        {txn.amount > 0 ? "+" : ""}฿{Math.abs(txn.amount).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invoices (fixed rate plan) */}
      {data.plan_type === "fixed_rate" && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              {t("invoices")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.invoices.length === 0 ? (
              <p className="text-sm text-gray-500">{t("noInvoices")}</p>
            ) : (
              <div className="space-y-3">
                {data.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        ฿{inv.amount.toLocaleString()} — {new Date(inv.period_start).toLocaleDateString()} - {new Date(inv.period_end).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-400">
                        Due: {new Date(inv.due_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${
                        inv.status === "paid" ? "bg-green-100 text-green-700" :
                        inv.status === "overdue" ? "bg-red-100 text-red-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {inv.status === "paid" ? <CheckCircle className="h-3 w-3 mr-0.5" /> :
                         inv.status === "overdue" ? <AlertTriangle className="h-3 w-3 mr-0.5" /> :
                         <Clock className="h-3 w-3 mr-0.5" />}
                        {inv.status}
                      </Badge>
                      {(inv.status === "pending" || inv.status === "overdue") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => { setPayInvoiceId(inv.id); setPayResult(null); }}
                        >
                          Pay
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Invoice payment form */}
            {payInvoiceId && (
              <div className="border rounded-lg p-4 mt-4 bg-gray-50">
                {data.platform_payment && (
                  <div className="mb-4 p-3 bg-white rounded border text-sm">
                    <p className="font-medium text-gray-700 mb-1">{t("transferTo")}</p>
                    {data.platform_payment.payment_display === "qr" && data.platform_payment.promptpay_id && (
                      <p className="text-gray-600">PromptPay: <span className="font-mono">{data.platform_payment.promptpay_id}</span></p>
                    )}
                    {data.platform_payment.payment_display === "bank" && (
                      <>
                        {data.platform_payment.bank_name && <p className="text-gray-600">{data.platform_payment.bank_name}</p>}
                        {data.platform_payment.bank_account_number && <p className="text-gray-600 font-mono">{data.platform_payment.bank_account_number}</p>}
                        {data.platform_payment.bank_account_name && <p className="text-gray-600">{data.platform_payment.bank_account_name}</p>}
                      </>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>{t("paymentSlip")}</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setPayFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  {payResult && (
                    <p className={`text-sm ${payResult.includes("verified") ? "text-green-700" : "text-red-700"}`}>
                      {payResult}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handlePayInvoice(payInvoiceId)}
                      disabled={payLoading || !payFile}
                      className="flex-1"
                    >
                      {payLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                      {t("verifyAndPay")}
                    </Button>
                    <Button variant="outline" onClick={() => { setPayInvoiceId(null); setPayFile(null); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
