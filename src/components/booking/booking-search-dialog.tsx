"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, CalendarDays, Clock, CheckCircle2, XCircle, Loader2, Star, MessageSquare, LogIn, LogOut, Upload, CreditCard, Download, AlertTriangle, ArrowRightLeft, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { fmtDateStr } from "@/lib/format-date";
import { useIsMobile } from "@/lib/use-is-mobile";
import generatePayload from "promptpay-qr";
import { QRCodeSVG } from "qrcode.react";

interface SearchResult {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number;
  amount_paid: number;
  payment_type: string;
  status: string;
  room_id: string | null;
  room_name: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  created_at: string;
  has_review: boolean;
  pending_date_change: {
    id: string;
    new_check_in: string;
    new_check_out: string;
    new_total_price: number;
    price_difference: number;
    status: string;
  } | null;
}

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  pending: { color: "bg-yellow-100 text-yellow-700", icon: Clock },
  verified: { color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  confirmed: { color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  rejected: { color: "bg-red-100 text-red-700", icon: XCircle },
  cancelled: { color: "bg-gray-100 text-gray-500", icon: XCircle },
  completed: { color: "bg-purple-100 text-purple-700", icon: CheckCircle2 },
};

interface BookingSearchDialogProps {
  homestayId: string;
  promptpayId?: string;
  hostName?: string;
  cancellationDays?: number;
}

export function BookingSearchDialog({ homestayId, promptpayId, hostName, cancellationDays: propCancellationDays }: BookingSearchDialogProps) {
  const t = useTranslations("bookingSearch");
  const tr = useTranslations("reviews");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [reviewingBookingId, setReviewingBookingId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [payingBalanceId, setPayingBalanceId] = useState<string | null>(null);
  const [balancePayMethod, setBalancePayMethod] = useState<"transfer" | "cash" | null>(null);
  const [balanceSlipFile, setBalanceSlipFile] = useState<File | null>(null);
  const [balanceSlipPreview, setBalanceSlipPreview] = useState<string | null>(null);
  const [submittingBalance, setSubmittingBalance] = useState(false);
  const balanceFileRef = useRef<HTMLInputElement>(null);
  const [cancellationDays, setCancellationDays] = useState(propCancellationDays || 0);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [changingDatesId, setChangingDatesId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [submittingDateChange, setSubmittingDateChange] = useState(false);
  const [dateChangePriceInfo, setDateChangePriceInfo] = useState<{ new_total_price: number; price_difference: number } | null>(null);
  const [dateChangeSlipFile, setDateChangeSlipFile] = useState<File | null>(null);
  const [dateChangeSlipPreview, setDateChangeSlipPreview] = useState<string | null>(null);
  const dateChangeFileRef = useRef<HTMLInputElement>(null);
  const [noRefundConfirmed, setNoRefundConfirmed] = useState(false);
  const isMobile = useIsMobile();
  const [dcUploadSessionId] = useState(() => crypto.randomUUID());
  const [dcPhoneSlipReceived, setDcPhoneSlipReceived] = useState(false);
  const dcPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dcDisabledDates, setDcDisabledDates] = useState<Set<string>>(new Set());
  const [dcLoadingAvailability, setDcLoadingAvailability] = useState(false);
  const [dcRooms, setDcRooms] = useState<{ id: string; name: string }[]>([]);
  const [dcSelectedRoomId, setDcSelectedRoomId] = useState<string | null>(null);
  const dcQrRef = useRef<HTMLDivElement>(null);

  const handleCheckin = async (bookingId: string, guestEmail: string, action: "checkin" | "checkout") => {
    setCheckingIn(bookingId);
    try {
      const res = await fetch("/api/bookings/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, guest_email: guestEmail, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "BALANCE_DUE") {
          // Show pay-remaining flow instead of error
          setPayingBalanceId(bookingId);
          toast.error(t("balanceDueCheckout", { amount: data.balance_due.toLocaleString() }));
        } else {
          toast.error(data.message || data.error || t("noResults"));
        }
      } else {
        if (action === "checkin") {
          toast.success(t("checkedIn"));
          setResults((prev) =>
            prev.map((b) => (b.id === bookingId ? { ...b, checked_in_at: new Date().toISOString() } : b))
          );
        } else {
          toast.success(t("checkedOut"));
          setResults((prev) =>
            prev.map((b) => (b.id === bookingId ? { ...b, checked_out_at: new Date().toISOString(), status: "completed" } : b))
          );
        }
      }
    } catch {
      toast.error(t("noResults"));
    } finally {
      setCheckingIn(null);
    }
  };

  const handlePayBalance = async (booking: SearchResult) => {
    if (!balanceSlipFile || !promptpayId) return;
    setSubmittingBalance(true);
    try {
      const balanceDue = booking.total_price - (booking.amount_paid || 0);

      // 1. Verify slip
      const verifyForm = new FormData();
      verifyForm.append("file", balanceSlipFile);
      verifyForm.append("expected_amount", balanceDue.toString());
      verifyForm.append("expected_receiver", promptpayId);

      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        body: verifyForm,
      });
      const verifyData = await verifyRes.json();

      if (verifyRes.status === 409 && verifyData.duplicate) {
        toast.error(t("errorSlipDuplicate"));
        setBalanceSlipFile(null);
        setBalanceSlipPreview(null);
        setSubmittingBalance(false);
        return;
      }

      if (!verifyData.verified) {
        toast.error(verifyData.message || t("errorSlipVerify"));
        setBalanceSlipFile(null);
        setBalanceSlipPreview(null);
        setSubmittingBalance(false);
        return;
      }

      // 2. Pay balance
      const payRes = await fetch("/api/bookings/pay-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: booking.id,
          guest_email: booking.guest_email,
          method: "transfer",
          slip_hash: verifyData.slip_hash,
          slip_trans_ref: verifyData.slip_trans_ref || null,
          payment_slip_url: verifyData.payment_slip_url || null,
          easyslip_response: verifyData.easyslip_response || null,
        }),
      });

      if (!payRes.ok) {
        const payData = await payRes.json();
        toast.error(payData.error || t("errorPayment"));
        setSubmittingBalance(false);
        return;
      }

      toast.success(t("balancePaid"));
      // Update local state
      setResults((prev) =>
        prev.map((b) =>
          b.id === booking.id
            ? { ...b, amount_paid: b.total_price, payment_type: "full" }
            : b
        )
      );
      setPayingBalanceId(null);
      setBalancePayMethod(null);
      setBalanceSlipFile(null);
      setBalanceSlipPreview(null);
    } catch {
      toast.error(t("errorPayment"));
    } finally {
      setSubmittingBalance(false);
    }
  };

  const handlePayCash = async (booking: SearchResult) => {
    setSubmittingBalance(true);
    try {
      const payRes = await fetch("/api/bookings/pay-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: booking.id,
          guest_email: booking.guest_email,
          method: "cash",
        }),
      });

      if (!payRes.ok) {
        const payData = await payRes.json();
        toast.error(payData.error || t("errorPayment"));
        return;
      }

      toast.success(t("balancePaid"));
      setResults((prev) =>
        prev.map((b) =>
          b.id === booking.id
            ? { ...b, amount_paid: b.total_price, payment_type: "full" }
            : b
        )
      );
      setPayingBalanceId(null);
      setBalancePayMethod(null);
    } catch {
      toast.error(t("errorPayment"));
    } finally {
      setSubmittingBalance(false);
    }
  };

  const handleSubmitReview = async (bookingId: string, guestEmail: string) => {
    if (reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId,
          rating: reviewRating,
          comment: reviewComment.trim() || null,
          guest_email: guestEmail,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error(tr("errorAlreadyReviewed"));
      } else if (res.status === 400 && data.error === "BOOKING_NOT_COMPLETED") {
        toast.error(tr("errorBookingNotCompleted"));
      } else if (!res.ok) {
        toast.error(tr("errorSubmit"));
      } else {
        toast.success(tr("reviewSubmitted"));
        // Mark as reviewed in results
        setResults((prev) =>
          prev.map((b) => (b.id === bookingId ? { ...b, has_review: true } : b))
        );
      }
    } catch {
      toast.error(tr("errorSubmit"));
    } finally {
      setSubmittingReview(false);
      setReviewingBookingId(null);
      setReviewRating(0);
      setReviewHover(0);
      setReviewComment("");
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    setSubmittingCancel(true);
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId,
          reason: cancelReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "TOO_LATE") {
          toast.error(t("cancelTooLate", { days: data.cancellation_days }));
        } else if (data.error === "CANCELLATION_DISABLED") {
          toast.error(t("cancelNotAllowed"));
        } else {
          toast.error(data.message || t("cancelError"));
        }
        return;
      }
      toast.success(t("cancelSuccess"));
      setResults((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" } : b))
      );
    } catch {
      toast.error(t("cancelError"));
    } finally {
      setSubmittingCancel(false);
      setCancellingId(null);
      setCancelReason("");
    }
  };

  const handleDateChangeSubmit = async (booking: SearchResult) => {
    if (!dateRange?.from || !dateRange?.to) return;
    setSubmittingDateChange(true);
    try {
      const newCheckIn = format(dateRange.from, "yyyy-MM-dd");
      const newCheckOut = format(dateRange.to, "yyyy-MM-dd");

      // Build body — include slip data if price increased and slip uploaded
      const body: Record<string, unknown> = {
        booking_id: booking.id,
        new_check_in: newCheckIn,
        new_check_out: newCheckOut,
      };

      // Include new_room_id if room was changed
      if (dcSelectedRoomId && dcSelectedRoomId !== booking.room_id) {
        body.new_room_id = dcSelectedRoomId;
      }

      // If price increased and user uploaded a slip, verify it first
      if (dateChangePriceInfo && dateChangePriceInfo.price_difference > 0 && dateChangeSlipFile && promptpayId) {
        const verifyForm = new FormData();
        verifyForm.append("file", dateChangeSlipFile);
        verifyForm.append("expected_amount", dateChangePriceInfo.price_difference.toString());
        verifyForm.append("expected_receiver", promptpayId);

        const verifyRes = await fetch("/api/verify-slip", { method: "POST", body: verifyForm });
        const verifyData = await verifyRes.json();

        if (verifyRes.status === 409 && verifyData.duplicate) {
          toast.error(t("errorSlipDuplicate"));
          setDateChangeSlipFile(null);
          setDateChangeSlipPreview(null);
          setSubmittingDateChange(false);
          return;
        }
        if (!verifyData.verified) {
          toast.error(verifyData.message || t("errorSlipVerify"));
          setDateChangeSlipFile(null);
          setDateChangeSlipPreview(null);
          setSubmittingDateChange(false);
          return;
        }

        body.slip_hash = verifyData.slip_hash;
        body.slip_trans_ref = verifyData.slip_trans_ref || null;
        body.payment_slip_url = verifyData.payment_slip_url || null;
        body.easyslip_response = verifyData.easyslip_response || null;
        body.easyslip_verified = verifyData.verified;
      }

      const res = await fetch("/api/bookings/change-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "PAYMENT_REQUIRED") {
          // Show price info so user can upload slip
          setDateChangePriceInfo({ new_total_price: data.new_total_price, price_difference: data.price_difference });
          setSubmittingDateChange(false);
          return;
        }
        if (data.error === "PENDING_EXISTS") {
          toast.error(t("pendingExists"));
        } else if (data.error === "DATES_UNAVAILABLE") {
          toast.error(t("datesUnavailable"));
        } else if (data.error === "DATES_BLOCKED") {
          toast.error(t("datesBlocked"));
        } else {
          toast.error(data.message || t("dateChangeError"));
        }
        return;
      }

      toast.success(t("dateChangeSuccess"));
      // Update local state to show pending
      setResults((prev) =>
        prev.map((b) =>
          b.id === booking.id
            ? {
                ...b,
                pending_date_change: {
                  id: data.request?.id || "",
                  new_check_in: newCheckIn,
                  new_check_out: newCheckOut,
                  new_total_price: data.new_total_price,
                  price_difference: data.price_difference,
                  status: "pending",
                },
              }
            : b
        )
      );
      resetDateChangeState();
    } catch {
      toast.error(t("dateChangeError"));
    } finally {
      setSubmittingDateChange(false);
    }
  };

  const fetchDisabledDates = async (booking: SearchResult, overrideRoomId?: string) => {
    const targetRoomId = overrideRoomId || booking.room_id;
    setDcLoadingAvailability(true);
    try {
      // Fetch booked ranges
      const availRes = await fetch(`/api/bookings/availability?homestay_id=${homestayId}`);
      const availData = await availRes.json();
      const bookedRanges: { room_id: string | null; check_in: string; check_out: string }[] = availData.bookedRanges || [];

      // Fetch blocked dates via Supabase client (public RLS)
      const supabase = createClient();
      const { data: blockedRows } = await supabase
        .from("blocked_dates")
        .select("date, room_id")
        .eq("homestay_id", homestayId);

      const disabled = new Set<string>();

      // Add blocked dates (matching target room or homestay-wide)
      (blockedRows || []).forEach((d: { date: string; room_id: string | null }) => {
        if (d.room_id === null || d.room_id === targetRoomId) {
          disabled.add(d.date);
        }
      });

      // Current booking's own dates should NOT count toward the tally
      // (only for the ORIGINAL room — if switching rooms, all dates on the new room count)
      const isOriginalRoom = targetRoomId === booking.room_id;
      const ownDates = new Set<string>();
      if (isOriginalRoom) {
        const ownStart = new Date(booking.check_in);
        const ownEnd = new Date(booking.check_out);
        for (let d = new Date(ownStart); d < ownEnd; d.setDate(d.getDate() + 1)) {
          ownDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }
      }

      // Fetch room quantity (rooms table has public SELECT RLS)
      let roomQty = 1;
      if (targetRoomId) {
        const { data: roomRow } = await supabase
          .from("rooms")
          .select("quantity")
          .eq("id", targetRoomId)
          .single();
        if (roomRow) roomQty = (roomRow as { quantity: number }).quantity || 1;
      }

      // Count bookings per date (excluding own booking's dates if same room)
      const dateCountMap = new Map<string, number>();
      bookedRanges
        .filter((b) => b.room_id === targetRoomId)
        .forEach((b) => {
          const start = new Date(b.check_in);
          const end = new Date(b.check_out);
          for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            if (!ownDates.has(key)) {
              dateCountMap.set(key, (dateCountMap.get(key) || 0) + 1);
            }
          }
        });
      dateCountMap.forEach((count, date) => {
        if (count >= roomQty) disabled.add(date);
      });

      setDcDisabledDates(disabled);
    } catch {
      // Fail silently — calendar will just not show disabled dates
    } finally {
      setDcLoadingAvailability(false);
    }
  };

  const fetchRoomsForHomestay = async () => {
    try {
      const supabase = createClient();
      const { data: roomRows } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("homestay_id", homestayId)
        .order("name");
      setDcRooms((roomRows as { id: string; name: string }[]) || []);
    } catch {
      setDcRooms([]);
    }
  };

  const resetDateChangeState = () => {
    setChangingDatesId(null);
    setDateRange(undefined);
    setDateChangePriceInfo(null);
    setDateChangeSlipFile(null);
    setDateChangeSlipPreview(null);
    setNoRefundConfirmed(false);
    setDcPhoneSlipReceived(false);
    setDcDisabledDates(new Set());
    setDcRooms([]);
    setDcSelectedRoomId(null);
    if (dcPollingRef.current) {
      clearInterval(dcPollingRef.current);
      dcPollingRef.current = null;
    }
  };

  // Poll for phone slip upload (date change additional payment)
  useEffect(() => {
    if (
      dateChangePriceInfo &&
      dateChangePriceInfo.price_difference > 0 &&
      !dateChangeSlipFile &&
      !dcPhoneSlipReceived &&
      !isMobile
    ) {
      dcPollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/slip-upload/${dcUploadSessionId}`);
          const data = await res.json();
          if (data.uploaded && data.url) {
            setDcPhoneSlipReceived(true);
            // Convert URL to a File-like object for the submit handler
            const response = await fetch(data.url);
            const blob = await response.blob();
            const file = new File([blob], "phone-slip.jpg", { type: blob.type });
            setDateChangeSlipFile(file);
            setDateChangeSlipPreview(data.url);
            toast.success(t("slipReceivedFromPhone"));
            if (dcPollingRef.current) {
              clearInterval(dcPollingRef.current);
              dcPollingRef.current = null;
            }
          }
        } catch {
          // ignore polling errors
        }
      }, 3000);
    }
    return () => {
      if (dcPollingRef.current) {
        clearInterval(dcPollingRef.current);
        dcPollingRef.current = null;
      }
    };
  }, [dateChangePriceInfo, dateChangeSlipFile, dcPhoneSlipReceived, isMobile, dcUploadSessionId, t]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/bookings/search?query=${encodeURIComponent(query.trim())}&homestay_id=${homestayId}`);
      const data = await res.json();
      setResults(data.bookings || []);
      if (data.cancellation_days !== undefined) {
        setCancellationDays(data.cancellation_days);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setSearched(false);
      setReviewingBookingId(null);
      setReviewRating(0);
      setReviewHover(0);
      setReviewComment("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 rounded-full shadow-sm"
        >
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {t("searchBooking")}
        </Button>
      </DialogTrigger>
      <DialogContent className={`max-w-md ${changingDatesId ? "sm:max-w-xl" : "sm:max-w-lg"}`}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder={t("placeholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
                autoFocus
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="bg-brand text-white hover:bg-brand-hover"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("search")}
            </Button>
          </div>

          {/* Results */}
          <div className={`${changingDatesId ? "max-h-[75vh]" : "max-h-80"} space-y-2 overflow-y-auto`}>
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}

            {!loading && searched && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Search className="h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">{t("noResults")}</p>
              </div>
            )}

            {!loading && results.map((booking) => {
              const config = statusConfig[booking.status] || statusConfig.pending;
              const StatusIcon = config.icon;

              return (
                <div
                  key={booking.id}
                  className="rounded-lg border bg-gray-50 overflow-hidden"
                >
                 <AnimatePresence mode="wait" initial={false}>
                  {changingDatesId !== booking.id ? (
                  <motion.div key="details" exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 text-sm">
                      {booking.guest_name}
                    </span>
                    <Badge variant="secondary" className={config.color}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {t(`status.${booking.status}`)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {fmtDateStr(booking.check_in, "d MMM yyyy", locale)} → {fmtDateStr(booking.check_out, "d MMM yyyy", locale)}
                    </span>
                    <span>{booking.room_name}</span>
                    <span className="font-medium text-gray-900">
                      ฿{booking.total_price.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 break-all">
                    ID: {booking.id}
                  </p>

                  {/* Check-in + Cancel buttons: confirmed + not checked in yet */}
                  {booking.status === "confirmed" && !booking.checked_in_at && (
                    <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                      <Button
                        size="sm"
                        className="w-full bg-brand text-white hover:bg-brand-hover"
                        onClick={() => handleCheckin(booking.id, booking.guest_email, "checkin")}
                        disabled={checkingIn === booking.id}
                      >
                        {checkingIn === booking.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <LogIn className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {t("checkIn")}
                      </Button>

                      {/* Cancel button — show when cancellation is enabled and within window */}
                      {cancellationDays > 0 && (() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const checkInDate = new Date(booking.check_in);
                        checkInDate.setHours(0, 0, 0, 0);
                        const daysUntil = Math.floor((checkInDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        return daysUntil >= cancellationDays;
                      })() && (
                        cancellingId === booking.id ? (
                          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
                            <p className="text-xs font-medium text-red-700">{t("cancelConfirmDesc")}</p>
                            <Textarea
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                              placeholder={t("cancelReasonPlaceholder")}
                              rows={2}
                              className="text-sm"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => { setCancellingId(null); setCancelReason(""); }}
                                disabled={submittingCancel}
                              >
                                {t("cancelKeepBooking")}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="flex-1"
                                onClick={() => handleCancelBooking(booking.id)}
                                disabled={submittingCancel}
                              >
                                {submittingCancel ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                {t("cancelConfirmButton")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setCancellingId(booking.id)}
                          >
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            {t("cancelBooking")}
                          </Button>
                        )
                      )}

                      {/* Pending date change badge */}
                      {booking.pending_date_change && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-1">
                            <Clock className="h-3.5 w-3.5" />
                            {t("dateChangePending")}
                          </div>
                          <p className="text-xs text-blue-600">
                            {t("dateChangePendingDesc", {
                              checkIn: fmtDateStr(booking.pending_date_change.new_check_in, "d MMM yyyy", locale),
                              checkOut: fmtDateStr(booking.pending_date_change.new_check_out, "d MMM yyyy", locale),
                            })}
                          </p>
                        </div>
                      )}

                      {/* Change Dates button — only if no pending request */}
                      {!booking.pending_date_change && changingDatesId !== booking.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-gray-600 border-gray-200 hover:bg-gray-50"
                          onClick={() => {
                            setChangingDatesId(booking.id);
                            setDcSelectedRoomId(booking.room_id);
                            fetchDisabledDates(booking);
                            fetchRoomsForHomestay();
                          }}
                        >
                          <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                          {t("changeDates")}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Check-out button: confirmed + checked in + not checked out yet */}
                  {booking.status === "confirmed" && booking.checked_in_at && !booking.checked_out_at && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 mb-2">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        {t("checkedIn")}
                      </Badge>

                      {/* Show balance due warning if deposit booking */}
                      {booking.total_price - (booking.amount_paid || 0) > 0 && (
                        <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {t("balanceDueCheckout", { amount: (booking.total_price - (booking.amount_paid || 0)).toLocaleString() })}
                          </div>

                          {/* Pay remaining flow */}
                          {payingBalanceId === booking.id ? (
                            <div className="space-y-2 mt-2">
                              {/* Method selector — show if no method chosen yet */}
                              {!balancePayMethod && (
                                <div className="flex gap-2">
                                  {promptpayId && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1"
                                      onClick={() => setBalancePayMethod("transfer")}
                                    >
                                      <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                                      {t("payViaTransfer")}
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => setBalancePayMethod("cash")}
                                  >
                                    <Download className="mr-1.5 h-3.5 w-3.5" />
                                    {t("payViaCash")}
                                  </Button>
                                </div>
                              )}

                              {/* Transfer flow */}
                              {balancePayMethod === "transfer" && promptpayId && (
                                <div className="space-y-2">
                                  <div className="flex justify-center">
                                    <div className="rounded-lg border bg-white p-2">
                                      <QRCodeSVG
                                        value={generatePayload(promptpayId, { amount: booking.total_price - (booking.amount_paid || 0) })}
                                        size={120}
                                        level="M"
                                      />
                                    </div>
                                  </div>
                                  <p className="text-center text-sm font-bold text-gray-900">
                                    ฿{(booking.total_price - (booking.amount_paid || 0)).toLocaleString()}
                                  </p>
                                  <input
                                    ref={balanceFileRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0] || null;
                                      setBalanceSlipFile(f);
                                      setBalanceSlipPreview(f ? URL.createObjectURL(f) : null);
                                    }}
                                  />
                                  {balanceSlipPreview ? (
                                    <div className="text-center">
                                      <img src={balanceSlipPreview} alt="Slip" className="mx-auto max-h-32 rounded-lg" />
                                      <Button
                                        size="sm"
                                        className="mt-2 w-full bg-brand text-white hover:bg-brand-hover"
                                        onClick={() => handlePayBalance(booking)}
                                        disabled={submittingBalance}
                                      >
                                        {submittingBalance ? (
                                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                                        )}
                                        {t("payRemaining", { amount: (booking.total_price - (booking.amount_paid || 0)).toLocaleString() })}
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full"
                                      onClick={() => balanceFileRef.current?.click()}
                                    >
                                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                                      {t("uploadSlip")}
                                    </Button>
                                  )}
                                </div>
                              )}

                              {/* Cash flow */}
                              {balancePayMethod === "cash" && (
                                <div className="space-y-2">
                                  <p className="text-center text-sm font-bold text-gray-900">
                                    ฿{(booking.total_price - (booking.amount_paid || 0)).toLocaleString()}
                                  </p>
                                  <Button
                                    size="sm"
                                    className="w-full bg-brand text-white hover:bg-brand-hover"
                                    onClick={() => handlePayCash(booking)}
                                    disabled={submittingBalance}
                                  >
                                    {submittingBalance ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Download className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    {t("cashConfirm")} ฿{(booking.total_price - (booking.amount_paid || 0)).toLocaleString()}
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className="w-full bg-brand text-white hover:bg-brand-hover mt-1"
                              onClick={() => { setPayingBalanceId(booking.id); setBalancePayMethod(null); }}
                            >
                              <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                              {t("payRemaining", { amount: (booking.total_price - (booking.amount_paid || 0)).toLocaleString() })}
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Checkout button — only if fully paid */}
                      {booking.total_price - (booking.amount_paid || 0) <= 0 && (
                        <Button
                          size="sm"
                          className="w-full bg-brand text-white hover:bg-brand-hover"
                          onClick={() => handleCheckin(booking.id, booking.guest_email, "checkout")}
                          disabled={checkingIn === booking.id}
                        >
                          {checkingIn === booking.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <LogOut className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {t("checkOut")}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Review section for completed bookings */}
                  {booking.status === "completed" && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      {booking.has_review ? (
                        <Badge variant="secondary" className="bg-brand-50 text-brand">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {tr("reviewed")}
                        </Badge>
                      ) : reviewingBookingId === booking.id ? (
                        <div className="space-y-2">
                          {/* Star rating */}
                          <div>
                            <p className="text-xs font-medium text-gray-700 mb-1">{tr("ratingLabel")}</p>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  className="p-0.5 transition-transform hover:scale-110"
                                  onClick={() => setReviewRating(star)}
                                  onMouseEnter={() => setReviewHover(star)}
                                  onMouseLeave={() => setReviewHover(0)}
                                >
                                  <Star
                                    className="h-5 w-5"
                                    style={{
                                      fill: star <= (reviewHover || reviewRating) ? "#374151" : "transparent",
                                      color: star <= (reviewHover || reviewRating) ? "#374151" : "#d1d5db",
                                    }}
                                  />
                                </button>
                              ))}
                              {reviewRating === 0 && (
                                <span className="ml-2 text-xs text-gray-400">{tr("tapToRate")}</span>
                              )}
                            </div>
                          </div>
                          {/* Comment */}
                          <Textarea
                            placeholder={tr("commentPlaceholder")}
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            rows={2}
                            className="text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setReviewingBookingId(null);
                                setReviewRating(0);
                                setReviewHover(0);
                                setReviewComment("");
                              }}
                            >
                              {t("cancelReview")}
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-brand text-white hover:bg-brand-hover"
                              onClick={() => handleSubmitReview(booking.id, booking.guest_email)}
                              disabled={reviewRating === 0 || submittingReview}
                            >
                              {submittingReview ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                tr("submitReview")
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          onClick={() => setReviewingBookingId(booking.id)}
                        >
                          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                          {tr("writeReview")}
                        </Button>
                      )}
                    </div>
                  )}
                  </motion.div>
                  ) : (
                  <motion.div key="calendar" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.25 }} className="p-3 space-y-2">
                    <div className="flex items-center gap-3 mb-1">
                      <button onClick={resetDateChangeState} className="p-1.5 rounded-full hover:bg-gray-200 text-gray-400 transition-colors"><ArrowLeft size={16} /></button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700">{t("changeDatesDesc")}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {booking.room_name} · {fmtDateStr(booking.check_in, "d MMM", locale)} → {fmtDateStr(booking.check_out, "d MMM", locale)} · ฿{booking.total_price.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Room selector */}
                    {dcRooms.length > 1 && (
                      <div className="px-1">
                        <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t("selectRoom")}</label>
                        <select
                          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
                          value={dcSelectedRoomId || ""}
                          onChange={(e) => {
                            const newRoomId = e.target.value;
                            setDcSelectedRoomId(newRoomId);
                            setDateRange(undefined);
                            setDateChangePriceInfo(null);
                            setDateChangeSlipFile(null);
                            setDateChangeSlipPreview(null);
                            setNoRefundConfirmed(false);
                            setDcPhoneSlipReceived(false);
                            fetchDisabledDates(booking, newRoomId);
                          }}
                        >
                          {dcRooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}{r.id === booking.room_id ? ` (${t("currentRoom")})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {dcLoadingAvailability && (
                      <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </div>
                    )}
                    <div className="flex justify-center">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={(range) => {
                          setDateRange(range);
                          setDateChangePriceInfo(null);
                          setDateChangeSlipFile(null);
                          setDateChangeSlipPreview(null);
                          setNoRefundConfirmed(false);
                          setDcPhoneSlipReceived(false);
                        }}
                        disabled={[
                          { before: new Date() },
                          (date: Date) => {
                            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                            return dcDisabledDates.has(dateStr);
                          },
                        ]}
                        numberOfMonths={1}
                        className="rounded-md border bg-white"
                      />
                    </div>

                    {dateRange?.from && dateRange?.to && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded bg-white p-2 border">
                            <span className="text-gray-500">{t("currentDates")}</span>
                            <p className="font-medium text-gray-700">
                              {fmtDateStr(booking.check_in, "d MMM", locale)} → {fmtDateStr(booking.check_out, "d MMM", locale)}
                            </p>
                          </div>
                          <div className="rounded bg-white p-2 border">
                            <span className="text-gray-500">{t("newDates")}</span>
                            <p className="font-medium text-gray-900">
                              {format(dateRange.from, "d MMM")} → {format(dateRange.to, "d MMM")}
                            </p>
                          </div>
                        </div>

                        {dateChangePriceInfo && (
                          <div className="rounded bg-white p-2 border text-xs space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t("originalPrice")}</span>
                              <span>฿{booking.total_price.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t("newPrice")}</span>
                              <span className="font-medium">฿{dateChangePriceInfo.new_total_price.toLocaleString()}</span>
                            </div>
                            {dateChangePriceInfo.price_difference !== 0 && (
                              <div className="flex justify-between font-medium">
                                <span className="text-gray-500">{t("priceDifference")}</span>
                                <span className={dateChangePriceInfo.price_difference > 0 ? "text-red-600" : "text-green-600"}>
                                  {dateChangePriceInfo.price_difference > 0 ? "+" : ""}฿{dateChangePriceInfo.price_difference.toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {dateChangePriceInfo && dateChangePriceInfo.price_difference < 0 && !noRefundConfirmed && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                              <div className="space-y-2">
                                <p className="text-xs text-amber-700">
                                  {t("noRefundWarning", { amount: Math.abs(dateChangePriceInfo.price_difference).toLocaleString() })}
                                </p>
                                <Button
                                  size="sm"
                                  className="w-full bg-amber-600 text-white hover:bg-amber-700"
                                  onClick={() => setNoRefundConfirmed(true)}
                                >
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  {t("submitDateChange")}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {dateChangePriceInfo && dateChangePriceInfo.price_difference > 0 && promptpayId && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-red-600">
                              {t("additionalPayment", { amount: dateChangePriceInfo.price_difference.toLocaleString() })}
                            </p>
                            <input
                              ref={dateChangeFileRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                setDateChangeSlipFile(f);
                                setDateChangeSlipPreview(f ? URL.createObjectURL(f) : null);
                              }}
                            />
                            {dateChangeSlipPreview || dcPhoneSlipReceived ? (
                              <div className="text-center space-y-2">
                                {dateChangeSlipPreview && (
                                  <img src={dateChangeSlipPreview} alt="Slip" className="mx-auto max-h-32 rounded-lg" />
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  onClick={() => {
                                    setDateChangeSlipFile(null);
                                    setDateChangeSlipPreview(null);
                                    setDcPhoneSlipReceived(false);
                                  }}
                                >
                                  {t("uploadSlip")}
                                </Button>
                              </div>
                            ) : (
                              <>
                              <div className="flex flex-col items-center gap-2">
                                <div ref={dcQrRef} className="rounded-lg border bg-white p-2">
                                  <QRCodeSVG
                                    value={generatePayload(promptpayId, { amount: dateChangePriceInfo.price_difference })}
                                    size={100}
                                    level="M"
                                  />
                                </div>
                                {isMobile && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const container = dcQrRef.current;
                                      if (!container) return;
                                      const svgEl = container.querySelector("svg");
                                      if (!svgEl) return;
                                      const svgData = new XMLSerializer().serializeToString(svgEl);
                                      const canvas = document.createElement("canvas");
                                      const ctx = canvas.getContext("2d");
                                      if (!ctx) return;
                                      const img = new Image();
                                      img.onload = () => {
                                        canvas.width = img.width * 2;
                                        canvas.height = img.height * 2;
                                        ctx.fillStyle = "#ffffff";
                                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                        const link = document.createElement("a");
                                        link.download = `promptpay-${dateChangePriceInfo.price_difference}.png`;
                                        link.href = canvas.toDataURL("image/png");
                                        link.click();
                                      };
                                      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
                                    }}
                                    className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
                                  >
                                    <Download className="h-3 w-3" />{t("saveQrImage")}
                                  </button>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                onClick={() => dateChangeFileRef.current?.click()}
                              >
                                <Upload className="mr-1.5 h-3.5 w-3.5" />
                                {t("uploadSlip")}
                              </Button>
                              {!isMobile && (
                                <>
                                  <div className="relative flex items-center gap-3 py-1">
                                    <div className="flex-1 border-t border-gray-200" />
                                    <span className="text-[10px] font-medium text-gray-400">{t("orUploadFromPhone")}</span>
                                    <div className="flex-1 border-t border-gray-200" />
                                  </div>
                                  <div className="rounded-lg border bg-white p-3 text-center">
                                    <p className="mb-2 text-[10px] text-gray-500">{t("scanToUpload")}</p>
                                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-lg border bg-white p-1">
                                      <QRCodeSVG value={`${typeof window !== "undefined" ? window.location.origin : ""}/upload-slip/${dcUploadSessionId}`} size={80} level="M" />
                                    </div>
                                    <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />{t("waitingForPhoneUpload")}
                                    </div>
                                  </div>
                                </>
                              )}
                              </>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={resetDateChangeState}
                            disabled={submittingDateChange}
                          >
                            {t("cancelDateChange")}
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 bg-brand text-white hover:bg-brand-hover"
                            onClick={() => handleDateChangeSubmit(booking)}
                            disabled={submittingDateChange || (dateChangePriceInfo !== null && dateChangePriceInfo.price_difference > 0 && !dateChangeSlipFile) || (dateChangePriceInfo !== null && dateChangePriceInfo.price_difference < 0 && !noRefundConfirmed)}
                          >
                            {submittingDateChange ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {t("submitDateChange")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                  )}
                 </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
