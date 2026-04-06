"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { fmtDateStr } from "@/lib/format-date";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  RotateCcw,
  SlidersHorizontal,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Upload,
  Receipt,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Banknote,
  Copy,
  Check,
  Smartphone,
  Building2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/* ─── Types ─── */

interface BillingData {
  plan_type: string;
  wallet_balance: number;
  effective_commission_pct: number | null;
  platform_payment: {
    promptpay_id: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
    payment_display: string;
  } | null;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  reference_id: string | null;
  created_at: string;
  status: string;
}

interface Invoice {
  id: string;
  amount: number;
  period_start: string;
  period_end: string;
  status: string;
  due_date: string;
  paid_at: string | null;
}

/* ─── Constants ─── */

const TXN_TYPE_FILTERS = ["all", "topup", "commission", "refund", "adjustment"] as const;
const INVOICE_STATUS_FILTERS = ["all", "pending", "paid", "overdue"] as const;

const TXN_TYPE_CONFIG: Record<string, { icon: typeof ArrowUpCircle; color: string; bg: string }> = {
  topup:      { icon: ArrowUpCircle,     color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  commission: { icon: ArrowDownCircle,   color: "text-amber-600",   bg: "bg-amber-50 border-amber-200" },
  refund:     { icon: RotateCcw,         color: "text-blue-600",    bg: "bg-blue-50 border-blue-200" },
  adjustment: { icon: SlidersHorizontal, color: "text-gray-600",    bg: "bg-gray-50 border-gray-200" },
};

const INVOICE_STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof CheckCircle }> = {
  pending: { color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",  icon: Clock },
  paid:    { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle },
  overdue: { color: "text-red-700",    bg: "bg-red-50 border-red-200",    icon: AlertTriangle },
};

/* ─── Page ─── */

export default function WalletPage() {
  const t = useTranslations("walletPage");
  const locale = useLocale();

  // ── Billing data ──
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Transactions ──
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnPage, setTxnPage] = useState(1);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnFilter, setTxnFilter] = useState<string>("all");

  // ── Invoices ──
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState<string>("all");

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState<"transactions" | "invoices">("transactions");

  // ── Top-up ──
  const [topupAmount, setTopupAmount] = useState("");
  const [topupFile, setTopupFile] = useState<File | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Clipboard ──
  const [copiedPromptPay, setCopiedPromptPay] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // ── Invoice pay ──
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const payFileInputRef = useRef<HTMLInputElement>(null);

  /* ─── Clipboard ─── */

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
      toast.success(t("copied"));
    }).catch(() => {
      toast.error("Copy failed");
    });
  };

  /* ─── Fetchers ─── */

  const fetchBilling = useCallback(async () => {
    try {
      const res = await fetch("/api/host/billing");
      if (res.ok) {
        const data = await res.json();
        setBilling(data);
      }
    } catch {
      console.error("Failed to fetch billing");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (page: number, append = false) => {
    setTxnLoading(true);
    try {
      const res = await fetch(`/api/host/wallet/transactions?page=${page}&limit=15`);
      if (res.ok) {
        const data = await res.json();
        setTransactions((prev) => append ? [...prev, ...data.transactions] : data.transactions);
        setTxnTotal(data.total);
        setTxnPage(page);
      }
    } catch {
      console.error("Failed to fetch transactions");
    } finally {
      setTxnLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setInvoiceLoading(true);
    try {
      const res = await fetch("/api/host/invoices");
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch {
      console.error("Failed to fetch invoices");
    } finally {
      setInvoiceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
    fetchTransactions(1);
    fetchInvoices();
  }, [fetchBilling, fetchTransactions, fetchInvoices]);

  /* ─── Monthly stats ─── */

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyIncome = transactions
    .filter((tx) => tx.amount > 0 && new Date(tx.created_at) >= monthStart)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const monthlyDeductions = transactions
    .filter((tx) => tx.amount < 0 && new Date(tx.created_at) >= monthStart)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  /* ─── Filtered data ─── */

  const filteredTxns = txnFilter === "all"
    ? transactions
    : transactions.filter((tx) => tx.type === txnFilter);

  const filteredInvoices = invoiceFilter === "all"
    ? invoices
    : invoices.filter((inv) => inv.status === invoiceFilter);

  /* ─── Top-up ─── */

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topupFile || !topupAmount) return;
    setTopupLoading(true);
    try {
      const form = new FormData();
      form.append("file", topupFile);
      form.append("amount", topupAmount);
      const res = await fetch("/api/host/wallet/topup", { method: "POST", body: form });
      const d = await res.json();
      if (d.success) {
        toast.success(`Top-up successful! New balance: ฿${d.new_balance.toLocaleString()}`);
        setTopupFile(null);
        setTopupAmount("");
        fetchBilling();
        fetchTransactions(1);
      } else {
        toast.error(d.error || d.message || "Verification failed");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setTopupLoading(false);
    }
  };

  /* ─── Invoice pay ─── */

  const handlePayInvoice = async (invoiceId: string) => {
    if (!payFile) return;
    setPayLoading(true);
    try {
      const form = new FormData();
      form.append("file", payFile);
      const res = await fetch(`/api/host/invoices/${invoiceId}/pay`, { method: "POST", body: form });
      const d = await res.json();
      if (d.success) {
        toast.success("Payment verified! Invoice marked as paid.");
        setPayFile(null);
        setPayInvoiceId(null);
        fetchInvoices();
      } else {
        toast.error(d.error || d.message || "Verification failed");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setPayLoading(false);
    }
  };

  /* ─── Loading state ─── */

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-40 rounded-2xl md:col-span-2" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Skeleton className="h-56 rounded-2xl md:col-span-2" />
          <Skeleton className="h-56 rounded-2xl md:col-span-3" />
        </div>
        <Skeleton className="h-10 w-64" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!billing) {
    return <p className="text-sm text-gray-500 py-12 text-center">Failed to load wallet information.</p>;
  }

  const isNegative = billing.wallet_balance < 0;

  return (
    <div className="space-y-8">
      {/* ── Page title ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
      </motion.div>

      {/* ── Negative balance alert ── */}
      <AnimatePresence>
        {isNegative && (
          <motion.div
            key="neg-alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2 shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <p className="text-sm font-medium text-red-800">{t("negativeBalanceWarning")}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════
          BALANCE HERO + MONTHLY STATS
      ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Balance card */}
        <motion.div
          className="md:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className={`relative px-7 py-8 ${
              isNegative
                ? "bg-gradient-to-br from-red-50 via-white to-red-50/60"
                : "bg-gradient-to-br from-brand-50/80 via-white to-earth-50/60"
            }`}>
              {/* Decorative circles */}
              <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.07] ${isNegative ? "bg-red-500" : "bg-brand"}`} />
              <div className={`absolute right-16 -bottom-6 h-20 w-20 rounded-full opacity-[0.05] ${isNegative ? "bg-red-500" : "bg-brand"}`} />

              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-earth-400 mb-1">
                  {t("balance")}
                </p>
                <motion.div
                  key={billing.wallet_balance}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, type: "spring" }}
                  className="flex items-baseline gap-1"
                >
                  <span className={`text-5xl sm:text-6xl font-serif tracking-tight leading-none ${
                    isNegative ? "text-red-600" : "text-gray-900"
                  }`}>
                    {isNegative ? "-" : ""}฿{Math.abs(billing.wallet_balance).toLocaleString()}
                  </span>
                </motion.div>

                {billing.effective_commission_pct != null && (
                  <p className="text-xs text-earth-400 mt-2">
                    {billing.effective_commission_pct}% {locale === "th" ? "คอมมิชชั่นต่อการจอง" : "commission per booking"}
                  </p>
                )}

              </div>
            </div>
          </Card>
        </motion.div>

        {/* Monthly stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-col gap-4"
        >
          <Card className="flex-1 border-0 shadow-md">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-earth-400">{t("income")}</p>
                <p className="text-xl font-serif text-gray-900 leading-tight">
                  ฿{monthlyIncome.toLocaleString()}
                </p>
                <p className="text-[11px] text-earth-400 mt-0.5">{t("thisMonth")}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 border-0 shadow-md">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <TrendingDown className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-earth-400">{t("deductions")}</p>
                <p className="text-xl font-serif text-gray-900 leading-tight">
                  ฿{monthlyDeductions.toLocaleString()}
                </p>
                <p className="text-[11px] text-earth-400 mt-0.5">{t("thisMonth")}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ══════════════════════════════════════════════
          PAYMENT INFO + TOP-UP (inline)
      ══════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25 }}
      >
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* ── Payment Info Card ── */}
            <Card className="md:col-span-2 overflow-hidden border-0 shadow-md">
              <div className="bg-gradient-to-br from-brand-50 via-white to-brand-50/40 p-6 h-full">
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-8 w-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                    <Banknote className="h-4 w-4 text-brand" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                    {t("paymentInfo")}
                  </p>
                </div>

                <div className="space-y-4">
                  {/* PromptPay */}
                  {billing.platform_payment?.promptpay_id && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5 text-brand/70" />
                        <p className="text-[11px] font-medium uppercase tracking-wider text-earth-400">
                          {t("promptPayId")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 bg-white rounded-xl border border-brand-100 px-4 py-3">
                        <span className="text-lg font-mono font-semibold text-gray-900 tracking-wide flex-1">
                          {billing.platform_payment.promptpay_id}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(billing.platform_payment!.promptpay_id!, setCopiedPromptPay)}
                          className="h-8 w-8 rounded-lg bg-brand-50 hover:bg-brand-100 flex items-center justify-center transition-colors shrink-0"
                        >
                          {copiedPromptPay ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-brand" />
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-earth-400 leading-relaxed">
                        {t("promptPayHint")}
                      </p>
                    </div>
                  )}

                  {/* Bank */}
                  {(billing.platform_payment?.bank_name || billing.platform_payment?.bank_account_number) && (
                    <div className="bg-white rounded-xl border border-brand-100 p-4 space-y-3">
                      {billing.platform_payment.bank_name && (
                        <div className="flex items-start gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-brand/70 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wider text-earth-400 mb-1">
                              {t("bankName")}
                            </p>
                            <p className="text-sm font-medium text-gray-800">
                              {billing.platform_payment.bank_name}
                            </p>
                          </div>
                        </div>
                      )}

                      {billing.platform_payment.bank_account_number && (
                        <div className="border-t border-earth-50 pt-3">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-earth-400 mb-1">
                            {t("accountNumber")}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-mono font-semibold text-gray-900 tracking-wide flex-1">
                              {billing.platform_payment.bank_account_number}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(billing.platform_payment!.bank_account_number!, setCopiedAccount)}
                              className="h-8 w-8 rounded-lg bg-brand-50 hover:bg-brand-100 flex items-center justify-center transition-colors shrink-0"
                            >
                              {copiedAccount ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 text-brand" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {billing.platform_payment.bank_account_name && (
                        <div className="border-t border-earth-50 pt-3">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-earth-400 mb-1">
                            {t("accountName")}
                          </p>
                          <p className="text-sm font-medium text-gray-800">
                            {billing.platform_payment.bank_account_name}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* ── Top-Up Form Card ── */}
            <Card className="md:col-span-3 overflow-hidden border-0 shadow-md">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{t("topUp")}</h3>
                    <p className="text-[11px] text-earth-400">{t("topUpInlineDesc")}</p>
                  </div>
                </div>

                <form onSubmit={handleTopup} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">{t("amount")} (THB)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      className="text-lg font-mono h-12"
                      placeholder="0"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[500, 1000, 2000, 5000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTopupAmount(String(amt))}
                        className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                          topupAmount === String(amt)
                            ? "border-brand/30 bg-brand-50 text-brand ring-1 ring-brand/20"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                        }`}
                      >
                        ฿{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">{t("paymentSlip")}</Label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file) setTopupFile(file);
                      }}
                      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                        topupFile
                          ? "border-brand/30 bg-brand-50/50"
                          : "border-gray-200 hover:border-brand/20 hover:bg-brand-50/20"
                      }`}
                    >
                      <Upload className="h-5 w-5 text-earth-300 mx-auto mb-1.5" />
                      <p className="text-sm text-earth-500 truncate">
                        {topupFile ? topupFile.name : t("dragOrClick")}
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setTopupFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={topupLoading || !topupFile || !topupAmount}
                    className="w-full bg-brand hover:bg-brand-hover text-white rounded-xl h-11 shadow-md shadow-brand/10"
                  >
                    {topupLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {t("verifyAndTopUp")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
      </motion.div>

      {/* ══════════════════════════════════════════════
          TAB SWITCHER
      ══════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.35 }}
      >
        <div className="flex items-center border-b border-earth-100">
          {(["transactions", "invoices"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`relative px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-brand"
                  : "text-earth-400 hover:text-gray-700"
              }`}
            >
              {t(tab)}
              {activeTab === tab && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════
          TRANSACTIONS TAB
      ══════════════════════════════════════════════ */}
      {activeTab === "transactions" && (
        <motion.div
          key="txns"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {TXN_TYPE_FILTERS.map((f) => {
              const isActive = txnFilter === f;
              const labelKey = f === "all" ? "all"
                : f === "topup" ? "topups"
                : f === "commission" ? "commissions"
                : f === "refund" ? "refunds"
                : "adjustments";
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTxnFilter(f)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? "bg-brand text-white shadow-sm"
                      : "bg-earth-50 text-earth-500 hover:bg-earth-100 hover:text-earth-700"
                  }`}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </div>

          {/* Transaction list */}
          <Card className="overflow-hidden border-0 shadow-md">
            <CardContent className="p-0">
              {txnLoading && transactions.length === 0 ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-9 w-9 rounded-xl" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-20" />
                    </div>
                  ))}
                </div>
              ) : filteredTxns.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-earth-50 flex items-center justify-center mb-3">
                    <Banknote className="h-5 w-5 text-earth-300" />
                  </div>
                  <p className="text-sm text-earth-400">{t("noTransactions")}</p>
                </div>
              ) : (
                <div className="divide-y divide-earth-50">
                  {filteredTxns.map((tx, i) => {
                    const config = TXN_TYPE_CONFIG[tx.type] || TXN_TYPE_CONFIG.adjustment;
                    const Icon = config.icon;
                    const isPositive = tx.amount > 0;

                    return (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.25 }}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-earth-50/50 transition-colors"
                      >
                        {/* Type icon */}
                        <div className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${config.bg}`}>
                          <Icon className={`h-4 w-4 ${config.color}`} />
                        </div>

                        {/* Description */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {tx.description || tx.type}
                          </p>
                          <p className="text-[11px] text-earth-400 font-mono mt-0.5">
                            {fmtDateStr(tx.created_at, "d MMM yyyy, HH:mm", locale)}
                          </p>
                        </div>

                        {/* Amount + balance */}
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-semibold font-mono tabular-nums ${
                            isPositive ? "text-emerald-600" : "text-red-500"
                          }`}>
                            {isPositive ? "+" : ""}฿{Math.abs(tx.amount).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-earth-400 font-mono mt-0.5">
                            {t("balanceAfter")} ฿{tx.balance_after.toLocaleString()}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Load more */}
              {transactions.length < txnTotal && (
                <div className="border-t border-earth-50 p-4 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-earth-500 hover:text-brand"
                    onClick={() => fetchTransactions(txnPage + 1, true)}
                    disabled={txnLoading}
                  >
                    {txnLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {t("loadMore")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════
          INVOICES TAB
      ══════════════════════════════════════════════ */}
      {activeTab === "invoices" && (
        <motion.div
          key="invoices"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {INVOICE_STATUS_FILTERS.map((f) => {
              const isActive = invoiceFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setInvoiceFilter(f)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? "bg-brand text-white shadow-sm"
                      : "bg-earth-50 text-earth-500 hover:bg-earth-100 hover:text-earth-700"
                  }`}
                >
                  {t(f)}
                </button>
              );
            })}
          </div>

          {/* Invoice list */}
          {invoiceLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <Card className="border-0 shadow-md">
              <CardContent className="py-16 text-center">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-earth-50 flex items-center justify-center mb-3">
                  <Receipt className="h-5 w-5 text-earth-300" />
                </div>
                <p className="text-sm text-earth-400">{t("noInvoices")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredInvoices.map((inv, i) => {
                const statusConf = INVOICE_STATUS_CONFIG[inv.status] || INVOICE_STATUS_CONFIG.pending;
                const StatusIcon = statusConf.icon;

                return (
                  <motion.div
                    key={inv.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                  >
                    <Card className={`overflow-hidden border-0 shadow-md transition-shadow hover:shadow-lg ${
                      inv.status === "overdue" ? "ring-1 ring-red-200" : ""
                    }`}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          {/* Left: amount + period */}
                          <div>
                            <p className="text-2xl font-serif text-gray-900 leading-tight">
                              ฿{inv.amount.toLocaleString()}
                            </p>
                            <p className="text-xs text-earth-400 mt-1">
                              {fmtDateStr(inv.period_start, "d MMM", locale)} — {fmtDateStr(inv.period_end, "d MMM yyyy", locale)}
                            </p>
                          </div>

                          {/* Right: status badge */}
                          <Badge className={`rounded-full text-[11px] font-medium border ${statusConf.bg} ${statusConf.color}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {t(inv.status)}
                          </Badge>
                        </div>

                        {/* Footer: due date / paid date / action */}
                        <div className="mt-4 pt-3 border-t border-earth-50 flex items-center justify-between">
                          <div className="text-xs text-earth-400">
                            {inv.status === "paid" && inv.paid_at ? (
                              <span>{t("paidOn")} {fmtDateStr(inv.paid_at, "d MMM yyyy", locale)}</span>
                            ) : (
                              <span>{t("dueDate")}: {fmtDateStr(inv.due_date, "d MMM yyyy", locale)}</span>
                            )}
                          </div>

                          {(inv.status === "pending" || inv.status === "overdue") && (
                            <Button
                              size="sm"
                              className="bg-brand hover:bg-brand-hover text-white rounded-full px-5 text-xs shadow-sm"
                              onClick={() => {
                                setPayInvoiceId(inv.id);
                                setPayFile(null);
                              }}
                            >
                              {t("payNow")}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════
          INVOICE PAY DIALOG
      ══════════════════════════════════════════════ */}
      <Dialog open={!!payInvoiceId} onOpenChange={(open) => { if (!open) { setPayInvoiceId(null); setPayFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("payInvoice")}</DialogTitle>
            <DialogDescription>{t("payInvoiceDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {billing.platform_payment && (
              <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand mb-3">
                  {t("transferTo")}
                </p>
                {billing.platform_payment.payment_display === "qr" && billing.platform_payment.promptpay_id && (
                  <p className="text-sm text-gray-700">
                    PromptPay: <span className="font-mono font-medium">{billing.platform_payment.promptpay_id}</span>
                  </p>
                )}
                {billing.platform_payment.payment_display === "bank" && (
                  <div className="space-y-1 text-sm text-gray-700">
                    {billing.platform_payment.bank_name && <p>{billing.platform_payment.bank_name}</p>}
                    {billing.platform_payment.bank_account_number && (
                      <p className="font-mono font-medium">{billing.platform_payment.bank_account_number}</p>
                    )}
                    {billing.platform_payment.bank_account_name && <p>{billing.platform_payment.bank_account_name}</p>}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm text-gray-700">{t("paymentSlip")}</Label>
              <div
                onClick={() => payFileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file) setPayFile(file);
                }}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  payFile
                    ? "border-brand/30 bg-brand-50/50"
                    : "border-gray-200 hover:border-brand/20 hover:bg-brand-50/20"
                }`}
              >
                <Upload className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  {payFile ? payFile.name : t("dragOrClick")}
                </p>
                <input
                  ref={payFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setPayFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayInvoiceId(null); setPayFile(null); }}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => payInvoiceId && handlePayInvoice(payInvoiceId)}
              disabled={payLoading || !payFile}
              className="bg-brand hover:bg-brand-hover"
            >
              {payLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {t("verifyAndPay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
