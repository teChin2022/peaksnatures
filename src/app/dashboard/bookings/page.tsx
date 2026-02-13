"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations, useLocale } from "next-intl";
import {
  Home,
  CalendarDays,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Loader2,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { BookingStatus } from "@/types/database";
import { toast } from "sonner";
import { useThemeColor } from "@/components/dashboard/theme-context";
import { getProvinceLabel } from "@/lib/provinces";

interface BookingRow {
  id: string;
  homestay_id: string;
  room_id: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number;
  status: BookingStatus;
  easyslip_verified: boolean;
  payment_slip_url: string | null;
  guest_province: string | null;
  created_at: string;
}

interface DisplayBooking extends BookingRow {
  homestay_name: string;
  room_name: string;
}

const statusConfig: Record<
  BookingStatus,
  { labelKey: string; color: string; icon: React.ElementType }
> = {
  pending: { labelKey: "statusPending", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  verified: { labelKey: "statusVerified", color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  confirmed: { labelKey: "statusConfirmed", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  rejected: { labelKey: "statusRejected", color: "bg-red-100 text-red-700", icon: XCircle },
  cancelled: { labelKey: "statusCancelled", color: "bg-gray-100 text-gray-500", icon: XCircle },
  completed: { labelKey: "statusCompleted", color: "bg-purple-100 text-purple-700", icon: CheckCircle2 },
};

export default function BookingsPage() {
  const t = useTranslations("dashboard");
  const themeColor = useThemeColor();
  const locale = useLocale();
  const [bookings, setBookings] = useState<DisplayBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Get host
    const { data: hostRow } = await supabase
      .from("hosts")
      .select("id")
      .eq("user_id", user.id)
      .single();
    const host = hostRow as { id: string } | null;
    if (!host) {
      setLoading(false);
      return;
    }

    // Get homestays for this host
    const { data: homestayRows } = await supabase
      .from("homestays")
      .select("id, name")
      .eq("host_id", host.id);
    const homestays = (homestayRows as { id: string; name: string }[]) || [];
    if (homestays.length === 0) {
      setLoading(false);
      return;
    }

    const homestayIds = homestays.map((h) => h.id);
    const homestayMap = Object.fromEntries(homestays.map((h) => [h.id, h.name]));

    // Get rooms for name lookup
    const { data: roomRows } = await supabase
      .from("rooms")
      .select("id, name")
      .in("homestay_id", homestayIds);
    const roomMap = Object.fromEntries(
      ((roomRows as { id: string; name: string }[]) || []).map((r) => [r.id, r.name])
    );

    // Get bookings
    const { data: bookingRows } = await supabase
      .from("bookings")
      .select("*")
      .in("homestay_id", homestayIds)
      .order("created_at", { ascending: false });

    const rows = (bookingRows as unknown as BookingRow[]) || [];
    const display: DisplayBooking[] = rows.map((b) => ({
      ...b,
      homestay_name: homestayMap[b.homestay_id] || "—",
      room_name: b.room_id ? roomMap[b.room_id] || "—" : "—",
    }));

    setBookings(display);
    setLoading(false);
  };

  const updateStatus = async (id: string, status: BookingStatus) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("bookings")
      .update({ status } as never)
      .eq("id", id);

    if (error) {
      toast.error(t("errorUpdate") || "Failed to update");
      console.error("Update booking error:", error);
      return;
    }

    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status } : b))
    );
    toast.success(status === "confirmed" ? t("confirm") + "!" : t("cancel") + "!");
  };

  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;
  const pendingCount = bookings.filter((b) => b.status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t("allBookings")}</h1>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            {t("allBookings")} ({bookings.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            {t("pending")} ({pendingCount})
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            {t("confirmedTab")} ({confirmedCount})
          </TabsTrigger>
        </TabsList>

        {(["all", "pending", "confirmed"] as const).map((tab) => {
          const filtered = bookings.filter(
            (b) => tab === "all" || b.status === tab
          );
          return (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
                  <CalendarDays className="h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm font-medium text-gray-500">
                    {t("noBookings")}
                  </p>
                </div>
              ) : (
                filtered.map((booking) => {
                  const config = statusConfig[booking.status];
                  const StatusIcon = config.icon;

                  return (
                    <Card key={booking.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-gray-900">
                                {booking.guest_name}
                              </h3>
                              <Badge
                                variant="secondary"
                                className={config.color}
                              >
                                <StatusIcon className="mr-1 h-3 w-3" />
                                {t(config.labelKey)}
                              </Badge>
                              {booking.easyslip_verified && (
                                <Badge
                                  variant="secondary"
                                  style={{ backgroundColor: themeColor + '0d', color: themeColor }}
                                >
                                  ✓ EasySlip
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Home className="h-3.5 w-3.5" />
                                {booking.homestay_name}
                              </span>
                              <span>{booking.room_name}</span>
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {booking.check_in} → {booking.check_out}
                              </span>
                              <span className="font-medium" style={{ color: themeColor }}>
                                ฿{booking.total_price.toLocaleString()}
                              </span>
                              {booking.guest_province && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {getProvinceLabel(booking.guest_province, locale)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              ID: {booking.id.slice(0, 8)}… ·{" "}
                              {booking.guest_email} · {booking.guest_phone}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {booking.status === "pending" && (
                              <>
                                {booking.payment_slip_url && (
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button variant="outline" size="sm">
                                        <Eye className="mr-1 h-3.5 w-3.5" />
                                        {t("viewSlip")}
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>
                                          {t("paymentSlip")}
                                        </DialogTitle>
                                      </DialogHeader>
                                      <img
                                        src={booking.payment_slip_url}
                                        alt="Payment slip"
                                        className="w-full rounded-lg"
                                      />
                                    </DialogContent>
                                  </Dialog>
                                )}
                                <Button
                                  size="sm"
                                  className="hover:brightness-90"
                                  style={{ backgroundColor: themeColor }}
                                  onClick={() =>
                                    updateStatus(booking.id, "confirmed")
                                  }
                                >
                                  {t("confirm")}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() =>
                                    updateStatus(booking.id, "cancelled")
                                  }
                                >
                                  {t("cancel")}
                                </Button>
                              </>
                            )}
                            {booking.status === "confirmed" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  updateStatus(booking.id, "cancelled")
                                }
                              >
                                {t("cancel")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
