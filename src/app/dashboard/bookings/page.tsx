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
  ArrowRightLeft,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { logClientEvent } from "@/lib/history-log-client";
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
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
}

interface DateChangeRequestRow {
  id: string;
  booking_id: string;
  old_check_in: string;
  old_check_out: string;
  new_check_in: string;
  new_check_out: string;
  old_total_price: number;
  new_total_price: number;
  price_difference: number;
  status: string;
  requested_by: string;
  easyslip_verified: boolean;
  payment_slip_url: string | null;
}

interface DisplayBooking extends BookingRow {
  homestay_name: string;
  room_name: string;
}

const PAGE_SIZE = 20;

/**
 * Converts a storage path (or legacy signed URL) stored in payment_slip_url
 * into a fresh signed URL. Returns null if no path is stored.
 */
function extractStoragePath(value: string | null): string | null {
  if (!value) return null;
  // New format: plain storage path like "pending/xxx/slip.jpg"
  if (!value.startsWith("http")) return value;
  // Legacy format: full signed URL — extract path after "/payment-slips/"
  const match = value.match(/\/payment-slips\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function resolveSlipUrls(
  rows: BookingRow[],
  supabase: ReturnType<typeof createClient>
): Promise<BookingRow[]> {
  const paths = rows
    .map((r) => ({ id: r.id, path: extractStoragePath(r.payment_slip_url) }))
    .filter((p): p is { id: string; path: string } => p.path !== null);

  if (paths.length === 0) return rows;

  const { data } = await supabase.storage
    .from("payment-slips")
    .createSignedUrls(
      paths.map((p) => p.path),
      60 * 60 // 1 hour
    );

  if (!data) return rows;

  const urlMap = new Map<string, string>();
  paths.forEach((p, i) => {
    const signed = data[i]?.signedUrl;
    if (signed) urlMap.set(p.id, signed);
  });

  return rows.map((r) => ({
    ...r,
    payment_slip_url: urlMap.get(r.id) ?? r.payment_slip_url,
  }));
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

  const [userId, setUserId] = useState<string | null>(null);

  const fetchBookings = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

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

    // Parallel: fetch counts + first page of bookings
    const [
      { count: total },
      { count: pendingCnt },
      { count: confirmedCnt },
      { data: bookingRows },
    ] = await Promise.all([
      supabase.from("bookings").select("id", { count: "exact", head: true }).in("homestay_id", homestayIds),
      supabase.from("bookings").select("id", { count: "exact", head: true }).in("homestay_id", homestayIds).in("status", ["pending", "verified"]),
      supabase.from("bookings").select("id", { count: "exact", head: true }).in("homestay_id", homestayIds).eq("status", "confirmed"),
      supabase.from("bookings").select("*").in("homestay_id", homestayIds).order("created_at", { ascending: false }).range(0, PAGE_SIZE - 1),
    ]);

    setTotalCount(total || 0);
    setTotalPendingCount(pendingCnt || 0);
    setTotalConfirmedCount(confirmedCnt || 0);

    const rawRows = (bookingRows as unknown as BookingRow[]) || [];
    const rows = await resolveSlipUrls(rawRows, supabase);
    setBookings(toDisplay(rows));
    setHasMore(rows.length === PAGE_SIZE && rows.length < (total || 0));

    // Fetch pending date change requests for these bookings
    const bookingIds = rows.map((b) => b.id);
    if (bookingIds.length > 0) {
      const { data: dcrRows } = await supabase
        .from("date_change_requests")
        .select("id, booking_id, old_check_in, old_check_out, new_check_in, new_check_out, old_total_price, new_total_price, price_difference, status, requested_by, easyslip_verified, payment_slip_url")
        .in("booking_id", bookingIds)
        .eq("status", "pending");
      if (dcrRows) {
        const map: Record<string, DateChangeRequestRow> = {};
        for (const row of dcrRows as unknown as DateChangeRequestRow[]) {
          map[row.booking_id] = row;
        }
        setDateChangeRequests(map);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch; setState calls occur after await boundaries
    fetchBookings();
  }, []);

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

    const rawRows = (bookingRows as unknown as BookingRow[]) || [];
    const rows = await resolveSlipUrls(rawRows, supabase);
    const newBookings = toDisplay(rows);
    setBookings((prev) => [...prev, ...newBookings]);
    setHasMore(rows.length === PAGE_SIZE && from + rows.length < totalCount);
    setLoadingMore(false);
  };

  const updateStatus = async (id: string, status: BookingStatus) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("bookings")
      .update({ status, updated_by: userId } as never)
      .eq("id", id);

    if (error) {
      toast.error(t("errorUpdate"));
      console.error("Update booking error:", error);
      return;
    }

    const booking = bookings.find((b) => b.id === id);
    logClientEvent({
      homestay_id: booking?.homestay_id,
      entity_type: "booking",
      entity_id: id,
      event_type: status === "confirmed" ? "BOOKING_CONFIRMED" : status === "cancelled" ? "BOOKING_CANCELLED" : "CHECKOUT",
      data: { previous_status: booking?.status, new_status: status },
    });

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
  const [cancelReason, setCancelReason] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<DisplayBooking | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DisplayBooking | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Date change state
  const [dateChangeRequests, setDateChangeRequests] = useState<Record<string, DateChangeRequestRow>>({});
  const [dateChangeDialogOpen, setDateChangeDialogOpen] = useState(false);
  const [dateChangeTarget, setDateChangeTarget] = useState<DisplayBooking | null>(null);
  const [dateChangeRange, setDateChangeRange] = useState<DateRange | undefined>(undefined);
  const [submittingDateChange, setSubmittingDateChange] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<DateChangeRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleCancelClick = (booking: DisplayBooking) => {
    setCancelTarget(booking);
    setCancelReason("");
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
    setUpdatingStatus(true);
    try {
      const res = await fetch("/api/bookings/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: cancelTarget.id,
          status: "cancelled",
          reason: cancelReason.trim() || undefined,
          locale,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || t("errorUpdate"));
        return;
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === cancelTarget.id ? { ...b, status: "cancelled" as BookingStatus, cancelled_by: "host" } : b))
      );
      toast.success(t("cancel") + "!");
    } catch {
      toast.error(t("errorUpdate"));
    } finally {
      setUpdatingStatus(false);
    }
    setCancelDialogOpen(false);
    setCancelTarget(null);
    setCancelReason("");
  };

  const handleApproveDateChange = async (dcr: DateChangeRequestRow) => {
    setSubmittingDateChange(true);
    try {
      const res = await fetch("/api/bookings/change-dates/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: dcr.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "DATES_UNAVAILABLE") {
          toast.error(t("dateChangeDatesUnavailable"));
        } else if (data.error === "DATES_BLOCKED") {
          toast.error(t("dateChangeDatesBlocked"));
        } else {
          toast.error(data.error || t("dateChangeApproveFailed"));
        }
        return;
      }
      toast.success(t("dateChangeApproved"));
      // Update local state
      setBookings((prev) =>
        prev.map((b) =>
          b.id === dcr.booking_id
            ? { ...b, check_in: dcr.new_check_in, check_out: dcr.new_check_out, total_price: dcr.new_total_price }
            : b
        )
      );
      setDateChangeRequests((prev) => {
        const next = { ...prev };
        delete next[dcr.booking_id];
        return next;
      });
      logClientEvent({
        homestay_id: bookings.find((b) => b.id === dcr.booking_id)?.homestay_id,
        entity_type: "booking",
        entity_id: dcr.booking_id,
        event_type: "BOOKING_DATE_CHANGE_APPROVED",
        data: { request_id: dcr.id },
      });
    } catch {
      toast.error(t("dateChangeApproveFailed"));
    } finally {
      setSubmittingDateChange(false);
    }
  };

  const handleRejectDateChange = async () => {
    if (!rejectTarget) return;
    setSubmittingDateChange(true);
    try {
      const res = await fetch("/api/bookings/change-dates/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: rejectTarget.id, reason: rejectReason.trim() || undefined }),
      });
      if (!res.ok) {
        toast.error(t("dateChangeRejectFailed"));
        return;
      }
      toast.success(t("dateChangeRejected"));
      setDateChangeRequests((prev) => {
        const next = { ...prev };
        delete next[rejectTarget.booking_id];
        return next;
      });
      logClientEvent({
        homestay_id: bookings.find((b) => b.id === rejectTarget.booking_id)?.homestay_id,
        entity_type: "booking",
        entity_id: rejectTarget.booking_id,
        event_type: "BOOKING_DATE_CHANGE_REJECTED",
        data: { request_id: rejectTarget.id, reason: rejectReason.trim() || undefined },
      });
    } catch {
      toast.error(t("dateChangeRejectFailed"));
    } finally {
      setSubmittingDateChange(false);
      setRejectDialogOpen(false);
      setRejectTarget(null);
      setRejectReason("");
    }
  };

  const handleHostChangeDates = async () => {
    if (!dateChangeTarget || !dateChangeRange?.from || !dateChangeRange?.to) return;
    setSubmittingDateChange(true);
    try {
      const newCheckIn = format(dateChangeRange.from, "yyyy-MM-dd");
      const newCheckOut = format(dateChangeRange.to, "yyyy-MM-dd");

      const res = await fetch("/api/bookings/change-dates/host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: dateChangeTarget.id,
          new_check_in: newCheckIn,
          new_check_out: newCheckOut,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "DATES_UNAVAILABLE") {
          toast.error(t("dateChangeDatesUnavailable"));
        } else if (data.error === "DATES_BLOCKED") {
          toast.error(t("dateChangeDatesBlocked"));
        } else {
          toast.error(data.error || t("dateChangeDirectFailed"));
        }
        return;
      }
      toast.success(t("dateChangeDirect"));
      setBookings((prev) =>
        prev.map((b) =>
          b.id === dateChangeTarget.id
            ? { ...b, check_in: newCheckIn, check_out: newCheckOut, total_price: data.new_total_price }
            : b
        )
      );
      logClientEvent({
        homestay_id: dateChangeTarget.homestay_id,
        entity_type: "booking",
        entity_id: dateChangeTarget.id,
        event_type: "BOOKING_DATE_CHANGE_APPROVED",
        data: { host_initiated: true, new_check_in: newCheckIn, new_check_out: newCheckOut },
      });
      setDateChangeDialogOpen(false);
      setDateChangeTarget(null);
      setDateChangeRange(undefined);
    } catch {
      toast.error(t("dateChangeDirectFailed"));
    } finally {
      setSubmittingDateChange(false);
    }
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
            {t("pending")} ({totalPendingCount + Object.keys(dateChangeRequests).filter(bid => { const b = bookings.find(bk => bk.id === bid); return b && b.status !== "pending" && b.status !== "verified"; }).length})
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            {t("confirmedTab")} ({totalConfirmedCount})
          </TabsTrigger>
        </TabsList>

        {(["all", "pending", "confirmed"] as const).map((tab) => {
          const filtered = bookings.filter(
            (b) => tab === "all" || b.status === tab || (tab === "pending" && b.status === "verified") || (tab === "pending" && dateChangeRequests[b.id])
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
                    <Card key={booking.id} className="overflow-hidden py-0 gap-0">
                      <div className="flex">
                        {/* Slip image — full left side */}
                        <div className="relative w-28 shrink-0 sm:w-36">
                          {booking.payment_slip_url ? (
                            <button
                              className="group relative h-full w-full overflow-hidden"
                              onClick={() => { setDetailTarget(booking); setDetailDialogOpen(true); }}
                            >
                              <Image
                                src={booking.payment_slip_url}
                                alt="Payment slip"
                                fill
                                sizes="144px"
                                className="object-cover transition-opacity group-hover:opacity-75"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                                <Eye className="h-5 w-5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gray-100">
                              <ImageIcon className="h-6 w-6 text-gray-300" />
                              <span className="sr-only">{t("noSlip")}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-1 min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-start">
                          <div className="flex-1 min-w-0 space-y-1">
                            <h3 className="font-semibold text-gray-900">
                              {booking.guest_name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="secondary"
                                className={config.color}
                              >
                                <StatusIcon className="mr-1 h-3 w-3" />
                                {t(config.labelKey)}
                              </Badge>
                              {booking.status === "cancelled" && booking.cancelled_by && (
                                <Badge variant="secondary" className="bg-red-50 text-red-600 text-[11px]">
                                  {booking.cancelled_by === "guest" ? t("cancelledByGuest") : t("cancelledByHost")}
                                </Badge>
                              )}
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

                            {/* Pending date change request banner */}
                            {dateChangeRequests[booking.id] && (
                              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 mt-1">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-1">
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                  {t("dateChangeRequest")}
                                  <span className="text-blue-500 font-normal">({dateChangeRequests[booking.id].requested_by})</span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-blue-600 mb-2">
                                  <span>{t("dateChangeFrom")}: {fmtDateStr(dateChangeRequests[booking.id].old_check_in, "d MMM yyyy", locale)}</span>
                                  <span>{t("dateChangeTo")}: {fmtDateStr(dateChangeRequests[booking.id].new_check_in, "d MMM yyyy", locale)} → {fmtDateStr(dateChangeRequests[booking.id].new_check_out, "d MMM yyyy", locale)}</span>
                                  {dateChangeRequests[booking.id].price_difference !== 0 && (
                                    <span className={dateChangeRequests[booking.id].price_difference > 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
                                      {t("dateChangePriceDiff")}: {dateChangeRequests[booking.id].price_difference > 0 ? "+" : ""}฿{dateChangeRequests[booking.id].price_difference.toLocaleString()}
                                    </span>
                                  )}
                                  {dateChangeRequests[booking.id].easyslip_verified && (
                                    <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px] py-0">
                                      <ShieldCheck className="mr-0.5 h-2.5 w-2.5" />
                                      {t("dateChangeSlipVerified")}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1 hover:brightness-90 text-white"
                                    style={{ backgroundColor: themeColor }}
                                    onClick={() => handleApproveDateChange(dateChangeRequests[booking.id])}
                                    disabled={submittingDateChange}
                                  >
                                    {submittingDateChange ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                                    {t("dateChangeApprove")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => {
                                      setRejectTarget(dateChangeRequests[booking.id]);
                                      setRejectReason("");
                                      setRejectDialogOpen(true);
                                    }}
                                    disabled={submittingDateChange}
                                  >
                                    <XCircle className="mr-1 h-3 w-3" />
                                    {t("dateChangeReject")}
                                  </Button>
                                </div>
                              </div>
                            )}
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
                                  onClick={async () => {
                                    setUpdatingStatus(true);
                                    try {
                                      const res = await fetch("/api/bookings/update-status", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          booking_id: booking.id,
                                          status: "confirmed",
                                          locale,
                                        }),
                                      });
                                      if (!res.ok) {
                                        const data = await res.json();
                                        toast.error(data.error || t("errorUpdate"));
                                        return;
                                      }
                                      setBookings((prev) =>
                                        prev.map((b) => (b.id === booking.id ? { ...b, status: "confirmed" as BookingStatus } : b))
                                      );
                                      toast.success(t("confirm") + "!");
                                    } catch {
                                      toast.error(t("errorUpdate"));
                                    } finally {
                                      setUpdatingStatus(false);
                                    }
                                  }}
                                  disabled={updatingStatus}
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
                                {!booking.checked_in_at && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setDateChangeTarget(booking);
                                      setDateChangeRange(undefined);
                                      setDateChangeDialogOpen(true);
                                    }}
                                  >
                                    <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                                    {t("changeDates")}
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
                      </div>
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
                    disabled={updatingStatus}
                    onClick={async () => {
                      if (detailTarget.status === "pending" || detailTarget.status === "verified") {
                        setUpdatingStatus(true);
                        try {
                          const res = await fetch("/api/bookings/update-status", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              booking_id: detailTarget.id,
                              status: "confirmed",
                              locale,
                            }),
                          });
                          if (!res.ok) {
                            const data = await res.json();
                            toast.error(data.error || t("errorUpdate"));
                            return;
                          }
                          setBookings((prev) =>
                            prev.map((b) => (b.id === detailTarget.id ? { ...b, status: "confirmed" as BookingStatus } : b))
                          );
                          setDetailTarget((prev) => prev ? { ...prev, status: "confirmed" } : null);
                          toast.success(t("confirm") + "!");
                        } catch {
                          toast.error(t("errorUpdate"));
                        } finally {
                          setUpdatingStatus(false);
                        }
                      } else {
                        await updateStatus(detailTarget.id, "confirmed");
                        setDetailTarget((prev) => prev ? { ...prev, status: "confirmed" } : null);
                      }
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
          <div>
            <Label htmlFor="cancel-reason">{t("cancelReason")}</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("cancelReasonPlaceholder")}
              rows={2}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-gray-400">{t("cancelReasonHint")}</p>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={updatingStatus}
            >
              {t("cancelKeep")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={updatingStatus}
            >
              {updatingStatus && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("cancelConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date change reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              {t("dateChangeReject")}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t("dateChangeRejectReason")}</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t("dateChangeRejectReasonPlaceholder")}
              rows={2}
              className="mt-1"
            />
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => { setRejectDialogOpen(false); setRejectTarget(null); }}
              disabled={submittingDateChange}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectDateChange}
              disabled={submittingDateChange}
            >
              {submittingDateChange && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("dateChangeReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Host-initiated date change dialog */}
      <Dialog open={dateChangeDialogOpen} onOpenChange={setDateChangeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" style={{ color: themeColor }} />
              {t("changeDatesTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("changeDatesDesc")}
            </DialogDescription>
          </DialogHeader>
          {dateChangeTarget && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{dateChangeTarget.guest_name}</span>
                {" · "}
                {fmtDateStr(dateChangeTarget.check_in, "d MMM yyyy", locale)} → {fmtDateStr(dateChangeTarget.check_out, "d MMM yyyy", locale)}
              </div>
              <div className="flex justify-center">
                <Calendar
                  mode="range"
                  selected={dateChangeRange}
                  onSelect={setDateChangeRange}
                  disabled={{ before: new Date() }}
                  numberOfMonths={1}
                  className="rounded-md border"
                />
              </div>
              {dateChangeRange?.from && dateChangeRange?.to && (
                <div className="rounded-lg border bg-gray-50 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t("dates")}</span>
                    <span className="font-medium">
                      {format(dateChangeRange.from, "d MMM yyyy")} → {format(dateChangeRange.to, "d MMM yyyy")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => { setDateChangeDialogOpen(false); setDateChangeTarget(null); }}
              disabled={submittingDateChange}
            >
              {t("cancel")}
            </Button>
            <Button
              className="hover:brightness-90 text-white"
              style={{ backgroundColor: themeColor }}
              onClick={handleHostChangeDates}
              disabled={submittingDateChange || !dateChangeRange?.from || !dateChangeRange?.to}
            >
              {submittingDateChange ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t("changeDates")}
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
          <DialogFooter className="flex gap-2 sm:justify-end">
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
