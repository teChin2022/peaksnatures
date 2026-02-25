"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
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
  ImageIcon,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  User,
  Phone,
  Mail,
  CreditCard,
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookingStatus } from "@/types/database";
import { toast } from "sonner";
import { fmtDateStr } from "@/lib/format-date";
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
  amount_paid: number;
  payment_type: string;
  status: BookingStatus;
  easyslip_verified: boolean;
  payment_slip_url: string | null;
  guest_province: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  created_at: string;
}

interface DisplayBooking extends BookingRow {
  homestay_name: string;
  room_name: string;
}

const PAGE_SIZE = 20;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPendingCount, setTotalPendingCount] = useState(0);
  const [totalConfirmedCount, setTotalConfirmedCount] = useState(0);

  // Store lookup maps so loadMore can reuse them
  const homestayMapRef = useRef<Record<string, string>>({});
  const roomMapRef = useRef<Record<string, string>>({});
  const homestayIdsRef = useRef<string[]>([]);

  const toDisplay = useCallback(
    (rows: BookingRow[]): DisplayBooking[] =>
      rows.map((b) => ({
        ...b,
        homestay_name: homestayMapRef.current[b.homestay_id] || "—",
        room_name: b.room_id ? roomMapRef.current[b.room_id] || "—" : "—",
      })),
    []
  );

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
    homestayIdsRef.current = homestayIds;
    homestayMapRef.current = homestayMap;

    // Get rooms for name lookup
    const { data: roomRows } = await supabase
      .from("rooms")
      .select("id, name")
      .in("homestay_id", homestayIds);
    const roomMap = Object.fromEntries(
      ((roomRows as { id: string; name: string }[]) || []).map((r) => [r.id, r.name])
    );
    roomMapRef.current = roomMap;

    // Get total count + status counts for tab badges
    const { count: total } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("homestay_id", homestayIds);
    const { count: pendingCnt } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("homestay_id", homestayIds)
      .in("status", ["pending", "verified"]);
    const { count: confirmedCnt } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("homestay_id", homestayIds)
      .eq("status", "confirmed");

    setTotalCount(total || 0);
    setTotalPendingCount(pendingCnt || 0);
    setTotalConfirmedCount(confirmedCnt || 0);

    // Get first page of bookings
    const { data: bookingRows } = await supabase
      .from("bookings")
      .select("*")
      .in("homestay_id", homestayIds)
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    const rows = (bookingRows as unknown as BookingRow[]) || [];
    setBookings(toDisplay(rows));
    setHasMore(rows.length === PAGE_SIZE && rows.length < (total || 0));
    setLoading(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const supabase = createClient();
    const from = bookings.length;
    const to = from + PAGE_SIZE - 1;

    const { data: bookingRows } = await supabase
      .from("bookings")
      .select("*")
      .in("homestay_id", homestayIdsRef.current)
      .order("created_at", { ascending: false })
      .range(from, to);

    const rows = (bookingRows as unknown as BookingRow[]) || [];
    const newBookings = toDisplay(rows);
    setBookings((prev) => [...prev, ...newBookings]);
    setHasMore(rows.length === PAGE_SIZE && from + rows.length < totalCount);
    setLoadingMore(false);
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
    toast.success(
      status === "confirmed" ? t("confirm") + "!" :
      status === "completed" ? t("markCompleted") + "!" :
      t("cancel") + "!"
    );
  };

  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;
  const pendingCount = bookings.filter((b) => b.status === "pending" || b.status === "verified").length;

  const getTabTotal = (tab: "all" | "pending" | "confirmed") => {
    if (tab === "all") return totalCount;
    if (tab === "pending") return totalPendingCount;
    return totalConfirmedCount;
  };

  const [cancelTarget, setCancelTarget] = useState<DisplayBooking | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<DisplayBooking | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DisplayBooking | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const handleCancelClick = (booking: DisplayBooking) => {
    setCancelTarget(booking);
    setCancelDialogOpen(true);
  };

  const handleCompleteClick = (booking: DisplayBooking) => {
    setCompleteTarget(booking);
    setCompleteDialogOpen(true);
  };

  const handleConfirmComplete = async () => {
    if (!completeTarget) return;
    await updateStatus(completeTarget.id, "completed");
    setCompleteDialogOpen(false);
    setCompleteTarget(null);
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    await updateStatus(cancelTarget.id, "cancelled");
    setCancelDialogOpen(false);
    setCancelTarget(null);
  };

  if (loading) {
    return (
      <div>
        <Skeleton className="h-7 w-48 mb-6" />
        <Skeleton className="h-10 w-80 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t("allBookings")}</h1>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            {t("allBookings")} ({totalCount})
          </TabsTrigger>
          <TabsTrigger value="pending">
            {t("pending")} ({totalPendingCount})
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            {t("confirmedTab")} ({totalConfirmedCount})
          </TabsTrigger>
        </TabsList>

        {(["all", "pending", "confirmed"] as const).map((tab) => {
          const filtered = bookings.filter(
            (b) => tab === "all" || b.status === tab || (tab === "pending" && b.status === "verified")
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
                <>
                {filtered.map((booking) => {
                  const config = statusConfig[booking.status];
                  const StatusIcon = config.icon;

                  return (
                    <Card key={booking.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                          {/* Slip thumbnail */}
                          {booking.payment_slip_url ? (
                            <button
                              className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border"
                              onClick={() => { setDetailTarget(booking); setDetailDialogOpen(true); }}
                            >
                              <Image
                                src={booking.payment_slip_url}
                                alt="Payment slip"
                                fill
                                sizes="80px"
                                className="h-full w-full object-cover transition-opacity group-hover:opacity-75"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                                <Eye className="h-5 w-5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                              <ImageIcon className="h-6 w-6 text-gray-300" />
                              <span className="sr-only">{t("noSlip")}</span>
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-1">
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
                              {booking.checked_in_at && (
                                <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  {t("guestCheckedIn")}
                                </Badge>
                              )}
                              {booking.checked_out_at && (
                                <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  {t("guestCheckedOut")}
                                </Badge>
                              )}
                              {booking.payment_type === "deposit" && booking.amount_paid < booking.total_price ? (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                                  {t("paymentDeposit")}
                                </Badge>
                              ) : booking.amount_paid >= booking.total_price ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                                  {t("paymentFull")}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Home className="h-3.5 w-3.5" />
                                {booking.homestay_name}
                              </span>
                              <span>{booking.room_name}</span>
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {fmtDateStr(booking.check_in, "d MMM yyyy", locale)} → {fmtDateStr(booking.check_out, "d MMM yyyy", locale)}
                              </span>
                              <span className="font-medium" style={{ color: themeColor }}>
                                ฿{booking.total_price.toLocaleString()}
                              </span>
                              {booking.amount_paid < booking.total_price && (
                                <span className="font-medium text-amber-600">
                                  {t("balanceDue", { amount: (booking.total_price - booking.amount_paid).toLocaleString() })}
                                </span>
                              )}
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

                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setDetailTarget(booking); setDetailDialogOpen(true); }}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              {t("viewDetails")}
                            </Button>
                            {(booking.status === "pending" || booking.status === "verified") && !booking.easyslip_verified && (
                              <>
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
                                  onClick={() => handleCancelClick(booking)}
                                >
                                  {t("cancel")}
                                </Button>
                              </>
                            )}
                            {booking.status === "confirmed" && (
                              <>
                                {new Date(booking.check_out) <= new Date() && (
                                  <Button
                                    size="sm"
                                    className="hover:brightness-90 text-white"
                                    style={{ backgroundColor: themeColor }}
                                    onClick={() => handleCompleteClick(booking)}
                                  >
                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                    {t("markCompleted")}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCancelClick(booking)}
                                >
                                  {t("cancel")}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Load More */}
                {tab === "all" && hasMore && (
                  <div className="flex flex-col items-center gap-2 pt-4">
                    <p className="text-xs text-gray-400">
                      {t("showingCount", { count: bookings.length, total: totalCount })}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          {t("loadingMore")}
                        </>
                      ) : (
                        t("loadMore")
                      )}
                    </Button>
                  </div>
                )}
                </>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Booking detail dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t("bookingDetails")}
              {detailTarget && (
                <Badge
                  variant="secondary"
                  className={statusConfig[detailTarget.status].color}
                >
                  {React.createElement(statusConfig[detailTarget.status].icon, { className: "mr-1 h-3 w-3" })}
                  {t(statusConfig[detailTarget.status].labelKey)}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-4">
              {/* Payment Slip */}
              {detailTarget.payment_slip_url ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <CreditCard className="h-4 w-4" />
                      {t("paymentSlip")}
                    </h4>
                    {detailTarget.easyslip_verified ? (
                      <Badge variant="secondary" style={{ backgroundColor: themeColor + '0d', color: themeColor }}>
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        {t("paymentVerified")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-50 text-amber-700">
                        <ShieldAlert className="mr-1 h-3 w-3" />
                        {t("paymentPending")}
                      </Badge>
                    )}
                  </div>
                  <div className="rounded-lg border bg-gray-50 p-2">
                    <Image
                      src={detailTarget.payment_slip_url}
                      alt="Payment slip"
                      width={400}
                      height={320}
                      className="mx-auto max-h-80 rounded-lg object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-400">
                  <ImageIcon className="h-5 w-5" />
                  {t("noSlip")}
                </div>
              )}

              {/* Booking Info */}
              <div className="rounded-lg border bg-gray-50 p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{detailTarget.guest_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{detailTarget.guest_email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{detailTarget.guest_phone}</span>
                </div>
                {detailTarget.guest_province && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">{getProvinceLabel(detailTarget.guest_province, locale)}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-2 mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t("room")}</span>
                    <span className="font-medium">{detailTarget.room_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t("dates")}</span>
                    <span>{fmtDateStr(detailTarget.check_in, "d MMM yyyy", locale)} → {fmtDateStr(detailTarget.check_out, "d MMM yyyy", locale)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t("guests")}</span>
                    <span>{detailTarget.num_guests}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t("total")}</span>
                    <span className="font-bold" style={{ color: themeColor }}>฿{detailTarget.total_price.toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 pt-1">ID: {detailTarget.id}</p>
              </div>

              {/* Action buttons */}
              {(detailTarget.status === "pending" || detailTarget.status === "verified") && !detailTarget.easyslip_verified && (
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDetailDialogOpen(false);
                      handleCancelClick(detailTarget);
                    }}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    className="hover:brightness-90"
                    style={{ backgroundColor: themeColor }}
                    onClick={async () => {
                      await updateStatus(detailTarget.id, "confirmed");
                      setDetailTarget((prev) => prev ? { ...prev, status: "confirmed" } : null);
                      setDetailDialogOpen(false);
                    }}
                  >
                    {t("confirm")}
                  </Button>
                </DialogFooter>
              )}
              {detailTarget.status === "confirmed" && new Date(detailTarget.check_out) <= new Date() && (
                <DialogFooter>
                  <Button
                    className="hover:brightness-90 text-white"
                    style={{ backgroundColor: themeColor }}
                    onClick={() => {
                      setDetailDialogOpen(false);
                      handleCompleteClick(detailTarget);
                    }}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    {t("markCompleted")}
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {t("cancelConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("cancelConfirmDesc", { guest: cancelTarget?.guest_name || "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
            >
              {t("cancelKeep")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
            >
              {t("cancelConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete confirmation dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" style={{ color: themeColor }} />
              {t("completeConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("completeConfirmDesc", { guest: completeTarget?.guest_name || "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCompleteDialogOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              className="hover:brightness-90 text-white"
              style={{ backgroundColor: themeColor }}
              onClick={handleConfirmComplete}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {t("completeConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
