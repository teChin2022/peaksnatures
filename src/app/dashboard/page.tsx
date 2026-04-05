"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SetupProfileModal } from "@/components/setup-profile-modal";
import { getProvinceLabel } from "@/lib/provinces";
import { QRCodeSVG } from "qrcode.react";

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
}

const DOT_COLORS = [
  "bg-brand", "bg-earth-400", "bg-emerald-500",
  "bg-amber-500", "bg-teal-600", "bg-earth-600",
  "bg-green-600", "bg-yellow-600", "bg-lime-600", "bg-earth-500",
];

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
  });
  const [provinceStats, setProvinceStats] = useState<{ province: string; count: number }[]>([]);

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

      // Parallel: rooms count + booking stats (both depend only on homestay.id)
      const [{ count: roomCount }, { data: bookingRows }] = await Promise.all([
        supabase.from("rooms").select("id", { count: "exact", head: true }).eq("homestay_id", homestay.id),
        supabase.from("bookings").select("status, total_price, amount_paid, payment_type, guest_province").eq("homestay_id", homestay.id),
      ]);

      const bookings = (bookingRows as { status: string; total_price: number; amount_paid: number; payment_type: string; guest_province: string | null }[]) || [];

      const confirmed = bookings.filter((b) => b.status === "confirmed").length;
      const pending = bookings.filter((b) => b.status === "pending").length;
      const totalRevenue = bookings
        .filter((b) => b.status === "confirmed" || b.status === "completed")
        .reduce((sum, b) => sum + b.total_price, 0);

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
      });

      setLoading(false);
    };

    fetchData();
  }, []);

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
        /* ── Loading skeletons (warm theme) ── */
        <div className="space-y-6">
          {/* Title skeleton */}
          <div className="space-y-2">
            <div className="h-3 w-24 rounded skeleton-warm" />
            <div className="h-7 w-48 rounded-lg skeleton-warm" />
          </div>
          {/* Hero skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="rounded-2xl bg-earth-100/50 p-8 space-y-3">
                <div className="h-3 w-20 rounded skeleton-warm" />
                <div className="h-14 w-52 rounded-lg skeleton-warm" />
                <div className="h-3 w-32 rounded skeleton-warm" />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="flex-1 rounded-2xl bg-earth-100/50 p-5 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl skeleton-warm" />
                  <div className="space-y-2">
                    <div className="h-3 w-16 rounded skeleton-warm" />
                    <div className="h-6 w-10 rounded skeleton-warm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Quick links skeleton */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl bg-earth-100/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl skeleton-warm" />
                    <div className="space-y-2">
                      <div className="h-4 w-24 rounded skeleton-warm" />
                      <div className="h-3 w-16 rounded skeleton-warm" />
                    </div>
                  </div>
                  <div className="h-8 w-8 rounded skeleton-warm" />
                </div>
              </div>
            ))}
          </div>
          {/* Province skeleton */}
          <div className="rounded-2xl bg-earth-100/50 p-6">
            <div className="h-5 w-40 rounded skeleton-warm mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full skeleton-warm" />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex justify-between">
                      <div className="h-4 w-24 rounded skeleton-warm" />
                      <div className="h-3 w-6 rounded skeleton-warm" />
                    </div>
                    <div className="h-1 w-full rounded-full skeleton-warm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Page Title ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-earth-400 mb-1">
              {ta("hostDashboard")}
            </p>
            {stats.homestayName && (
              <h1 className="text-2xl font-serif text-earth-900 tracking-tight">
                {stats.homestayName}
              </h1>
            )}
          </motion.div>

          {/* ── Hero Stats ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Revenue hero — 2-col span */}
            <motion.div
              className="md:col-span-2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="overflow-hidden border-0 shadow-lg rounded-2xl">
                <div className="relative px-7 py-8 bg-gradient-to-br from-brand-50/80 via-white to-earth-50/60">
                  {/* Decorative circles */}
                  <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand opacity-[0.07]" />
                  <div className="absolute right-16 -bottom-6 h-20 w-20 rounded-full bg-brand opacity-[0.05]" />
                  <div className="relative">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-earth-400 mb-1">
                      {t("totalRevenue")}
                    </p>
                    <span className="text-5xl sm:text-6xl font-serif tracking-tight leading-none text-gray-900">
                      ฿{stats.totalRevenue.toLocaleString()}
                    </span>
                    <p className="text-xs text-earth-400 mt-2">
                      {stats.totalBookings} {t("total")}
                    </p>
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
              <Card className="flex-1 border-0 shadow-md rounded-2xl dashboard-card">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-earth-400">
                      {t("confirmed")}
                    </p>
                    <p className="text-xl font-serif text-gray-900 leading-tight">
                      {stats.confirmed}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="flex-1 border-0 shadow-md rounded-2xl dashboard-card">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-earth-400">
                      {t("needsReview")}
                    </p>
                    <p className="text-xl font-serif text-gray-900 leading-tight">
                      {stats.pending}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* ── Quick Links ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <Card className="border-0 shadow-md rounded-2xl dashboard-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                      <CalendarDays className="h-4.5 w-4.5 text-violet-600" />
                    </div>
                    <div>
                      <p className="font-medium text-earth-900">{tn("bookings")}</p>
                      <p className="text-sm text-earth-400">
                        {stats.totalBookings} {t("total")}
                      </p>
                    </div>
                  </div>
                  <Link href="/dashboard/bookings">
                    <Button variant="ghost" size="sm" className="text-earth-400 hover:text-brand">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md rounded-2xl dashboard-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                      <Home className="h-4.5 w-4.5 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-medium text-earth-900">
                        {stats.homestayName || tn("homestay")}
                      </p>
                      <p className="text-sm text-earth-400">
                        <BedDouble className="mr-1 inline h-3.5 w-3.5" />
                        {stats.roomCount} {tn("rooms")}
                      </p>
                    </div>
                  </div>
                  <Link href="/dashboard/homestay">
                    <Button variant="ghost" size="sm" className="text-earth-400 hover:text-brand">
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
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card className="border-0 shadow-md rounded-2xl overflow-hidden">
                <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-gradient-to-r from-brand-50/40 to-transparent">
                  <div className="shrink-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-earth-100">
                    <QRCodeSVG
                      id="checkin-qr"
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/${stats.homestaySlug}`}
                      size={120}
                      fgColor="#2F5D50"
                      level="M"
                    />
                  </div>
                  <div className="flex flex-col gap-2 text-center sm:text-left">
                    <h3 className="font-serif text-lg text-earth-900 flex items-center gap-2 justify-center sm:justify-start">
                      <QrCode className="h-4 w-4 text-brand" />
                      {t("qrCodeTitle")}
                    </h3>
                    <p className="text-sm text-earth-500 leading-relaxed">{t("qrCodeDesc")}</p>
                    <ol className="text-xs text-earth-400 space-y-0.5 list-decimal list-inside">
                      <li>{t("qrStep1")}</li>
                      <li>{t("qrStep2")}</li>
                      <li>{t("qrStep3")}</li>
                    </ol>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-fit self-center sm:self-start rounded-full border-earth-200 text-earth-600 hover:bg-earth-50"
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
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <Card className="border-0 shadow-md rounded-2xl">
              <CardHeader className="pb-3 px-6 pt-6">
                <CardTitle className="flex items-center gap-2 text-base font-serif text-earth-900">
                  <MapPin className="h-4 w-4 text-brand" />
                  {t("provinceStats")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                {provinceStats.length === 0 ? (
                  <p className="text-sm text-earth-300">{t("noProvinceData")}</p>
                ) : (
                  <div className="space-y-3">
                    {provinceStats.slice(0, 10).map((ps, i) => {
                      const maxCount = provinceStats[0].count;
                      const pct = Math.round((ps.count / maxCount) * 100);
                      const dotColor = DOT_COLORS[i % DOT_COLORS.length];
                      return (
                        <div key={ps.province} className="flex items-center gap-3 text-sm">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-earth-700 truncate">
                                {getProvinceLabel(ps.province, locale)}
                              </span>
                              <span className="text-xs font-medium text-earth-400 ml-2 tabular-nums">
                                {ps.count}
                              </span>
                            </div>
                            <div className="h-1 w-full rounded-full bg-earth-100">
                              <motion.div
                                className={`h-1 rounded-full ${dotColor}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6, delay: 0.6 + i * 0.05, ease: "easeOut" }}
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
