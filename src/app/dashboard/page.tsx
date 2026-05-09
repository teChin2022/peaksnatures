"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
import {
  parseISO,
  format,
  subMonths,
  subDays,
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
  TrendingUp,
  TrendingDown,
  DollarSign,
  LogIn,
  Percent,
  XCircle,
  Compass,
  Zap,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupProfileModal } from "@/components/setup-profile-modal";
import { getProvinceLabel } from "@/lib/provinces";
import { getInitials } from "@/lib/utils";
import { QuickBookingDialog } from "@/components/dashboard/quick-booking-dialog";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface HostProfile {
  id: string;
  hasPhone: boolean;
  hasPromptpay: boolean;
  hasPinSet: boolean;
}

interface Stats {
  homestayName: string | null;
  homestaySlug: string | null;
  // Overview
  totalRevenue: number;
  totalBookings: number;
  occupancyRate: number;
  todayCheckins: number;
  // Changes
  revenuePctChange: number | null;
  bookingsPctChange: number | null;
  occupancyPctChange: number | null;
  checkinsDelta: number;
  // Charts
  monthlyRevenue: { month: string; label: string; revenue: number }[];
  bookingsByRoom: { name: string; count: number }[];
  recentBookings: { id: string; guest_name: string; guest_email: string; status: string; total_price: number }[];
  currentMonthBookingCount: number;
  // Insights
  adr: number;
  revpar: number;
  cancelledCount: number;
  directBookingPct: number;
  adrPctChange: number | null;
  revparPctChange: number | null;
  cancelledDelta: number;
  directPctChange: number | null;
  bookingsBySource: { name: string; value: number }[];
  provinceDistribution: { name: string; value: number }[];
  // Quick links
  roomCount: number;
  confirmed: number;
  pending: number;
}

const AVATAR_COLORS = [
  "bg-brand", "bg-emerald-500", "bg-sky-500",
  "bg-amber-500", "bg-violet-500", "bg-teal-500",
  "bg-rose-400", "bg-indigo-500",
];

const CHART_COLORS = ["#2F5D50", "#3d7a6a", "#5a9485", "#7db0a3", "#a0ccc0", "#c3e2db", "#d9ede9", "#eef6f4"];

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-emerald-500 text-white",
  completed: "bg-brand text-white",
  pending: "border border-gray-300 text-gray-600",
  verified: "bg-sky-500 text-white",
  rejected: "bg-rose-50 text-rose-600",
  cancelled: "bg-rose-50 text-rose-600",
};

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const ta = useTranslations("auth");
  const locale = useLocale();
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "insights">("overview");
  const [homestayId, setHomestayId] = useState<string | null>(null);
  const [quickBookingOpen, setQuickBookingOpen] = useState(false);
  const [quickBookingRooms, setQuickBookingRooms] = useState<{ id: string; name: string; price_per_night: number; max_guests: number }[]>([]);
  const [stats, setStats] = useState<Stats>({
    homestayName: null, homestaySlug: null,
    totalRevenue: 0, totalBookings: 0, occupancyRate: 0, todayCheckins: 0,
    revenuePctChange: null, bookingsPctChange: null, occupancyPctChange: null, checkinsDelta: 0,
    monthlyRevenue: [], bookingsByRoom: [], recentBookings: [], currentMonthBookingCount: 0,
    adr: 0, revpar: 0, cancelledCount: 0, directBookingPct: 0,
    adrPctChange: null, revparPctChange: null, cancelledDelta: 0, directPctChange: null,
    bookingsBySource: [], provinceDistribution: [],
    roomCount: 0, confirmed: 0, pending: 0,
  });

  const localeOpts = locale === "th" ? { locale: thLocale } : undefined;

  useEffect(() => {
    const ctrl = new AbortController();
    const { signal } = ctrl;

    const fetchData = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (signal.aborted || !user) return;

      const profileRes = await fetch("/api/host/profile", { signal });
      if (signal.aborted) return;
      const profile = profileRes.ok ? await profileRes.json() : null;
      if (signal.aborted) return;

      if (profile) {
        setHostProfile({
          id: profile.id,
          hasPhone: profile.hasPhone,
          hasPromptpay: profile.hasPromptpay,
          hasPinSet: profile.hasPinSet,
        });
      }
      setProfileLoaded(true);
      if (!profile) { setLoading(false); return; }

      const { data: homestayRow } = await supabase
        .from("homestays")
        .select("id, name, slug")
        .eq("host_id", profile.id)
        .limit(1)
        .single();
      if (signal.aborted) return;

      const homestay = homestayRow as { id: string; name: string; slug: string } | null;
      if (!homestay) { setLoading(false); return; }
      setHomestayId(homestay.id);

      // Parallel fetch
      const [{ count: roomCount }, { data: bookingRows }, { data: roomRows }, { data: recentRows }] = await Promise.all([
        supabase.from("rooms").select("id", { count: "exact", head: true }).eq("homestay_id", homestay.id),
        supabase.from("bookings").select("status, total_price, guest_province, check_in, check_out, room_id, booking_source").eq("homestay_id", homestay.id),
        supabase.from("rooms").select("id, name, quantity, price_per_night, max_guests").eq("homestay_id", homestay.id).eq("is_active", true),
        supabase.from("bookings").select("id, guest_name, guest_email, status, total_price").eq("homestay_id", homestay.id).order("created_at", { ascending: false }).limit(5),
      ]);
      if (signal.aborted) return;

      const bookings = (bookingRows as { status: string; total_price: number; guest_province: string | null; check_in: string; check_out: string; room_id: string | null; booking_source: string }[]) || [];
      const rooms = (roomRows as { id: string; name: string; quantity: number; price_per_night: number; max_guests: number }[]) || [];
      setQuickBookingRooms(rooms);
      const recent = (recentRows as { id: string; guest_name: string; guest_email: string; status: string; total_price: number }[]) || [];

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const yesterdayStr = format(subDays(now, 1), "yyyy-MM-dd");
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const lastMonth = subMonths(now, 1);
      const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

      const roomMap = new Map(rooms.map((r) => [r.id, r.name]));

      // Revenue bookings (confirmed + completed)
      const revenueBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
      const totalRevenue = revenueBookings.reduce((sum, b) => sum + b.total_price, 0);

      // Current vs last month revenue
      const currentMonthRevenue = revenueBookings.filter((b) => b.check_in.startsWith(currentMonthStr)).reduce((sum, b) => sum + b.total_price, 0);
      const lastMonthRevenue = revenueBookings.filter((b) => b.check_in.startsWith(lastMonthStr)).reduce((sum, b) => sum + b.total_price, 0);

      // Booking counts
      const currentMonthBookings = bookings.filter((b) => b.check_in.startsWith(currentMonthStr));
      const lastMonthBookings = bookings.filter((b) => b.check_in.startsWith(lastMonthStr));

      // Occupancy
      const totalRoomQuantity = rooms.reduce((sum, r) => sum + r.quantity, 0);
      const daysInCurrentMonth = getDaysInMonth(now);
      const totalRoomNights = totalRoomQuantity * daysInCurrentMonth;
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      const calcOccupancy = (revBookings: typeof revenueBookings, mStart: Date, mEnd: Date, totalNights: number) => {
        const booked = revBookings.reduce((sum, b) => {
          const ci = parseISO(b.check_in);
          const co = parseISO(b.check_out);
          if (ci > mEnd || co < mStart) return sum;
          const os = ci < mStart ? mStart : ci;
          const oe = co > mEnd ? mEnd : co;
          return sum + Math.max(differenceInDays(oe, os), 0);
        }, 0);
        return totalNights > 0 ? Math.min(Math.round((booked / totalNights) * 100), 100) : 0;
      };

      const occupancyRate = calcOccupancy(revenueBookings, monthStart, monthEnd, totalRoomNights);
      const lastMonthStart = startOfMonth(lastMonth);
      const lastMonthEnd = endOfMonth(lastMonth);
      const lastMonthTotalNights = totalRoomQuantity * getDaysInMonth(lastMonth);
      const lastMonthOccupancy = calcOccupancy(revenueBookings, lastMonthStart, lastMonthEnd, lastMonthTotalNights);

      // Check-ins
      const todayCheckins = bookings.filter((b) => b.check_in === todayStr && (b.status === "confirmed" || b.status === "completed")).length;
      const yesterdayCheckins = bookings.filter((b) => b.check_in === yesterdayStr && (b.status === "confirmed" || b.status === "completed")).length;

      // Monthly revenue (last 6 months)
      const monthlyRevenue: { month: string; label: string; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(now, i);
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
        const rev = revenueBookings.filter((b) => b.check_in.startsWith(key)).reduce((sum, b) => sum + b.total_price, 0);
        monthlyRevenue.push({ month: key, label: format(parseISO(key + "-01"), "MMM", localeOpts), revenue: rev });
      }

      // Bookings by room
      const roomCounts: Record<string, number> = {};
      revenueBookings.forEach((b) => {
        if (b.room_id) {
          const name = roomMap.get(b.room_id) || "Other";
          roomCounts[name] = (roomCounts[name] || 0) + 1;
        }
      });
      const bookingsByRoom = Object.entries(roomCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      // Status counts
      const confirmed = bookings.filter((b) => b.status === "confirmed").length;
      const pending = bookings.filter((b) => b.status === "pending").length;

      // === Insights ===

      // Total booked nights (current month)
      const currentMonthBookedNights = revenueBookings.reduce((sum, b) => {
        const ci = parseISO(b.check_in);
        const co = parseISO(b.check_out);
        if (ci > monthEnd || co < monthStart) return sum;
        const os = ci < monthStart ? monthStart : ci;
        const oe = co > monthEnd ? monthEnd : co;
        return sum + Math.max(differenceInDays(oe, os), 0);
      }, 0);

      const lastMonthBookedNights = revenueBookings.reduce((sum, b) => {
        const ci = parseISO(b.check_in);
        const co = parseISO(b.check_out);
        if (ci > lastMonthEnd || co < lastMonthStart) return sum;
        const os = ci < lastMonthStart ? lastMonthStart : ci;
        const oe = co > lastMonthEnd ? lastMonthEnd : co;
        return sum + Math.max(differenceInDays(oe, os), 0);
      }, 0);

      // ADR
      const adr = currentMonthBookedNights > 0 ? Math.round(currentMonthRevenue / currentMonthBookedNights) : 0;
      const lastAdr = lastMonthBookedNights > 0 ? Math.round(lastMonthRevenue / lastMonthBookedNights) : 0;

      // RevPAR
      const revpar = totalRoomNights > 0 ? Math.round(currentMonthRevenue / totalRoomNights) : 0;
      const lastRevpar = lastMonthTotalNights > 0 ? Math.round(lastMonthRevenue / lastMonthTotalNights) : 0;

      // Cancellations
      const cancelledThisMonth = currentMonthBookings.filter((b) => b.status === "cancelled").length;
      const cancelledLastMonth = lastMonthBookings.filter((b) => b.status === "cancelled").length;

      // Direct booking %
      const currentMonthTotal = currentMonthBookings.length;
      const isDirectSource = (s: string | undefined | null) => !s || s === "web" || s === "guest";
      const currentMonthDirect = currentMonthBookings.filter((b) => isDirectSource(b.booking_source)).length;
      const directBookingPct = currentMonthTotal > 0 ? Math.round((currentMonthDirect / currentMonthTotal) * 100 * 10) / 10 : 0;
      const lastMonthTotal = lastMonthBookings.length;
      const lastMonthDirect = lastMonthBookings.filter((b) => isDirectSource(b.booking_source)).length;
      const lastDirectPct = lastMonthTotal > 0 ? Math.round((lastMonthDirect / lastMonthTotal) * 100 * 10) / 10 : 0;

      // Booking source breakdown
      const sourceCounts: Record<string, number> = {};
      bookings.forEach((b) => {
        const src = isDirectSource(b.booking_source) ? "direct" : b.booking_source;
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      });
      const bookingsBySource = Object.entries(sourceCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      // Province distribution
      const provinceCounts: Record<string, number> = {};
      bookings.forEach((b) => {
        if (b.guest_province) {
          provinceCounts[b.guest_province] = (provinceCounts[b.guest_province] || 0) + 1;
        }
      });
      const allProvinces = Object.entries(provinceCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
      const topProvinces = allProvinces.slice(0, 5);
      const othersTotal = allProvinces.slice(5).reduce((sum, p) => sum + p.value, 0);
      const provinceDistribution = othersTotal > 0
        ? [...topProvinces, { name: "_others", value: othersTotal }]
        : topProvinces;

      setStats({
        homestayName: homestay.name,
        homestaySlug: homestay.slug,
        totalRevenue,
        totalBookings: bookings.length,
        occupancyRate,
        todayCheckins,
        revenuePctChange: pctChange(currentMonthRevenue, lastMonthRevenue),
        bookingsPctChange: pctChange(currentMonthBookings.length, lastMonthBookings.length),
        occupancyPctChange: pctChange(occupancyRate, lastMonthOccupancy),
        checkinsDelta: todayCheckins - yesterdayCheckins,
        monthlyRevenue,
        bookingsByRoom,
        recentBookings: recent,
        currentMonthBookingCount: currentMonthBookings.length,
        adr, revpar,
        cancelledCount: cancelledThisMonth,
        cancelledDelta: cancelledThisMonth - cancelledLastMonth,
        directBookingPct,
        adrPctChange: pctChange(adr, lastAdr),
        revparPctChange: pctChange(revpar, lastRevpar),
        directPctChange: pctChange(directBookingPct, lastDirectPct),
        bookingsBySource,
        provinceDistribution,
        roomCount: roomCount || 0,
        confirmed, pending,
      });

      setLoading(false);
    };

    fetchData().catch((e: unknown) => {
      if ((e as Error)?.name !== "AbortError") throw e;
    });

    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const SOURCE_KEYS: Record<string, string> = {
    direct: "sourceWeb",
    "booking.com": "sourceBookingCom",
    booking_com: "sourceBookingCom",
    agoda: "sourceAgoda",
    airbnb: "sourceAirbnb",
    "trip.com": "sourceTripCom",
    trip_com: "sourceTripCom",
    "walk-in": "sourceWalkIn",
    walk_in: "sourceWalkIn",
    phone: "sourcePhone",
    other: "sourceOther",
  };
  const sourceLabel = (name: string) => {
    const key = SOURCE_KEYS[name];
    if (key) return t(key as "sourceWeb");
    return name;
  };

  return (
    <div>
      {profileLoaded && hostProfile && (!hostProfile.hasPhone || !hostProfile.hasPromptpay || !hostProfile.hasPinSet) && (
        <SetupProfileModal
          hostId={hostProfile.id}
          hasPhone={hostProfile.hasPhone}
          hasPromptpay={hostProfile.hasPromptpay}
          hasPinSet={hostProfile.hasPinSet}
          onComplete={() => {
            setHostProfile((prev) =>
              prev ? { ...prev, hasPhone: true, hasPromptpay: true, hasPinSet: true } : prev
            );
          }}
        />
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-48" />
          </div>
          <Skeleton className="h-8 w-52 rounded-full" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border border-gray-100">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-3 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <Card key={i} className="border border-gray-100">
                <CardContent className="p-6 space-y-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-48 w-full rounded-lg" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border border-gray-100">
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-5 w-40" />
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header */}
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
                className="rounded-full bg-brand text-white hover:brightness-90"
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

          {/* Tab Switcher */}
          <div className="inline-flex rounded-full border border-gray-200 p-0.5">
            {(["overview", "insights"] as const).map((t2) => (
              <button
                key={t2}
                onClick={() => setTab(t2)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                  tab === t2
                    ? "bg-brand text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t(t2)}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  title={t("totalRevenue")}
                  value={`฿${stats.totalRevenue.toLocaleString()}`}
                  change={stats.revenuePctChange}
                  changeLabel={t("fromLastMonth")}
                  icon={<DollarSign className="h-4 w-4 text-gray-400" />}
                />
                <StatCard
                  title={t("totalBookings")}
                  value={`+${stats.totalBookings}`}
                  change={stats.bookingsPctChange}
                  changeLabel={t("fromLastMonth")}
                  icon={<CalendarDays className="h-4 w-4 text-gray-400" />}
                />
                <StatCard
                  title={t("occupancyRate")}
                  value={`${stats.occupancyRate}%`}
                  change={stats.occupancyPctChange}
                  changeLabel={t("fromLastMonth")}
                  icon={<Percent className="h-4 w-4 text-gray-400" />}
                />
                <StatCard
                  title={t("checkinsToday")}
                  value={String(stats.todayCheckins)}
                  change={stats.checkinsDelta}
                  changeLabel={t("sinceYesterday")}
                  icon={<LogIn className="h-4 w-4 text-gray-400" />}
                  isDelta
                />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Revenue Area Chart */}
                <Card className="border border-gray-100 shadow-sm rounded-2xl">
                  <CardHeader className="pb-2 px-6 pt-5">
                    <CardTitle className="text-sm font-semibold text-gray-900">
                      {t("revenueChart")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {stats.monthlyRevenue.some((m) => m.revenue > 0) ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={stats.monthlyRevenue} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="brandGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2F5D50" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#2F5D50" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `฿${(v / 1000).toFixed(0)}k` : `฿${v}`} width={55} />
                          <Tooltip
                            formatter={(value) => [`฿${Number(value).toLocaleString()}`, t("totalRevenue")]}
                            contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
                          />
                          <Area type="monotone" dataKey="revenue" stroke="#2F5D50" strokeWidth={2} fill="url(#brandGradient)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-gray-300 text-center py-16">{t("noChartData")}</p>
                    )}
                  </CardContent>
                </Card>

                {/* Bookings by Room Bar Chart */}
                <Card className="border border-gray-100 shadow-sm rounded-2xl">
                  <CardHeader className="pb-0 px-6 pt-5">
                    <CardTitle className="text-sm font-semibold text-gray-900">
                      {t("bookingsByRoom")}
                    </CardTitle>
                    <p className="text-xs text-gray-400">{t("popularRoomsDesc")}</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {stats.bookingsByRoom.length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={stats.bookingsByRoom} margin={{ top: 20, right: 20, left: 10, bottom: 0 }}>
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={0} />
                          <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
                          />
                          <Bar dataKey="count" fill="#2F5D50" radius={[4, 4, 0, 0]} maxBarSize={48} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-gray-300 text-center py-16">{t("noChartData")}</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Bookings */}
              <Card className="border border-gray-100 shadow-sm rounded-2xl">
                <CardHeader className="pb-2 px-6 pt-5">
                  <CardTitle className="text-sm font-semibold text-gray-900">
                    {t("recentBookings")}
                  </CardTitle>
                  <p className="text-xs text-gray-400">
                    {t("recentBookingsDesc", { count: stats.currentMonthBookingCount })}
                  </p>
                </CardHeader>
                <CardContent className="px-6 pb-4">
                  {stats.recentBookings.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-3 font-medium text-gray-500">{t("guest")}</th>
                            <th className="text-left py-3 font-medium text-gray-500">{t("status")}</th>
                            <th className="text-right py-3 font-medium text-gray-500">{t("amount")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.recentBookings.map((b) => {
                            const initials = getInitials(b.guest_name);
                            const colorIdx = hashName(b.guest_name) % AVATAR_COLORS.length;
                            const statusKey = `status${b.status.charAt(0).toUpperCase()}${b.status.slice(1)}` as
                              "statusPending" | "statusVerified" | "statusConfirmed" | "statusRejected" | "statusCancelled" | "statusCompleted";
                            return (
                              <tr key={b.id} className="border-b border-gray-50 last:border-0">
                                <td className="py-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`h-9 w-9 rounded-full ${AVATAR_COLORS[colorIdx]} flex items-center justify-center shrink-0`}>
                                      <span className="text-xs font-semibold text-white">{initials}</span>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-gray-900 truncate">{b.guest_name}</p>
                                      <p className="text-xs text-gray-400 truncate">{b.guest_email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3">
                                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[b.status] || "bg-gray-100 text-gray-600"}`}>
                                    {t(statusKey)}
                                  </span>
                                </td>
                                <td className="py-3 text-right font-medium text-gray-900 tabular-nums">
                                  ฿{b.total_price.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-300 text-center py-8">{t("noRecentBookings")}</p>
                  )}
                </CardContent>
              </Card>

            </motion.div>
          ) : (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Insights Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  title={t("adr")}
                  value={`฿${stats.adr.toLocaleString()}`}
                  change={stats.adrPctChange}
                  changeLabel={t("fromLastMonth")}
                  icon={<TrendingUp className="h-4 w-4 text-gray-400" />}
                />
                <StatCard
                  title={t("revpar")}
                  value={`฿${stats.revpar.toLocaleString()}`}
                  change={stats.revparPctChange}
                  changeLabel={t("fromLastMonth")}
                  icon={<BarChart3 className="h-4 w-4 text-gray-400" />}
                />
                <StatCard
                  title={t("cancellations")}
                  value={String(stats.cancelledCount)}
                  change={stats.cancelledDelta}
                  changeLabel={t("fromLastMonth")}
                  icon={<XCircle className="h-4 w-4 text-gray-400" />}
                  isDelta
                  invertColor
                />
                <StatCard
                  title={t("directBookingPct")}
                  value={`${stats.directBookingPct}%`}
                  change={stats.directPctChange}
                  changeLabel={t("fromLastMonth")}
                  icon={<Compass className="h-4 w-4 text-gray-400" />}
                />
              </div>

              {/* Donut Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Booking Source */}
                <Card className="border border-gray-100 shadow-sm rounded-2xl">
                  <CardHeader className="pb-0 px-6 pt-5">
                    <CardTitle className="text-sm font-semibold text-gray-900">
                      {t("bookingSourcePerformance")}
                    </CardTitle>
                    <p className="text-xs text-gray-400">{t("bookingSourceDesc")}</p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6">
                    {stats.bookingsBySource.length > 0 ? (
                      <div className="flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={stats.bookingsBySource}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {stats.bookingsBySource.map((_entry, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value, _name, props) => [value, sourceLabel((props as unknown as { payload: { name: string } }).payload.name)]}
                              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-4 mt-2 justify-center">
                          {stats.bookingsBySource.map((s, i) => {
                            const total = stats.bookingsBySource.reduce((sum, x) => sum + x.value, 0);
                            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                            return (
                              <div key={s.name} className="flex items-center gap-1.5 text-xs">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                <span className="text-gray-600">{sourceLabel(s.name)} {pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-300 text-center py-16">{t("noChartData")}</p>
                    )}
                  </CardContent>
                </Card>

                {/* Guest Province Distribution */}
                <Card className="border border-gray-100 shadow-sm rounded-2xl">
                  <CardHeader className="pb-0 px-6 pt-5">
                    <CardTitle className="text-sm font-semibold text-gray-900">
                      {t("guestProvinceDistribution")}
                    </CardTitle>
                    <p className="text-xs text-gray-400">{t("guestProvinceDesc")}</p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6">
                    {stats.provinceDistribution.length > 0 ? (
                      <div className="flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={stats.provinceDistribution.map((p) => ({
                                ...p,
                                displayName: p.name === "_others" ? t("sourceOther") : getProvinceLabel(p.name, locale),
                              }))}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={2}
                              dataKey="value"
                              nameKey="displayName"
                            >
                              {stats.provinceDistribution.map((_entry, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-4 mt-2 justify-center">
                          {stats.provinceDistribution.slice(0, 6).map((p, i) => {
                            const total = stats.provinceDistribution.reduce((sum, x) => sum + x.value, 0);
                            const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
                            return (
                              <div key={p.name} className="flex items-center gap-1.5 text-xs">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                <span className="text-gray-600">{p.name === "_others" ? t("sourceOther") : getProvinceLabel(p.name, locale)} {pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-300 text-center py-16">{t("noChartData")}</p>
                    )}
                  </CardContent>
                </Card>
              </div>

            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Stat Card Component ── */

function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  isDelta = false,
  invertColor = false,
}: {
  title: string;
  value: string;
  change: number | null;
  changeLabel: string;
  icon: React.ReactNode;
  isDelta?: boolean;
  invertColor?: boolean;
}) {
  const isPositive = change !== null && change > 0;
  const isNegative = change !== null && change < 0;
  const isNeutral = change === null || change === 0;

  // For cancellations, positive = bad (red), negative = good (green)
  const greenCondition = invertColor ? isNegative : isPositive;
  const redCondition = invertColor ? isPositive : isNegative;

  return (
    <Card className="border border-gray-100 shadow-sm rounded-2xl">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-500 leading-tight">{title}</p>
          {icon}
        </div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {!isNeutral && (
          <div className="flex items-center gap-1 mt-1.5">
            {greenCondition ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
            )}
            <span className={`text-xs font-medium ${greenCondition ? "text-emerald-600" : "text-rose-500"}`}>
              {isDelta
                ? `${change! > 0 ? "+" : ""}${change}`
                : `${change! > 0 ? "+" : ""}${change}%`
              }
            </span>
            <span className="text-xs text-gray-400">{changeLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
