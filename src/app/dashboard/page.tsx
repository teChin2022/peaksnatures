"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTranslations, useLocale } from "next-intl";
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
import { Skeleton } from "@/components/ui/skeleton";
import { SetupProfileModal } from "@/components/setup-profile-modal";
import { useThemeColor } from "@/components/dashboard/theme-context";
import { useUserRole } from "@/components/dashboard/dashboard-shell";
import { getProvinceLabel } from "@/lib/provinces";
import { QRCodeSVG } from "qrcode.react";

interface HostProfile {
  id: string;
  phone: string | null;
  promptpay_id: string | null;
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

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const ta = useTranslations("auth");
  const tn = useTranslations("dashboardNav");
  const themeColor = useThemeColor();
  const locale = useLocale();
  const { role, hostId: contextHostId } = useUserRole();
  const isAssistant = role === "assistant";
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
    if (role === null) return;

    const fetchData = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch host profile
      let hostQuery = supabase
        .from("hosts")
        .select("id, phone, promptpay_id");

      if (isAssistant && contextHostId) {
        hostQuery = hostQuery.eq("id", contextHostId);
      } else {
        hostQuery = hostQuery.eq("user_id", user.id);
      }

      const { data: hostRow } = await hostQuery.single();

      const host = hostRow as HostProfile | null;
      if (host) {
        setHostProfile(host);
      }
      setProfileLoaded(true);

      if (!host) {
        setLoading(false);
        return;
      }

      // Fetch homestay
      const { data: homestayRow } = await supabase
        .from("homestays")
        .select("id, name, slug")
        .eq("host_id", host.id)
        .limit(1)
        .single();

      const homestay = homestayRow as { id: string; name: string; slug: string } | null;

      if (!homestay) {
        setLoading(false);
        return;
      }

      // Fetch rooms count
      const { count: roomCount } = await supabase
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("homestay_id", homestay.id);

      // Fetch booking stats
      const { data: bookingRows } = await supabase
        .from("bookings")
        .select("status, total_price, amount_paid, payment_type, guest_province")
        .eq("homestay_id", homestay.id);

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
  }, [role, contextHostId, isAssistant]);

  return (
    <div>
      {!isAssistant && profileLoaded && hostProfile && (!hostProfile.phone || !hostProfile.promptpay_id) && (
        <SetupProfileModal
          hostId={hostProfile.id}
          currentPhone={hostProfile.phone}
          currentPromptpay={hostProfile.promptpay_id}
          onComplete={() => {
            setHostProfile((prev) =>
              prev ? { ...prev, phone: "set", promptpay_id: "set" } : prev
            );
          }}
        />
      )}

      <h1 className="text-xl font-bold text-gray-900 mb-6">{ta("hostDashboard")}</h1>

      {loading ? (
        <div className="space-y-6">
          {/* Stats skeleton */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-4 p-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-7 w-12" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Quick links skeleton */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-8 rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Province stats skeleton */}
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-5" />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-6" />
                      </div>
                      <Skeleton className="h-1.5 w-full rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-lg p-2.5" style={{ backgroundColor: themeColor + '1a' }}>
                  <CheckCircle2 className="h-5 w-5" style={{ color: themeColor }} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t("confirmed")}</p>
                  <p className="text-2xl font-bold">{stats.confirmed}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-lg bg-yellow-100 p-2.5">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t("needsReview")}</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-lg bg-blue-100 p-2.5">
                  <CalendarDays className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t("totalRevenue")}</p>
                  <p className="text-2xl font-bold">
                    ฿{stats.totalRevenue.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-purple-100 p-2.5">
                      <CalendarDays className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tn("bookings")}</p>
                      <p className="text-sm text-gray-500">
                        {stats.totalBookings} {t("total")}
                      </p>
                    </div>
                  </div>
                  <Link href="/dashboard/bookings">
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-orange-100 p-2.5">
                      <Home className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {stats.homestayName || tn("homestay")}
                      </p>
                      <p className="text-sm text-gray-500">
                        <BedDouble className="mr-1 inline h-3.5 w-3.5" />
                        {stats.roomCount} {tn("rooms")}
                      </p>
                    </div>
                  </div>
                  <Link href="/dashboard/homestay">
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* QR Code for Guest Check-in/Check-out */}
          {stats.homestaySlug && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <QrCode className="h-4 w-4" />
                  {t("qrCodeTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  <div className="rounded-xl border-2 border-gray-100 bg-white p-3">
                    <QRCodeSVG
                      id="checkin-qr"
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/${stats.homestaySlug}`}
                      size={160}
                      fgColor={themeColor}
                      level="M"
                    />
                  </div>
                  <div className="flex flex-col gap-2 text-center sm:text-left">
                    <p className="text-sm text-gray-600">{t("qrCodeDesc")}</p>
                    <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                      <li>{t("qrStep1")}</li>
                      <li>{t("qrStep2")}</li>
                      <li>{t("qrStep3")}</li>
                    </ol>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 w-fit self-center sm:self-start"
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
              </CardContent>
            </Card>
          )}

          {/* Province Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                {t("provinceStats")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {provinceStats.length === 0 ? (
                <p className="text-sm text-gray-400">{t("noProvinceData")}</p>
              ) : (
                <div className="space-y-2">
                  {provinceStats.slice(0, 10).map((ps, i) => {
                    const maxCount = provinceStats[0].count;
                    const pct = Math.round((ps.count / maxCount) * 100);
                    return (
                      <div key={ps.province} className="flex items-center gap-3 text-sm">
                        <span className="w-5 text-right text-xs text-gray-400">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-700">
                              {getProvinceLabel(ps.province, locale)}
                            </span>
                            <span className="text-xs text-gray-500">{ps.count}</span>
                          </div>
                          <div className="mt-0.5 h-1.5 w-full rounded-full bg-gray-100">
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: themeColor }}
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
        </div>
      )}
    </div>
  );
}
