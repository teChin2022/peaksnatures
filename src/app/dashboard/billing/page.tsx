"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { fmtDateStr } from "@/lib/format-date";
import generatePayload from "promptpay-qr";
import { QRCodeSVG } from "qrcode.react";
import { InvoicePayDialog } from "@/components/dashboard/invoice-pay-dialog";
import { PlanActivationDialog, type PlanQuote } from "@/components/dashboard/plan-activation-dialog";
import { TOPUP_AMOUNTS } from "@/lib/topup-amounts";
import { LOW_WALLET_THRESHOLD } from "@/lib/billing";
import {
  Wallet,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Upload,
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

interface TermTier {
  months: number;
  discount_pct: number;
}

interface BillingData {
  plan_type: string;
  plan_free_expires_at: string | null;
  plan_pending_type: string | null;
  plan_pending_effective_at: string | null;
  plan_pending_term_months: number | null;
  wallet_balance: number;
  effective_commission_pct: number | null;
  effective_fixed_rate: number | null;
  fixed_rate_term_months: number | null;
  fixed_rate_term_started_at: string | null;
  fixed_rate_term_ends_at: string | null;
  fixed_rate_term_tiers: TermTier[];
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

const PLAN_LABEL_KEYS: Record<string, string> = {
  free: "freePlan",
  commission: "commissionPlan",
  fixed_rate: "fixedRatePlan",
};

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
  const planLabel = (key: string) => t(PLAN_LABEL_KEYS[key] || "freePlan");
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [topupSheetOpen, setTopupSheetOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupFile, setTopupFile] = useState<File | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  // Fallback amount for an invoice the switch API surfaced — data.invoices only
  // holds the last 5, so the blocking invoice isn't guaranteed to be in there.
  const [payInvoiceAmount, setPayInvoiceAmount] = useState<number | null>(null);
  // Plan the host was switching to when the empty-wallet gate stopped them.
  const [pendingSwitch, setPendingSwitch] = useState<{ planType: string; termMonths?: number } | null>(null);
  // The 402 quote from /plan/switch. Nothing is persisted server-side until
  // the host pays, so closing the dialog needs no cleanup.
  const [planQuote, setPlanQuote] = useState<PlanQuote | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "switch" | "cancelSwitch";
    planType?: string;
    termMonths?: number;
  } | null>(null);
  const [termPickerOpen, setTermPickerOpen] = useState(false);
  const [selectedTermMonths, setSelectedTermMonths] = useState<number | null>(null);
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const handlePlanSwitch = async (planType: string, termMonths?: number) => {
    setSwitching(true);
    try {
      const res = await fetch("/api/host/plan/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_type: planType,
          ...(termMonths ? { term_months: termMonths } : {}),
        }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(d.applied_immediately ? t("switchAppliedImmediate") : t("switchScheduled"));
        fetchBilling();
        window.dispatchEvent(new Event("host:plan-changed"));
      } else {
        const d = await res.json();
        // The two billing blockers aren't dead ends — send the host straight to
        // the action that unblocks them instead of a toast they can't act on.
        if (d.error === "UNPAID_INVOICE") {
          setConfirmDialog(null);
          setPayInvoiceAmount(d.amount ?? null);
          setPayInvoiceId(d.invoice_id);
          toast.error(t("unpaidInvoiceDesc"));
          return;
        }
        if (d.error === "WALLET_LOW") {
          setConfirmDialog(null);
          // Remember the intent so a successful top-up completes the switch the
          // host originally asked for, rather than making them start over.
          setPendingSwitch({ planType, termMonths });
          setTopupSheetOpen(true);
          toast.error(t("walletLowDesc", { required: d.required ?? LOW_WALLET_THRESHOLD }));
          return;
        }
        // Fixed Rate is paid for before it starts: the switch only quotes, and
        // the activation dialog is what actually changes the plan.
        if (d.error === "PAYMENT_REQUIRED") {
          setConfirmDialog(null);
          setPlanQuote(d as PlanQuote);
          return;
        }
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
        window.dispatchEvent(new Event("host:plan-changed"));
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

        // Finish the switch the host was blocked on, now that funds are in.
        setPendingSwitch(null);
        if (pendingSwitch && d.new_balance >= LOW_WALLET_THRESHOLD) {
          await handlePlanSwitch(pendingSwitch.planType, pendingSwitch.termMonths);
          return;
        }
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

  const todayStr = new Date().toISOString().split("T")[0];
  const isPastFreeExpiry = Boolean(
    data.plan_type === "free" &&
      data.plan_free_expires_at &&
      new Date(data.plan_free_expires_at) < new Date(),
  );
  const isFreeExpired = isPastFreeExpiry && !data.plan_pending_type;
  const hasActiveTerm = Boolean(
    data.plan_type === "fixed_rate" &&
      data.fixed_rate_term_months &&
      data.fixed_rate_term_months > 1 &&
      data.fixed_rate_term_ends_at &&
      data.fixed_rate_term_ends_at >= todayStr,
  );

  const handlePlanCtaClick = (planKey: string) => {
    if (planKey === "fixed_rate") {
      setSelectedTermMonths(null);
      setTermPickerOpen(true);
      return;
    }
    setConfirmDialog({ type: "switch", planType: planKey });
  };

  const monthlyRate = data.effective_fixed_rate ?? 0;
  const computeTermTotal = (months: number, discountPct: number) =>
    Math.round(monthlyRate * months * (1 - discountPct / 100));

  const daysUntilTermEnd = data.fixed_rate_term_ends_at
    ? Math.ceil(
        (new Date(data.fixed_rate_term_ends_at).getTime() - new Date(todayStr).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;
  // Days the host would forfeit by leaving Fixed Rate now, counting today —
  // matching how the server records forfeited_days in the audit log.
  const forfeitDays = Math.max((daysUntilTermEnd ?? 0) + 1, 0);
  const termExpired = data.fixed_rate_term_ends_at
    ? data.fixed_rate_term_ends_at < todayStr
    : true;
  const currentDiscountPct = (() => {
    const tier = (data.fixed_rate_term_tiers || []).find(
      (t) => t.months === data.fixed_rate_term_months,
    );
    return tier ? tier.discount_pct : 0;
  })();

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
                  {data.plan_pending_type === "fixed_rate" && data.plan_type === "fixed_rate" ? (
                    <>
                      {t("pendingRenewal", {
                        months: data.plan_pending_term_months ?? 0,
                        date: data.plan_pending_effective_at
                          ? fmtDateStr(data.plan_pending_effective_at, "d MMM yyyy", locale)
                          : "",
                      })}
                    </>
                  ) : (
                    <>
                      {t("pendingSwitch")}{" "}
                      <strong>{planLabel(data.plan_pending_type)}</strong>{" "}
                      {t("effectiveOn")}{" "}
                      {data.plan_pending_effective_at && fmtDateStr(data.plan_pending_effective_at, "d MMM yyyy", locale)}
                    </>
                  )}
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
          const canSwitch = !isCurrent && !data.plan_pending_type && !switching && plan.key !== "free";
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
                  {planLabel(plan.key)}
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
                  onClick={() => canSwitch && handlePlanCtaClick(plan.key)}
                  disabled={!canSwitch}
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center transition-colors mt-auto disabled:opacity-50 disabled:cursor-not-allowed ${
                    isPopular && !isCurrent
                      ? "bg-brand text-white hover:bg-brand-hover"
                      : "bg-earth-50 text-earth-800 hover:bg-earth-100"
                  }`}
                >
                  {t("switchToPlan", { plan: planLabel(plan.key) })}
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

      {/* ── Plan Detail Card ── */}
      {data.plan_type === "free" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-earth-50/60 via-white to-earth-50/40 px-6 pt-6 pb-8">
              <div className="flex items-center gap-2 mb-6">
                <Leaf className="h-4 w-4 text-earth-600" />
                <span className="text-sm font-medium text-gray-600">{t("freePlan")}</span>
              </div>
              <div className="text-center">
                <p className="text-4xl sm:text-5xl font-serif tracking-tight text-gray-900">฿0</p>
                <p className="text-sm text-earth-400 mt-1">/{locale === "th" ? "เดือน" : "month"}</p>
                {data.plan_free_expires_at && (
                  <p className="text-sm text-earth-500 mt-3">
                    {t("expiresOn")} {fmtDateStr(data.plan_free_expires_at, "d MMM yyyy", locale)}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {data.plan_type === "commission" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-brand-50/60 via-white to-brand-50/40 px-6 pt-6 pb-8">
              <div className="flex items-center gap-2 mb-6">
                <Percent className="h-4 w-4 text-brand" />
                <span className="text-sm font-medium text-gray-600">{t("commissionPlan")}</span>
              </div>
              <div className="text-center">
                <p className="text-4xl sm:text-5xl font-serif tracking-tight text-gray-900">
                  {data.effective_commission_pct ?? 0}%
                </p>
                <p className="text-sm text-earth-400 mt-1">/{locale === "th" ? "การจอง" : "booking"}</p>
                <p className="text-sm text-earth-500 mt-3">
                  {locale === "th"
                    ? "จ่ายตามการใช้งาน เหมาะสำหรับโฮสต์ตามฤดูกาล"
                    : "Pay as you go. Best for seasonal or occasional hosts."}
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {data.plan_type === "fixed_rate" && (() => {
        const pendingInvoice = data.invoices.find((inv) => inv.status === "pending" || inv.status === "overdue");
        const paymentAmount = pendingInvoice?.amount ?? data.effective_fixed_rate ?? 0;

        return (
          <>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-br from-brand-50/60 via-white to-brand-50/40 px-6 pt-6 pb-8">
                  <div className="flex items-center gap-2 mb-6">
                    <CalendarClock className="h-4 w-4 text-earth-700" />
                    <span className="text-sm font-medium text-gray-600">{t("fixedRatePlan")}</span>
                  </div>

                  {/* Term summary — always visible for fixed_rate hosts */}
                  {data.fixed_rate_term_months && data.fixed_rate_term_started_at && data.fixed_rate_term_ends_at && (
                    <div className="mb-5 rounded-xl border border-earth-100 bg-white/60 px-4 py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm font-medium text-earth-900">
                          {t("nMonths", { n: data.fixed_rate_term_months })} {t("termSuffix")}
                        </p>
                        {currentDiscountPct > 0 && (
                          <span className="bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2 rounded-full">
                            {t("saveX", { pct: currentDiscountPct })}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-earth-500">
                        <div>
                          <p className="uppercase tracking-wider text-[10px] text-earth-400">{t("termStartsOn")}</p>
                          <p className="text-earth-700 mt-0.5">{fmtDateStr(data.fixed_rate_term_started_at, "d MMM yyyy", locale)}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-wider text-[10px] text-earth-400">{t("termEndsOn")}</p>
                          <p className="text-earth-700 mt-0.5">{fmtDateStr(data.fixed_rate_term_ends_at, "d MMM yyyy", locale)}</p>
                        </div>
                      </div>
                      {daysUntilTermEnd != null && !termExpired && (
                        <p className={`mt-2 text-xs ${daysUntilTermEnd <= 14 ? "text-amber-700" : "text-earth-400"}`}>
                          {t("daysLeft", { n: daysUntilTermEnd })}
                        </p>
                      )}
                      {termExpired && (
                        <p className="mt-2 text-xs text-red-600">{t("termExpired")}</p>
                      )}
                      {!data.plan_pending_type && (
                        <Button
                          size="sm"
                          className="mt-3 bg-brand hover:bg-brand-hover text-white"
                          onClick={() => { setSelectedTermMonths(null); setTermPickerOpen(true); }}
                        >
                          {t("renewTerm")}
                          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                      )}
                    </div>
                  )}

                  {pendingInvoice ? (
                    <div className="space-y-5">
                      {/* PromptPay QR / Bank Details */}
                      <div className="flex flex-col items-center p-5 bg-white rounded-2xl border border-earth-100">
                        {data.platform_payment?.payment_display === "bank" && data.platform_payment.bank_name && data.platform_payment.bank_account_number ? (
                          <>
                            <p className="text-sm text-earth-500 mb-3">{t("transferTo")}</p>
                            <div className="w-full space-y-2 bg-earth-50 rounded-xl p-4 border border-earth-100">
                              <div className="flex justify-between text-sm">
                                <span className="text-earth-500">{locale === "th" ? "ธนาคาร" : "Bank"}</span>
                                <span className="font-medium text-earth-900">{data.platform_payment.bank_name}</span>
                              </div>
                              <div className="border-t border-earth-200" />
                              <div className="flex justify-between text-sm">
                                <span className="text-earth-500">{locale === "th" ? "เลขบัญชี" : "Account No."}</span>
                                <span className="font-mono font-medium text-earth-900">{data.platform_payment.bank_account_number}</span>
                              </div>
                              <div className="border-t border-earth-200" />
                              <div className="flex justify-between text-sm">
                                <span className="text-earth-500">{locale === "th" ? "ชื่อบัญชี" : "Account Name"}</span>
                                <span className="font-medium text-earth-900">{data.platform_payment.bank_account_name}</span>
                              </div>
                            </div>
                          </>
                        ) : data.platform_payment?.promptpay_id ? (
                          <>
                            <p className="text-sm text-earth-500 mb-3">{locale === "th" ? "สแกน QR เพื่อชำระเงิน" : "Scan QR to pay"}</p>
                            <div className="bg-white p-3 rounded-2xl shadow-sm border border-earth-100">
                              <QRCodeSVG value={generatePayload(data.platform_payment.promptpay_id, { amount: paymentAmount })} size={160} level="M" />
                            </div>
                            {data.platform_payment.bank_account_name && (
                              <p className="mt-3 text-sm font-medium text-earth-700">{data.platform_payment.bank_account_name}</p>
                            )}
                            <p className="text-xs text-earth-400">{locale === "th" ? "พร้อมเพย์" : "PromptPay"}: {data.platform_payment.promptpay_id}</p>
                          </>
                        ) : null}

                        <p className="mt-3 text-2xl font-bold text-earth-900">฿{paymentAmount.toLocaleString()}</p>
                        <p className="text-xs text-earth-400 mt-0.5">
                          {fmtDateStr(pendingInvoice.period_start, "d MMM", locale)} — {fmtDateStr(pendingInvoice.period_end, "d MMM yyyy", locale)}
                        </p>
                        {pendingInvoice.status === "overdue" && (
                          <Badge className="mt-2 bg-red-100 text-red-700 rounded-full text-[11px] font-medium">
                            <AlertTriangle className="h-3 w-3 mr-0.5" />
                            {locale === "th" ? "เลยกำหนดชำระ" : "Overdue"}
                          </Badge>
                        )}
                        <p className="text-xs text-earth-400 mt-1">
                          {t("dueDate")}: {fmtDateStr(pendingInvoice.due_date, "d MMM yyyy", locale)}
                        </p>
                      </div>

                      {/* Pay → opens the shared invoice pay dialog */}
                      <Button
                        className="w-full bg-brand hover:bg-brand-hover text-white rounded-full py-3 text-sm font-semibold"
                        onClick={() => setPayInvoiceId(pendingInvoice.id)}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {t("payNow")}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-4xl sm:text-5xl font-serif tracking-tight text-gray-900">
                        ฿{(data.effective_fixed_rate ?? 0).toLocaleString()}
                      </p>
                      <p className="text-sm text-earth-400 mt-1">/{locale === "th" ? "เดือน" : "month"}</p>
                      <p className="text-sm text-earth-500 mt-3">
                        {locale === "th" ? "ไม่มีใบแจ้งหนี้ค้างชำระ" : "No pending invoices"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Invoice History */}
                {data.invoices.length > 0 && (
                  <CardContent className="px-6 pb-6 pt-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
                      {t("invoices")}
                    </p>
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

                          {inv.status === "paid" && inv.paid_at && (
                            <p className="text-[11px] text-gray-400 mt-2">
                              {t("paidOn")} {fmtDateStr(inv.paid_at, "d MMM yyyy", locale)}
                            </p>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            </motion.div>
          </>
        );
      })()}

      {/* ══════════════════════════════════════════════
          DIALOGS & SHEETS
      ══════════════════════════════════════════════ */}

      {/* ── Confirm Dialog (switch / cancel-switch) ── */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          {confirmDialog?.type === "switch" && (() => {
            const showLeaveTermWarning =
              hasActiveTerm && confirmDialog.planType !== "fixed_rate";
            const isFixedRateSwitch = confirmDialog.planType === "fixed_rate";
            const isRenewal =
              isFixedRateSwitch && data.plan_type === "fixed_rate";
            const renewalEffectiveDate = data.fixed_rate_term_ends_at
              ? (() => {
                  const end = new Date(data.fixed_rate_term_ends_at);
                  const next = new Date(
                    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1),
                  );
                  return fmtDateStr(next.toISOString().split("T")[0], "d MMM yyyy", locale);
                })()
              : "";
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {isRenewal
                      ? t("renewConfirmTitle")
                      : showLeaveTermWarning
                        ? t("switchFromActiveTermTitle")
                        : t("switchConfirmTitle")}
                  </DialogTitle>
                  <DialogDescription>
                    {isRenewal
                      ? t("renewConfirmDesc", {
                          months: confirmDialog.termMonths ?? 0,
                          date: renewalEffectiveDate,
                        })
                      : showLeaveTermWarning
                        ? t("switchFromActiveTermDesc", {
                            months: data.fixed_rate_term_months ?? 0,
                            endDate: data.fixed_rate_term_ends_at
                              ? fmtDateStr(data.fixed_rate_term_ends_at, "d MMM yyyy", locale)
                              : "",
                            plan: planLabel(confirmDialog.planType || ""),
                          })
                        : t(isFixedRateSwitch ? "switchConfirmDescFixedRate" : "switchConfirmDesc", {
                            plan: planLabel(confirmDialog.planType || ""),
                          })}
                  </DialogDescription>
                </DialogHeader>
                {showLeaveTermWarning && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      {t("switchFromActiveTermWarning", { days: forfeitDays })}
                    </p>
                  </div>
                )}
                {isRenewal && confirmDialog.termMonths && (
                  <div className="rounded-xl border border-earth-200 bg-earth-50 px-4 py-3 text-sm text-earth-700">
                    {t("termSummaryLine", {
                      months: confirmDialog.termMonths,
                      total: computeTermTotal(
                        confirmDialog.termMonths,
                        (data.fixed_rate_term_tiers.find((t) => t.months === confirmDialog.termMonths)
                          ?.discount_pct) || 0,
                      ).toLocaleString(),
                    })}
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                    {t("cancel")}
                  </Button>
                  <Button
                    onClick={() =>
                      handlePlanSwitch(
                        confirmDialog.planType!,
                        confirmDialog.termMonths,
                      )
                    }
                    disabled={switching}
                    className={
                      showLeaveTermWarning
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-brand hover:bg-brand-hover"
                    }
                  >
                    {switching && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {t("switchConfirmAction")}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
          {confirmDialog?.type === "cancelSwitch" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("cancelSwitchTitle")}</DialogTitle>
                <DialogDescription>
                  {t("cancelSwitchDesc", { plan: planLabel(confirmDialog.planType || "") })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
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

      {/* ── Term Picker Dialog (Fixed Rate term selection) ── */}
      <Dialog open={termPickerOpen} onOpenChange={(open) => { if (!open) { setTermPickerOpen(false); setSelectedTermMonths(null); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("chooseTerm")}</DialogTitle>
            <DialogDescription>{t("chooseTermDesc")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            {(data.fixed_rate_term_tiers || []).map((tier) => {
              const total = computeTermTotal(tier.months, tier.discount_pct);
              const perMonth = tier.months > 0 ? Math.round(total / tier.months) : 0;
              const isSelected = selectedTermMonths === tier.months;
              return (
                <button
                  key={tier.months}
                  type="button"
                  onClick={() => setSelectedTermMonths(tier.months)}
                  className={`relative text-left rounded-2xl border-2 p-4 transition-colors ${
                    isSelected
                      ? "border-brand bg-brand-50/60"
                      : "border-earth-100 hover:border-earth-300 hover:bg-earth-50/30"
                  }`}
                >
                  {tier.discount_pct > 0 && (
                    <span className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2 rounded-full">
                      {t("saveX", { pct: tier.discount_pct })}
                    </span>
                  )}
                  <p className="font-serif text-lg text-gray-900">
                    {t("nMonths", { n: tier.months })}
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-earth-900 mt-1">
                    ฿{total.toLocaleString()}
                  </p>
                  <p className="text-xs text-earth-500 mt-0.5">
                    ≈ ฿{perMonth.toLocaleString()} {t("perMonth")}
                  </p>
                </button>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setTermPickerOpen(false); setSelectedTermMonths(null); }}>
              {t("cancel")}
            </Button>
            <Button
              disabled={!selectedTermMonths}
              onClick={() => {
                if (!selectedTermMonths) return;
                setTermPickerOpen(false);
                setConfirmDialog({ type: "switch", planType: "fixed_rate", termMonths: selectedTermMonths });
              }}
              className="bg-brand hover:bg-brand-hover"
            >
              {t("continue")}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Top-up Sheet ── */}
      <Sheet
        open={topupSheetOpen}
        onOpenChange={(open) => {
          // Dismissing the sheet abandons the switch — don't resurrect it on
          // some unrelated top-up later.
          if (!open) setPendingSwitch(null);
          setTopupSheetOpen(open);
        }}
      >
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-serif">{t("topUp")}</SheetTitle>
            <SheetDescription>{t("topUpDesc")}</SheetDescription>
          </SheetHeader>

          <div className="px-4 py-6 space-y-6">
            {data.wallet_balance < LOW_WALLET_THRESHOLD && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">{t("walletLowTitle")}</p>
                <p className="text-sm text-amber-700 mt-1">
                  {t("walletLowDesc", { required: LOW_WALLET_THRESHOLD })}
                </p>
              </div>
            )}

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
                <div className="flex gap-2">
                  {TOPUP_AMOUNTS.map((amt) => (
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

      {/* Invoice pay dialog (shared with the Wallet page) */}
      <InvoicePayDialog
        open={!!payInvoiceId}
        onOpenChange={(o) => { if (!o) { setPayInvoiceId(null); setPayInvoiceAmount(null); } }}
        invoiceId={payInvoiceId}
        amount={data.invoices.find((inv) => inv.id === payInvoiceId)?.amount ?? payInvoiceAmount ?? 0}
        platformPayment={data.platform_payment}
        onPaid={fetchBilling}
      />

      {/* Pay-then-activate dialog for Fixed Rate */}
      <PlanActivationDialog
        open={!!planQuote}
        onOpenChange={(o) => { if (!o) setPlanQuote(null); }}
        quote={planQuote}
        platformPayment={data.platform_payment}
        monthlyRate={monthlyRate}
        onActivated={() => {
          setPlanQuote(null);
          fetchBilling();
          window.dispatchEvent(new Event("host:plan-changed"));
        }}
      />
    </div>
  );
}
