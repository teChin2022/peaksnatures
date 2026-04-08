"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
import {
  parseISO,
  format,
  subMonths,
  startOfMonth,
  endOfMonth,
  getDaysInMonth,
  differenceInDays,
} from "date-fns";
import { th as thLocale } from "date-fns/locale";
import {
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Home,
  BedDouble,
  ArrowRight,
  MapPin,
  QrCode,
  Download,
  TrendingUp,
  TrendingDown,
  Star,
  Percent,
  Receipt,
  LogIn,
  BarChart3,
  PieChart,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupProfileModal } from "@/components/setup-profile-modal";
import { getProvinceLabel } from "@/lib/provinces";
import { QRCodeSVG } from "qrcode.react";
import { QuickBookingDialog } from "@/components/dashboard/quick-booking-dialog";

interface HostProfile {
  id: string;
  phone: string | null;
  promptpay_id: string | null;
  hasPinSet: boolean;
}

interface Stats {
  confirmed: number;
  pending: number;
  totalRevenue: number;
  totalBookings: number;
  roomCount: number;
  homestayName: string | null;
  homestaySlug: string | null;
  // Row 1 enhancement
  currentMonthRevenue: number;
  lastMonthRevenue: number;
  // Row 2: insight cards
  occupancyRate: number;
  averageRating: number;
  reviewCount: number;
  averageBookingValue: number;
  todayCheckins: number;
  // Row 3: visual analytics
  monthlyRevenue: { month: string; revenue: number }[];
  statusBreakdown: { status: string; count: number }[];
}

const BAR_COLORS = [
  "bg-brand", "bg-emerald-500", "bg-sky-500",
  "bg-amber-500", "bg-violet-500", "bg-teal-500",
  "bg-rose-400", "bg-indigo-500", "bg-lime-500", "bg-cyan-500",
];

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#10b981",
  completed: "#2F5D50",
  pending: "#f59e0b",
  verified: "#0ea5e9",
  rejected: "#fb7185",
  cancelled: "#d1d5db",
};

const STATUS_BG: Record<string, string> = {
  confirmed: "bg-emerald-500",
  completed: "bg-brand",
  pending: "bg-amber-500",
  verified: "bg-sky-500",
  rejected: "bg-rose-400",
  cancelled: "bg-gray-300",
};

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const ta = useTranslations("auth");
  const tn = useTranslations("dashboardNav");
  const locale = useLocale();
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    confirmed: 0,
    pending: 0,
    totalRevenue: 0,
    totalBookings: 0,
    roomCount: 0,
    homestayName: null,
    homestaySlug: null,
    currentMonthRevenue: 0,
    lastMonthRevenue: 0,
    occupancyRate: 0,
    averageRating: 0,
    reviewCount: 0,
    averageBookingValue: 0,
    todayCheckins: 0,
    monthlyRevenue: [],
    statusBreakdown: [],
  });
  const [provinceStats, setProvinceStats] = useState<{ province: string; count: number }[]>([]);
  const [quickBookingOpen, setQuickBookingOpen] = useState(false);
  const [quickBookingRooms, setQuickBookingRooms] = useState<{ id: string; name: string; price_per_night: number; max_guests: number }[]>([]);
  const [homestayId, setHomestayId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch host profile
      const { data: hostRow } = await supabase
        .from("hosts")
        .select("id, phone, promptpay_id, security_pin_hash")
        .eq("user_id", user.id)
        .single();

      const rawHost = hostRow as { id: string; phone: string | null; promptpay_id: string | null; security_pin_hash: string | null } | null;
      if (rawHost) {
        setHostProfile({
          id: rawHost.id,
          phone: rawHost.phone,
          promptpay_id: rawHost.promptpay_id,
          hasPinSet: !!rawHost.security_pin_hash,
        });
      }
      setProfileLoaded(true);

      if (!rawHost) {
        setLoading(false);
        return;
      }

      // Fetch homestay
      const { data: homestayRow } = await supabase
        .from("homestays")
        .select("id, name, slug")
        .eq("host_id", rawHost.id)
        .limit(1)
        .single();

      const homestay = homestayRow as { id: string; name: string; slug: string } | null;

      if (!homestay) {
        setLoading(false);
        return;
      }

      setHomestayId(homestay.id);

      // Parallel fetch: room count, bookings, room details, reviews
      const [{ count: roomCount }, { data: bookingRows }, { data: roomRows }, { data: reviewRows }] = await Promise.all([
        supabase.from("rooms").select("id", { count: "exact", head: true }).eq("homestay_id", homestay.id),
        supabase.from("bookings").select("status, total_price, amount_paid, payment_type, guest_province, check_in, check_out").eq("homestay_id", homestay.id),
        supabase.from("rooms").select("id, name, quantity, price_per_night, max_guests").eq("homestay_id", homestay.id).eq("is_active", true),
        supabase.from("reviews").select("rating").eq("homestay_id", homestay.id),
      ]);

      const bookings = (bookingRows as { status: string; total_price: number; amount_paid: number; payment_type: string; guest_province: string | null; check_in: string; check_out: string }[]) || [];
      const rooms = (roomRows as { id: string; name: string; quantity: number; price_per_night: number; max_guests: number }[]) || [];
      setQuickBookingRooms(rooms);
      const reviews = (reviewRows as { rating: number }[]) || [];

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const lastMonth = subMonths(now, 1);
      const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

      // Basic counts
      const confirmed = bookings.filter((b) => b.status === "confirmed").length;
      const pending = bookings.filter((b) => b.status === "pending").length;
      const revenueBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
      const totalRevenue = revenueBookings.reduce((sum, b) => sum + b.total_price, 0);

      // Month-over-month revenue
      const currentMonthRevenue = revenueBookings
        .filter((b) => b.check_in.startsWith(currentMonthStr))
        .reduce((sum, b) => sum + b.total_price, 0);
      const lastMonthRevenue = revenueBookings
        .filter((b) => b.check_in.startsWith(lastMonthStr))
        .reduce((sum, b) => sum + b.total_price, 0);

      // Occupancy rate (current month)
      const totalRoomQuantity = rooms.reduce((sum, r) => sum + r.quantity, 0);
      const daysInMonth = getDaysInMonth(now);
      const totalRoomNights = totalRoomQuantity * daysInMonth;
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      const currentMonthBookedNights = revenueBookings.reduce((sum, b) => {
        const ci = parseISO(b.check_in);
        const co = parseISO(b.check_out);
        if (ci > monthEnd || co < monthStart) return sum;
        const overlapStart = ci < monthStart ? monthStart : ci;
        const overlapEnd = co > monthEnd ? monthEnd : co;
        return sum + Math.max(differenceInDays(overlapEnd, overlapStart), 0);
      }, 0);

      const occupancyRate = totalRoomNights > 0
        ? Math.min(Math.round((currentMonthBookedNights / totalRoomNights) * 100), 100)
        : 0;

      // Average rating
      const reviewCount = reviews.length;
      const averageRating = reviewCount > 0
        ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 10) / 10
        : 0;

      // Average booking value
      const confirmedOrCompleted = revenueBookings.length;
      const averageBookingValue = confirmedOrCompleted > 0
        ? Math.round(totalRevenue / confirmedOrCompleted)
        : 0;

      // Today's check-ins
      const todayCheckins = bookings.filter(
        (b) => b.check_in === todayStr && (b.status === "confirmed" || b.status === "completed")
      ).length;

      // Monthly revenue (last 6 months)
      const monthlyRevenue: { month: string; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(now, i);
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
        const rev = revenueBookings
          .filter((b) => b.check_in.startsWith(key))
          .reduce((sum, b) => sum + b.total_price, 0);
        monthlyRevenue.push({ month: key, revenue: rev });
      }

      // Status breakdown
      const statusCounts: Record<string, number> = {};
      bookings.forEach((b) => {
        statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
      });
      const statusBreakdown = Object.entries(statusCounts)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      // Province stats
      const provinceCounts: Record<string, number> = {};
      bookings.forEach((b) => {
        if (b.guest_province) {
          provinceCounts[b.guest_province] = (provinceCounts[b.guest_province] || 0) + 1;
        }
      });
      const sortedProvinces = Object.entries(provinceCounts)
        .map(([province, count]) => ({ province, count }))
        .sort((a, b) => b.count - a.count);
      setProvinceStats(sortedProvinces);

      setStats({
        confirmed,
        pending,
        totalRevenue,
        totalBookings: bookings.length,
        roomCount: roomCount || 0,
        homestayName: homestay.name,
        homestaySlug: homestay.slug,
        currentMonthRevenue,
        lastMonthRevenue,
        occupancyRate,
        averageRating,
        reviewCount,
        averageBookingValue,
        todayCheckins,
        monthlyRevenue,
        statusBreakdown,
      });

      setLoading(false);
    };

    fetchData();
  }, []);

  // Status ring chart gradient
  const ringGradient = (() => {
    const total = stats.statusBreakdown.reduce((s, x) => s + x.count, 0);
    if (total === 0) return "conic-gradient(#e5e7eb 0deg 360deg)";
    let accumulated = 0;
    const segments = stats.statusBreakdown.map((s) => {
      const start = accumulated;
      accumulated += (s.count / total) * 360;
      return `${STATUS_COLORS[s.status] || "#d1d5db"} ${start}deg ${accumulated}deg`;
    });
    return `conic-gradient(${segments.join(", ")})`;
  })();

  // Month-over-month percentage
  const momPct = stats.lastMonthRevenue > 0
    ? Math.round(((stats.currentMonthRevenue - stats.lastMonthRevenue) / stats.lastMonthRevenue) * 100)
    : null;

  const localeOpts = locale === "th" ? { locale: thLocale } : undefined;

  return (
    <div>
      {profileLoaded && hostProfile && (!hostProfile.phone || !hostProfile.promptpay_id || !hostProfile.hasPinSet) && (
        <SetupProfileModal
          hostId={hostProfile.id}
          currentPhone={hostProfile.phone}
          currentPromptpay={hostProfile.promptpay_id}
          hasPinSet={hostProfile.hasPinSet}
          onComplete={() => {
            setHostProfile((prev) =>
              prev ? { ...prev, phone: "set", promptpay_id: "set", hasPinSet: true } : prev
            );
          }}
        />
      )}

      {loading ? (
        /* ── Loading skeletons ── */
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-48" />
          </div>
          {/* Hero stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-2 border border-gray-100">
              <CardContent className="p-8 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-12 w-48" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
            <div className="flex flex-col gap-4">
              {[1, 2].map((i) => (
                <Card key={i} className="flex-1 border border-gray-100">
                  <CardContent className="p-5 flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-6 w-10" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          {/* Insight cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border border-gray-100">
                <CardContent className="p-5 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-2 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Chart skeletons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border border-gray-100">
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-32 w-full rounded-lg" />
              </CardContent>
            </Card>
            <Card className="border border-gray-100">
              <CardContent className="p-6 flex flex-col items-center space-y-3">
                <Skeleton className="h-5 w-40 self-start" />
                <Skeleton className="h-28 w-28 rounded-full" />
              </CardContent>
            </Card>
          </div>
          {/* Quick links */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i} className="border border-gray-100">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Province stats */}
          <Card className="border border-gray-100">
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-5 w-40" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Page Title ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-end justify-between"
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400 mb-0.5">
                {ta("hostDashboard")}
              </p>
              <h1 className="text-xl font-bold text-gray-900">
                {stats.homestayName || ta("hostDashboard")}
              </h1>
            </div>
            {homestayId && quickBookingRooms.length > 0 && (
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => setQuickBookingOpen(true)}
              >
                <Zap className="mr-1.5 h-4 w-4" />
                {t("quickBooking")}
              </Button>
            )}
          </motion.div>

          {homestayId && (
            <QuickBookingDialog
              open={quickBookingOpen}
              onOpenChange={setQuickBookingOpen}
              homestayId={homestayId}
              rooms={quickBookingRooms}
              onSuccess={() => window.location.reload()}
            />
          )}

          {/* ── Row 1: Hero Stats ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Revenue hero — 2-col span */}
            <motion.div
              className="md:col-span-2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="overflow-hidden border border-gray-100 shadow-sm rounded-2xl">
                <div className="relative px-6 py-7 bg-gradient-to-br from-brand-50/60 via-white to-white">
                  <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-brand/5" />
                  <div className="absolute right-14 -bottom-4 h-16 w-16 rounded-full bg-brand/[0.03]" />
                  <div className="relative">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                      {t("totalRevenue")}
                    </p>
                    <span className="text-4xl sm:text-5xl font-bold tracking-tight leading-none text-gray-900">
                      ฿{stats.totalRevenue.toLocaleString()}
                    </span>
                    <p className="text-xs text-gray-400 mt-2">
                      {stats.totalBookings} {t("total")}
                    </p>
                    {momPct !== null && (
                      <div className="flex items-center gap-1 mt-1.5">
                        {momPct >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                        )}
                        <span className={`text-xs font-medium ${momPct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                          {momPct >= 0 ? "+" : ""}{momPct}%
                        </span>
                        <span className="text-xs text-gray-400">{t("vsLastMonth")}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Right column — stacked confirmed + pending */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col gap-4"
            >
              <Card className="flex-1 border border-gray-100 shadow-sm rounded-2xl dashboard-card">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                      {t("confirmed")}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 leading-tight">
                      {stats.confirmed}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="flex-1 border border-gray-100 shadow-sm rounded-2xl dashboard-card">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-[18px] w-[18px] text-amber-500" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                      {t("needsReview")}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 leading-tight">
                      {stats.pending}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* ── Row 2: Insight Cards ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {/* Occupancy Rate */}
            <Card className="border border-gray-100 shadow-sm rounded-2xl dashboard-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-xl bg-brand/8 flex items-center justify-center shrink-0">
                    <Percent className="h-4 w-4 text-brand" />
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 leading-tight">
                    {t("occupancyRate")}
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900 leading-tight">
                  {stats.occupancyRate}%
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{t("thisMonth")}</p>
              </CardContent>
            </Card>

            {/* Average Rating */}
            <Card className="border border-gray-100 shadow-sm rounded-2xl dashboard-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Star className="h-4 w-4 text-amber-500" />
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 leading-tight">
                    {t("averageRating")}
                  </p>
                </div>
                {stats.reviewCount > 0 ? (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-gray-900 leading-tight">
                        {stats.averageRating.toFixed(1)}
                      </span>
                      <span className="text-amber-400 text-lg">★</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {t("reviewsCount", { count: stats.reviewCount })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-300 mt-1">{t("noReviews")}</p>
                )}
              </CardContent>
            </Card>

            {/* Average Booking Value */}
            <Card className="border border-gray-100 shadow-sm rounded-2xl dashboard-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                    <Receipt className="h-4 w-4 text-violet-500" />
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 leading-tight">
                    {t("avgBookingValue")}
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900 leading-tight">
                  ฿{stats.averageBookingValue.toLocaleString()}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{t("perBooking")}</p>
              </CardContent>
            </Card>

            {/* Today's Check-ins */}
            <Card className="border border-gray-100 shadow-sm rounded-2xl dashboard-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                    <LogIn className="h-4 w-4 text-sky-500" />
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 leading-tight">
                    {t("todayCheckins")}
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900 leading-tight">
                  {stats.todayCheckins}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{t("arrivals")}</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Row 3: Visual Analytics ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* Monthly Revenue Bar Chart */}
            <Card className="border border-gray-100 shadow-sm rounded-2xl">
              <CardHeader className="pb-2 px-6 pt-5">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <BarChart3 className="h-4 w-4 text-brand" />
                  {t("monthlyRevenue")}
                </CardTitle>
                <p className="text-[11px] text-gray-400">{t("last6Months")}</p>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                {stats.monthlyRevenue.some((m) => m.revenue > 0) ? (
                  <div className="flex items-end gap-2 h-32">
                    {stats.monthlyRevenue.map((m, i) => {
                      const maxRev = Math.max(...stats.monthlyRevenue.map((x) => x.revenue));
                      const pct = maxRev > 0 ? (m.revenue / maxRev) * 100 : 0;
                      const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
                      const isCurrent = m.month === currentMonthKey;
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] text-gray-400 tabular-nums truncate">
                            {m.revenue > 0
                              ? m.revenue >= 1000
                                ? `฿${(m.revenue / 1000).toFixed(0)}k`
                                : `฿${m.revenue}`
                              : ""}
                          </span>
                          <div className="w-full flex-1 flex items-end">
                            <motion.div
                              className={`w-full rounded-t-md ${isCurrent ? "bg-brand" : "bg-brand/25"}`}
                              initial={{ height: 0 }}
                              animate={{ height: `${Math.max(pct, 3)}%` }}
                              transition={{ duration: 0.6, delay: 0.5 + i * 0.08, ease: "easeOut" }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {format(parseISO(m.month + "-01"), "MMM", localeOpts)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-300 text-center py-8">{t("noChartData")}</p>
                )}
              </CardContent>
            </Card>

            {/* Booking Status Ring Chart */}
            <Card className="border border-gray-100 shadow-sm rounded-2xl">
              <CardHeader className="pb-2 px-6 pt-5">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <PieChart className="h-4 w-4 text-brand" />
                  {t("statusBreakdown")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                {stats.statusBreakdown.length > 0 ? (
                  <div className="flex items-center gap-6">
                    {/* Ring */}
                    <div className="shrink-0">
                      <div
                        className="w-24 h-24 rounded-full relative"
                        style={{ background: ringGradient }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center">
                            <span className="text-sm font-bold text-gray-900">{stats.totalBookings}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Legend */}
                    <div className="flex-1 space-y-1.5">
                      {stats.statusBreakdown.map((s) => {
                        const statusKey = `status${s.status.charAt(0).toUpperCase()}${s.status.slice(1)}` as
                          "statusPending" | "statusVerified" | "statusConfirmed" | "statusRejected" | "statusCancelled" | "statusCompleted";
                        return (
                          <div key={s.status} className="flex items-center gap-2 text-sm">
                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_BG[s.status] || "bg-gray-300"}`} />
                            <span className="text-gray-600 flex-1 truncate">{t(statusKey)}</span>
                            <span className="text-xs text-gray-400 tabular-nums font-medium">{s.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-300 text-center py-8">{t("noChartData")}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Quick Links ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <Card className="border border-gray-100 shadow-sm rounded-2xl dashboard-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                      <CalendarDays className="h-[18px] w-[18px] text-violet-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tn("bookings")}</p>
                      <p className="text-sm text-gray-400">
                        {stats.totalBookings} {t("total")}
                      </p>
                    </div>
                  </div>
                  <Link href="/dashboard/bookings">
                    <Button variant="ghost" size="sm" className="text-gray-300 hover:text-brand">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-100 shadow-sm rounded-2xl dashboard-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                      <Home className="h-[18px] w-[18px] text-orange-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {stats.homestayName || tn("homestay")}
                      </p>
                      <p className="text-sm text-gray-400">
                        <BedDouble className="mr-1 inline h-3.5 w-3.5" />
                        {stats.roomCount} {tn("rooms")}
                      </p>
                    </div>
                  </div>
                  <Link href="/dashboard/homestay">
                    <Button variant="ghost" size="sm" className="text-gray-300 hover:text-brand">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── QR Code ── */}
          {stats.homestaySlug && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.55 }}
            >
              <Card className="border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
                <div className="flex flex-col sm:flex-row items-center gap-6 p-6">
                  <div className="shrink-0 rounded-xl bg-gray-50 p-4">
                    <QRCodeSVG
                      id="checkin-qr"
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/${stats.homestaySlug}`}
                      size={120}
                      fgColor="#2F5D50"
                      level="M"
                    />
                  </div>
                  <div className="flex flex-col gap-2 text-center sm:text-left">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2 justify-center sm:justify-start">
                      <QrCode className="h-4 w-4 text-brand" />
                      {t("qrCodeTitle")}
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{t("qrCodeDesc")}</p>
                    <ol className="text-xs text-gray-400 space-y-0.5 list-decimal list-inside">
                      <li>{t("qrStep1")}</li>
                      <li>{t("qrStep2")}</li>
                      <li>{t("qrStep3")}</li>
                    </ol>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-fit self-center sm:self-start rounded-full"
                      onClick={() => {
                        const svg = document.getElementById("checkin-qr");
                        if (!svg) return;
                        const svgData = new XMLSerializer().serializeToString(svg);
                        const canvas = document.createElement("canvas");
                        canvas.width = 400;
                        canvas.height = 400;
                        const ctx = canvas.getContext("2d");
                        const img = new Image();
                        img.onload = () => {
                          ctx?.drawImage(img, 0, 0, 400, 400);
                          const a = document.createElement("a");
                          a.download = `${stats.homestaySlug}-qr.png`;
                          a.href = canvas.toDataURL("image/png");
                          a.click();
                        };
                        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
                      }}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      {t("qrDownload")}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {/* ── Province Stats ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65 }}
          >
            <Card className="border border-gray-100 shadow-sm rounded-2xl">
              <CardHeader className="pb-3 px-6 pt-6">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <MapPin className="h-4 w-4 text-brand" />
                  {t("provinceStats")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                {provinceStats.length === 0 ? (
                  <p className="text-sm text-gray-400">{t("noProvinceData")}</p>
                ) : (
                  <div className="space-y-3">
                    {provinceStats.slice(0, 10).map((ps, i) => {
                      const maxCount = provinceStats[0].count;
                      const pct = Math.round((ps.count / maxCount) * 100);
                      const barColor = BAR_COLORS[i % BAR_COLORS.length];
                      return (
                        <div key={ps.province} className="flex items-center gap-3 text-sm">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${barColor}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-gray-700 truncate">
                                {getProvinceLabel(ps.province, locale)}
                              </span>
                              <span className="text-xs text-gray-400 ml-2 tabular-nums">
                                {ps.count}
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-gray-100">
                              <motion.div
                                className={`h-1.5 rounded-full ${barColor}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6, delay: 0.7 + i * 0.05, ease: "easeOut" }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  );
}
