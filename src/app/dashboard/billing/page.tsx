"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { fmtDateStr } from "@/lib/format-date";
import {
  Wallet,
  ArrowUpCircle,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Upload,
  Receipt,
  Percent,
  CalendarClock,
  Leaf,
  Check,
  ArrowRight,
  HelpCircle,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

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

function PlanIcon({ type, className }: { type: string; className?: string }) {
  const c = className || "h-5 w-5";
  if (type === "commission") return <Percent className={c} />;
  if (type === "fixed_rate") return <CalendarClock className={c} />;
  return <Leaf className={c} />;
}

const PLANS = [
  {
    key: "free",
    icon: <Leaf className="w-6 h-6 text-earth-600" />,
    features: [
      "Unlimited listings",
      "Self-managed bookings",
      "Advanced analytics & reporting",
      "0% commission on bookings",
      "Instant SMS notification on new bookings",
      "Automatic slip verification",
    ],
    featuresTh: [
      "ลงประกาศไม่จำกัด",
      "จัดการการจองด้วยตนเอง",
      "การวิเคราะห์และรายงานขั้นสูง",
      "คอมมิชชั่น 0% สำหรับการจอง",
      "ส่ง SMS แจ้งเตือนทันทีที่มีการจอง",
      "ตรวจสอบสลิปโอนอัตโนมัติ",
    ],
    popular: false,
  },
  {
    key: "commission",
    icon: <Wallet className="w-6 h-6 text-brand" />,
    features: [
      "Unlimited listings",
      "Self-managed bookings",
      "Advanced analytics & reporting",
      "Instant SMS notification on new bookings",
      "Automatic slip verification",
    ],
    featuresTh: [
      "ลงประกาศไม่จำกัด",
      "จัดการการจองด้วยตนเอง",
      "การวิเคราะห์และรายงานขั้นสูง",
      "ส่ง SMS แจ้งเตือนทันทีที่มีการจอง",
      "ตรวจสอบสลิปโอนอัตโนมัติ",
    ],
    popular: true,
  },
  {
    key: "fixed_rate",
    icon: <CalendarClock className="w-6 h-6 text-earth-700" />,
    features: [
      "Unlimited listings",
      "Self-managed bookings",
      "Advanced analytics & reporting",
      "0% commission on bookings",
      "Instant SMS notification on new bookings",
      "Automatic slip verification",
    ],
    featuresTh: [
      "ลงประกาศไม่จำกัด",
      "จัดการการจองด้วยตนเอง",
      "การวิเคราะห์และรายงานขั้นสูง",
      "คอมมิชชั่น 0% สำหรับการจอง",
      "ส่ง SMS แจ้งเตือนทันทีที่มีการจอง",
      "ตรวจสอบสลิปโอนอัตโนมัติ",
    ],
    popular: false,
  },
];

function getPlanPrice(key: string, data: BillingData): { price: string; period: string; periodTh: string } {
  if (key === "free") return { price: "฿0", period: "/month", periodTh: "/เดือน" };
  if (key === "commission") {
    const pct = data.effective_commission_pct;
    return { price: pct != null ? `${pct}%` : "—", period: "/booking", periodTh: "/การจอง" };
  }
  // fixed_rate
  const rate = data.effective_fixed_rate;
  return { price: rate != null ? `฿${rate.toLocaleString()}` : "—", period: "/month", periodTh: "/เดือน" };
}

export default function DashboardBillingPage() {
  const t = useTranslations("billing");
  const locale = useLocale();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [topupSheetOpen, setTopupSheetOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupFile, setTopupFile] = useState<File | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "switch" | "cancelSwitch";
    planType?: string;
  } | null>(null);
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const payFileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Plan Switch ──
  const handlePlanSwitch = async (planType: string) => {
    setSwitching(true);
    try {
      const res = await fetch("/api/host/plan/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_type: planType }),
      });
      if (res.ok) {
        toast.success(`Plan switch scheduled`);
        fetchBilling();
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to switch plan");
      }
    } catch {
      toast.error("Failed to switch plan");
    } finally {
      setSwitching(false);
      setConfirmDialog(null);
    }
  };

  const handleCancelSwitch = async () => {
    setCancelling(true);
    try {
      const res = await fetch("/api/host/plan/cancel", { method: "POST" });
      if (res.ok) {
        toast.success("Plan switch cancelled");
        fetchBilling();
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to cancel");
      }
    } catch {
      toast.error("Failed to cancel plan switch");
    } finally {
      setCancelling(false);
      setConfirmDialog(null);
    }
  };

  // ── Top-up ──
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
        setTopupSheetOpen(false);
        fetchBilling();
      } else {
        toast.error(d.error || d.message || "Verification failed");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setTopupLoading(false);
    }
  };

  // ── Invoice Pay ──
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
        fetchBilling();
      } else {
        toast.error(d.error || d.message || "Verification failed");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setPayLoading(false);
    }
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-3 w-40 mb-2" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-8">
                <Skeleton className="h-12 w-12 rounded-2xl mb-6" />
                <Skeleton className="h-6 w-24 mb-2" />
                <Skeleton className="h-4 w-40 mb-8" />
                <Skeleton className="h-12 w-32 mb-8" />
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 w-36" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-12 w-full rounded-xl mt-8" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-gray-500 py-12 text-center">Failed to load billing information.</p>;
  }

  const isFreeExpired =
    data.plan_type === "free" && data.plan_free_expires_at && new Date(data.plan_free_expires_at) < new Date();

  return (
    <div className="space-y-8">
      {/* ── Page Header ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
      </motion.div>

      {/* ── Alert Banners ── */}
      <AnimatePresence>
        {isFreeExpired && (
          <motion.div
            key="free-expired"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2 shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-800">{t("freeExpiredTitle")}</p>
                <p className="text-xs text-amber-600 mt-0.5">{t("freeExpiredDesc")}</p>
              </div>
            </div>
          </motion.div>
        )}

        {data.plan_type === "commission" && data.wallet_balance < 0 && (
          <motion.div
            key="negative-balance"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2 shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-800">{t("negativeBalance")}</p>
              </div>
            </div>
          </motion.div>
        )}

        {data.plan_pending_type && (
          <motion.div
            key="pending-switch"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-brand-700">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  {t("pendingSwitch")}{" "}
                  <strong>{PLAN_LABELS[data.plan_pending_type]}</strong>{" "}
                  {t("effectiveOn")}{" "}
                  {data.plan_pending_effective_at && fmtDateStr(data.plan_pending_effective_at, "d MMM yyyy", locale)}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50 shrink-0"
                onClick={() => setConfirmDialog({ type: "cancelSwitch", planType: data.plan_pending_type || undefined })}
                disabled={cancelling}
              >
                {cancelling && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {t("cancelSwitch")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pricing Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        {PLANS.map((plan, index) => {
          const isCurrent = data.plan_type === plan.key;
          const isPopular = plan.popular;
          const canSwitch = !isCurrent && !data.plan_pending_type && !switching;
          const features = locale === "th" ? plan.featuresTh : plan.features;
          const { price, period: periodEn, periodTh } = getPlanPrice(plan.key, data);
          const period = locale === "th" ? periodTh : periodEn;

          return (
            <motion.div
              key={plan.key}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 + index * 0.08 }}
              onMouseEnter={() => setHoveredPlan(plan.key)}
              onMouseLeave={() => setHoveredPlan(null)}
              className={`relative bg-white rounded-2xl p-7 border-2 transition-all duration-300 flex flex-col ${
                isCurrent
                  ? "border-brand shadow-lg shadow-brand-50 ring-1 ring-brand/10"
                  : hoveredPlan === plan.key
                    ? "border-earth-300 shadow-md"
                    : "border-earth-100 shadow-sm"
              }`}
            >
              {/* Current plan badge */}
              {isCurrent && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-brand text-white text-[11px] font-bold uppercase tracking-wider py-1 px-3 rounded-full whitespace-nowrap">
                    {t("currentPlan")}
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="mb-6">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${
                  isCurrent ? "bg-brand-50" : "bg-earth-50"
                }`}>
                  {plan.icon}
                </div>
                <h3 className="text-xl font-serif font-bold text-gray-900 mb-1">
                  {PLAN_LABELS[plan.key]}
                </h3>
                <p className="text-earth-500 text-sm min-h-[36px]">
                  {plan.key === "free" && (locale === "th" ? "เหมาะสำหรับเริ่มต้นทดลองใช้งาน" : "Perfect for getting started and testing the waters.")}
                  {plan.key === "commission" && (locale === "th" ? "จ่ายตามการใช้งาน เหมาะสำหรับโฮสต์ตามฤดูกาล" : "Pay as you go. Best for seasonal or occasional hosts.")}
                  {plan.key === "fixed_rate" && (locale === "th" ? "เก็บรายได้ 100% เหมาะสำหรับโฮสต์เต็มเวลา" : "Keep 100% of your earnings. Ideal for full-time hosts.")}
                </p>
              </div>

              {/* Price — uses real data from API */}
              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-4xl font-extrabold tracking-tight text-gray-900">{price}</span>
                  <span className="text-earth-400 ml-2 font-medium">{period}</span>
                </div>
                {isCurrent && plan.key === "free" && data.plan_free_expires_at && (
                  <p className="text-xs text-earth-500 mt-1">
                    {t("expiresOn")} {fmtDateStr(data.plan_free_expires_at, "d MMM yyyy", locale)}
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-7 flex-grow">
                {features.map((feature, i) => (
                  <li key={i} className="flex items-start">
                    <Check className={`w-4.5 h-4.5 mr-2.5 shrink-0 mt-0.5 ${
                      isCurrent ? "text-brand" : "text-earth-400"
                    }`} />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <div className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center bg-brand-50 text-brand border border-brand/15 mt-auto">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {locale === "th" ? "แพลนปัจจุบันของคุณ" : "Your Current Plan"}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => canSwitch && setConfirmDialog({ type: "switch", planType: plan.key })}
                  disabled={!canSwitch}
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center transition-colors mt-auto disabled:opacity-50 disabled:cursor-not-allowed ${
                    isPopular && !isCurrent
                      ? "bg-brand text-white hover:bg-brand-hover"
                      : "bg-earth-50 text-earth-800 hover:bg-earth-100"
                  }`}
                >
                  {locale === "th" ? `เปลี่ยนเป็น${PLAN_LABELS[plan.key]}` : `Switch to ${PLAN_LABELS[plan.key]}`}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ── Switch note ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="text-center"
      >
        <p className="text-earth-400 text-sm flex items-center justify-center">
          <HelpCircle className="w-4 h-4 mr-1.5" />
          {t("switchNote")}
        </p>
      </motion.div>

      {/* ── Wallet Card (commission plan) ── */}
      {data.plan_type === "commission" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-brand-50/60 via-white to-brand-50/40 px-6 pt-6 pb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-brand" />
                  <span className="text-sm font-medium text-gray-600">{t("wallet")}</span>
                </div>
                <Button
                  size="sm"
                  className="bg-brand hover:bg-brand-hover text-white rounded-full px-4 text-xs"
                  onClick={() => setTopupSheetOpen(true)}
                >
                  <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />
                  {t("topUp")}
                </Button>
              </div>

              <div className="text-center">
                <motion.p
                  key={data.wallet_balance}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`text-4xl sm:text-5xl font-serif tracking-tight ${
                    data.wallet_balance < 0 ? "text-red-600" : "text-gray-900"
                  }`}
                >
                  {data.wallet_balance < 0 ? "-" : ""}฿{Math.abs(data.wallet_balance).toLocaleString()}
                </motion.p>
                <p className="text-xs font-mono uppercase tracking-wider text-gray-400 mt-1.5">
                  {t("walletBalance")}
                </p>
              </div>
            </div>

            <CardContent className="px-6 pb-6 pt-4">
              {data.recent_transactions.length > 0 ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
                    {t("recentTransactions")}
                  </p>
                  <div className="relative">
                    <div className="absolute left-[4.5px] top-3 bottom-3 w-px bg-gray-200" />
                    <div className="space-y-0">
                      {data.recent_transactions.map((txn, i) => (
                        <motion.div
                          key={txn.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05, duration: 0.3 }}
                          className="relative flex items-start gap-3 py-2.5"
                        >
                          <div
                            className={`relative z-10 mt-1 h-[9px] w-[9px] rounded-full border-2 shrink-0 ${
                              txn.amount > 0
                                ? "border-green-500 bg-green-50"
                                : "border-gray-400 bg-gray-100"
                            }`}
                          />
                          <div className="flex-1 flex items-start justify-between min-w-0">
                            <div className="min-w-0">
                              <p className="text-sm text-gray-700 truncate">
                                {txn.description || txn.type}
                              </p>
                              <p className="text-[11px] text-gray-400 font-mono">
                                {fmtDateStr(txn.created_at, "d MMM yyyy HH:mm", locale)}
                              </p>
                            </div>
                            <span
                              className={`text-sm font-mono font-medium shrink-0 ml-3 ${
                                txn.amount > 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {txn.amount > 0 ? "+" : ""}฿{Math.abs(txn.amount).toLocaleString()}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">{t("noTransactions")}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Invoices Card (fixed rate plan) ── */}
      {data.plan_type === "fixed_rate" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="h-4 w-4 text-brand" />
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  {t("invoices")}
                </p>
              </div>

              {data.invoices.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">{t("noInvoices")}</p>
              ) : (
                <div className="space-y-3">
                  {data.invoices.map((inv, i) => (
                    <motion.div
                      key={inv.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.3 }}
                      className={`rounded-xl border p-4 transition-colors ${
                        inv.status === "overdue"
                          ? "border-red-200 bg-red-50/30"
                          : inv.status === "paid"
                          ? "border-gray-100 bg-gray-50/50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-serif text-lg text-gray-900">
                            ฿{inv.amount.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fmtDateStr(inv.period_start, "d MMM", locale)} —{" "}
                            {fmtDateStr(inv.period_end, "d MMM yyyy", locale)}
                          </p>
                        </div>
                        <Badge
                          className={`rounded-full text-[11px] font-medium ${
                            inv.status === "paid"
                              ? "bg-green-100 text-green-700"
                              : inv.status === "overdue"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {inv.status === "paid" && <CheckCircle className="h-3 w-3 mr-0.5" />}
                          {inv.status === "overdue" && <AlertTriangle className="h-3 w-3 mr-0.5" />}
                          {inv.status === "pending" && <Clock className="h-3 w-3 mr-0.5" />}
                          {inv.status}
                        </Badge>
                      </div>

                      {(inv.status === "pending" || inv.status === "overdue") && (
                        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                          <p className="text-xs text-gray-400">
                            {t("dueDate")}: {fmtDateStr(inv.due_date, "d MMM yyyy", locale)}
                          </p>
                          <Button
                            size="sm"
                            className="bg-brand hover:bg-brand-hover text-white rounded-full px-4 text-xs"
                            onClick={() => {
                              setPayInvoiceId(inv.id);
                              setPayFile(null);
                            }}
                          >
                            {t("payNow")}
                          </Button>
                        </div>
                      )}

                      {inv.status === "paid" && inv.paid_at && (
                        <p className="text-[11px] text-gray-400 mt-2">
                          {t("paidOn")} {fmtDateStr(inv.paid_at, "d MMM yyyy", locale)}
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════
          DIALOGS & SHEETS
      ══════════════════════════════════════════════ */}

      {/* ── Confirm Dialog (switch / cancel-switch) ── */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          {confirmDialog?.type === "switch" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("switchConfirmTitle")}</DialogTitle>
                <DialogDescription>
                  {t("switchConfirmDesc", { plan: PLAN_LABELS[confirmDialog.planType || ""] || confirmDialog.planType || "" })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                  {t("cancel")}
                </Button>
                <Button
                  onClick={() => handlePlanSwitch(confirmDialog.planType!)}
                  disabled={switching}
                  className="bg-brand hover:bg-brand-hover"
                >
                  {switching && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("switchConfirmAction")}
                </Button>
              </DialogFooter>
            </>
          )}
          {confirmDialog?.type === "cancelSwitch" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("cancelSwitchTitle")}</DialogTitle>
                <DialogDescription>
                  {t("cancelSwitchDesc", { plan: PLAN_LABELS[confirmDialog.planType || ""] || confirmDialog.planType || "" })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                  {t("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCancelSwitch}
                  disabled={cancelling}
                >
                  {cancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("cancelSwitch")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Top-up Sheet ── */}
      <Sheet open={topupSheetOpen} onOpenChange={setTopupSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-serif">{t("topUp")}</SheetTitle>
            <SheetDescription>{t("topUpDesc")}</SheetDescription>
          </SheetHeader>

          <div className="px-4 py-6 space-y-6">
            {data.platform_payment && (
              <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand mb-3">
                  {t("transferTo")}
                </p>
                {data.platform_payment.payment_display === "qr" && data.platform_payment.promptpay_id && (
                  <p className="text-sm text-gray-700">
                    PromptPay: <span className="font-mono font-medium">{data.platform_payment.promptpay_id}</span>
                  </p>
                )}
                {data.platform_payment.payment_display === "bank" && (
                  <div className="space-y-1 text-sm text-gray-700">
                    {data.platform_payment.bank_name && <p>{data.platform_payment.bank_name}</p>}
                    {data.platform_payment.bank_account_number && (
                      <p className="font-mono font-medium">{data.platform_payment.bank_account_number}</p>
                    )}
                    {data.platform_payment.bank_account_name && <p>{data.platform_payment.bank_account_name}</p>}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleTopup} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm text-gray-700">{t("amount")} (THB)</Label>
                <Input
                  type="number"
                  min="1"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="text-lg font-mono"
                  placeholder="0"
                  required
                />
                <div className="flex gap-2">
                  {[500, 1000, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTopupAmount(String(amt))}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                        topupAmount === String(amt)
                          ? "border-brand/30 bg-brand-50 text-brand"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                      }`}
                    >
                      ฿{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
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
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    topupFile
                      ? "border-brand/30 bg-brand-50/50"
                      : "border-gray-200 hover:border-brand/20 hover:bg-brand-50/20"
                  }`}
                >
                  <Upload className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
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
                className="w-full bg-brand hover:bg-brand-hover"
              >
                {topupLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {t("verifyAndTopUp")}
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Invoice Pay Dialog ── */}
      <Dialog open={!!payInvoiceId} onOpenChange={(open) => { if (!open) { setPayInvoiceId(null); setPayFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("payInvoice")}</DialogTitle>
            <DialogDescription>{t("payInvoiceDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {data.platform_payment && (
              <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand mb-3">
                  {t("transferTo")}
                </p>
                {data.platform_payment.payment_display === "qr" && data.platform_payment.promptpay_id && (
                  <p className="text-sm text-gray-700">
                    PromptPay: <span className="font-mono font-medium">{data.platform_payment.promptpay_id}</span>
                  </p>
                )}
                {data.platform_payment.payment_display === "bank" && (
                  <div className="space-y-1 text-sm text-gray-700">
                    {data.platform_payment.bank_name && <p>{data.platform_payment.bank_name}</p>}
                    {data.platform_payment.bank_account_number && (
                      <p className="font-mono font-medium">{data.platform_payment.bank_account_number}</p>
                    )}
                    {data.platform_payment.bank_account_name && <p>{data.platform_payment.bank_account_name}</p>}
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

          <DialogFooter className="gap-2 sm:gap-0">
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
