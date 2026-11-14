"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, CalendarDays, Clock, CheckCircle2, XCircle, Loader2, MessageSquare, LogIn, LogOut, Upload, CreditCard, Download, Banknote, AlertTriangle, ArrowRightLeft, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { format, startOfToday, addMonths, subDays, eachDayOfInterval } from "date-fns";
import {
  getFullyBookedForRoom,
  firstUnavailableNight,
  makeStayDisabledMatcher,
} from "@/lib/booking-dates";
import { th as thLocale } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { fmtDate, fmtDateStr } from "@/lib/format-date";
import { billingTodayStr } from "@/lib/billing-dates";
import { useIsMobile } from "@/lib/use-is-mobile";
import { ReviewForm } from "@/components/reviews/review-form";
import { DateChangeSentDialog, type DateChangeSent } from "@/components/booking/date-change-sent-dialog";
import generatePayload from "promptpay-qr";
import { QRCodeSVG } from "qrcode.react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

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
  group_id: string | null;
  room_name: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  created_at: string;
  selected_options: { name: string; price: number }[] | null;
  has_review: boolean;
  pending_date_change: {
    id: string;
    new_check_in: string;
    new_check_out: string;
    new_total_price: number;
    price_difference: number;
    status: string;
    new_room_id: string | null;
    new_room_name: string | null;
  } | null;
}

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  pending: { color: "bg-amber-50 text-amber-700", icon: Clock },
  verified: { color: "bg-brand-50 text-brand", icon: CheckCircle2 },
  confirmed: { color: "bg-brand-50 text-brand", icon: CheckCircle2 },
  rejected: { color: "bg-destructive/10 text-destructive", icon: XCircle },
  cancelled: { color: "bg-destructive/10 text-destructive", icon: XCircle },
  completed: { color: "bg-earth-100 text-earth-700", icon: CheckCircle2 },
};

export type BookingSearchViewMode = "check-in-out" | "change-booking";

interface BookingSearchViewProps {
  mode: BookingSearchViewMode;
  homestayId: string;
  promptpayId?: string;
  hostName?: string;
  cancellationDays?: number;
  paymentDisplay?: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  facebookUrl?: string | null;
  hostPhone?: string | null;
}

export function BookingSearchView({ mode, homestayId, promptpayId, cancellationDays: propCancellationDays, paymentDisplay, bankName, bankAccountNumber, bankAccountName, facebookUrl, hostPhone }: BookingSearchViewProps) {
  const t = useTranslations("bookingSearch");
  const tr = useTranslations("reviews");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [reviewingBookingId, setReviewingBookingId] = useState<string | null>(null);
  const [reviewingGuestEmail, setReviewingGuestEmail] = useState("");
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [confirmingCheckInId, setConfirmingCheckInId] = useState<string | null>(null);
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
  const [dateChangePriceInfo, setDateChangePriceInfo] = useState<{ new_total_price: number; price_difference: number; additional_payment: number; amount_paid: number; deposit_available: boolean; new_deposit: number; full_outstanding: number } | null>(null);
  const [dcPaymentOption, setDcPaymentOption] = useState<"full" | "deposit">("deposit");
  const [dateChangeSlipFile, setDateChangeSlipFile] = useState<File | null>(null);
  const [dateChangeSlipPreview, setDateChangeSlipPreview] = useState<string | null>(null);
  const dateChangeFileRef = useRef<HTMLInputElement>(null);
  const [noRefundConfirmed, setNoRefundConfirmed] = useState(false);
  const isMobile = useIsMobile();
  const [dcUploadSessionId] = useState(() => crypto.randomUUID());
  const [dcPhoneSlipReceived, setDcPhoneSlipReceived] = useState(false);
  const dcPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dcDisabledDates, setDcDisabledDates] = useState<Set<string>>(new Set());
  // Set when a tap would have produced a stay running across an unusable night,
  // so the alert below can name the night that blocked it.
  const [dcCrossedNight, setDcCrossedNight] = useState<string | null>(null);
  const [dcLoadingAvailability, setDcLoadingAvailability] = useState(false);
  const [dcRooms, setDcRooms] = useState<{ id: string; name: string }[]>([]);
  const [dcSelectedRoomId, setDcSelectedRoomId] = useState<string | null>(null);
  const dcQrRef = useRef<HTMLDivElement>(null);
  const dcSummaryRef = useRef<HTMLDivElement>(null);
  // The price is previewed as soon as both dates are picked; a newer pick
  // makes an older answer stale.
  const [dcPreviewLoading, setDcPreviewLoading] = useState(false);
  const dcPreviewSeq = useRef(0);
  const dcScrollToSummary = useRef(false);
  const [dcUnavailableModal, setDcUnavailableModal] = useState<"unavailable" | "blocked" | null>(null);
  const dcUnavailableBookingRef = useRef<SearchResult | null>(null);
  const [dcSent, setDcSent] = useState<DateChangeSent | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const turnstilePassed = !!turnstileToken || turnstileError;

  const showCheckInOutActions = mode === "check-in-out";
  const showChangeBookingActions = mode === "change-booking";

  const isDcRangeValid = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return false;
    const end = subDays(dateRange.to, 1);
    if (end < dateRange.from) return false;
    const days = eachDayOfInterval({ start: dateRange.from, end });
    return days.every((d) => !dcDisabledDates.has(format(d, "yyyy-MM-dd")));
  }, [dateRange, dcDisabledDates]);

  // Availability is measured in NIGHTS: a stay is half-open [check-in, check-out),
  // so a night that is booked or blocked for this room still works as a CHECK-OUT.
  // Only while the check-out is missing does such a night become tappable — and
  // only as the check-out of THIS stay. react-day-picker sets from===to on the
  // first tap, which is the "check-out still missing" state.
  const dcPendingCheckIn =
    dateRange?.from && (!dateRange.to || dateRange.to.getTime() === dateRange.from.getTime())
      ? dateRange.from
      : null;
  const isDcDayDisabled = useMemo(
    () => makeStayDisabledMatcher(dcDisabledDates, dcPendingCheckIn),
    [dcDisabledDates, dcPendingCheckIn],
  );

  const dcEffectiveAdditional = useMemo(() => {
    if (!dateChangePriceInfo) return 0;
    if (dateChangePriceInfo.deposit_available && dcPaymentOption === "deposit") {
      return Math.max(0, dateChangePriceInfo.new_deposit - dateChangePriceInfo.amount_paid);
    }
    return dateChangePriceInfo.full_outstanding;
  }, [dateChangePriceInfo, dcPaymentOption]);

  // When the submit itself is answered with PAYMENT_REQUIRED (the price moved
  // since the preview), the summary changes below the button: bring it into view.
  useEffect(() => {
    const el = dcSummaryRef.current;
    if (!dateChangePriceInfo || !el || !dcScrollToSummary.current) return;
    dcScrollToSummary.current = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, [dateChangePriceInfo]);

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
          setPayingBalanceId(bookingId);
          toast.error(t("balanceDueCheckout", { amount: data.balance_due.toLocaleString() }));
        } else if (data.error === "ALREADY_CHECKED_IN") {
          toast.error(t("alreadyCheckedIn"));
        } else if (data.error === "ALREADY_CHECKED_OUT") {
          toast.error(t("alreadyCheckedOut"));
        } else {
          toast.error(t("checkInOutError"));
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
      toast.error(t("checkInOutError"));
    } finally {
      setCheckingIn(null);
      setConfirmingCheckInId(null);
    }
  };

  const handlePayBalance = async (booking: SearchResult) => {
    if (!balanceSlipFile || !promptpayId) return;
    setSubmittingBalance(true);
    try {
      const balanceDue = booking.total_price - (booking.amount_paid || 0);

      const verifyForm = new FormData();
      verifyForm.append("file", balanceSlipFile);
      verifyForm.append("expected_amount", balanceDue.toString());
      verifyForm.append("expected_receiver", promptpayId);
      if (bankAccountNumber) {
        verifyForm.append("expected_receiver_bank", bankAccountNumber);
      }

      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        body: verifyForm,
      });
      const verifyData = await verifyRes.json();

      if (verifyRes.status === 409 && verifyData.duplicate) {
        toast.error(t("errorSlipDuplicate"));
        setBalanceSlipFile(null);
        setBalanceSlipPreview(null);
        if (balanceFileRef.current) balanceFileRef.current.value = "";
        setSubmittingBalance(false);
        return;
      }

      if (!verifyData.verified) {
        toast.error(verifyData.message || t("errorSlipVerify"));
        setBalanceSlipFile(null);
        setBalanceSlipPreview(null);
        if (balanceFileRef.current) balanceFileRef.current.value = "";
        setSubmittingBalance(false);
        return;
      }

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
        toast.error(t("errorPayment"));
        setSubmittingBalance(false);
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
        toast.error(t("errorPayment"));
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

  const handleReviewSuccess = (bookingId: string) => {
    setResults((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, has_review: true } : b))
    );
    setReviewingBookingId(null);
    setReviewingGuestEmail("");
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
          toast.error(t("cancelError"));
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

  const resetDateChangeState = useCallback(() => {
    dcPreviewSeq.current += 1;
    setDcPreviewLoading(false);
    setChangingDatesId(null);
    setDateRange(undefined);
    setDateChangePriceInfo(null);
    setDateChangeSlipFile(null);
    setDateChangeSlipPreview(null);
    setNoRefundConfirmed(false);
    setDcPhoneSlipReceived(false);
    setDcPaymentOption("deposit");
    setDcDisabledDates(new Set());
    setDcCrossedNight(null);
    setDcRooms([]);
    setDcSelectedRoomId(null);
    if (dcPollingRef.current) {
      clearInterval(dcPollingRef.current);
      dcPollingRef.current = null;
    }
  }, []);

  const handleDateChangeSubmit = async (booking: SearchResult) => {
    if (!dateRange?.from || !dateRange?.to) return;
    setSubmittingDateChange(true);
    try {
      const newCheckIn = format(dateRange.from, "yyyy-MM-dd");
      const newCheckOut = format(dateRange.to, "yyyy-MM-dd");

      const body: Record<string, unknown> = {
        booking_id: booking.id,
        new_check_in: newCheckIn,
        new_check_out: newCheckOut,
        payment_option: dcPaymentOption,
      };

      if (dcSelectedRoomId && dcSelectedRoomId !== booking.room_id) {
        body.new_room_id = dcSelectedRoomId;
      }

      if (dateChangePriceInfo && dcEffectiveAdditional > 0 && dateChangeSlipFile && promptpayId) {
        const verifyForm = new FormData();
        verifyForm.append("file", dateChangeSlipFile);
        verifyForm.append("expected_amount", dcEffectiveAdditional.toString());
        verifyForm.append("expected_receiver", promptpayId);
        if (bankAccountNumber) {
          verifyForm.append("expected_receiver_bank", bankAccountNumber);
        }

        const verifyRes = await fetch("/api/verify-slip", { method: "POST", body: verifyForm });
        const verifyData = await verifyRes.json();

        if (verifyRes.status === 409 && verifyData.duplicate) {
          toast.error(t("errorSlipDuplicate"));
          setDateChangeSlipFile(null);
          setDateChangeSlipPreview(null);
          setDcPhoneSlipReceived(false);
          if (dateChangeFileRef.current) dateChangeFileRef.current.value = "";
          setSubmittingDateChange(false);
          return;
        }
        if (verifyData.slip_pending) {
          toast.error(t("errorSlipPending"));
          setSubmittingDateChange(false);
          return;
        }
        if (!verifyData.verified) {
          toast.error(verifyData.message || t("errorSlipVerify"));
          setDateChangeSlipFile(null);
          setDateChangeSlipPreview(null);
          setDcPhoneSlipReceived(false);
          if (dateChangeFileRef.current) dateChangeFileRef.current.value = "";
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
          dcScrollToSummary.current = true;
          setDateChangePriceInfo({ new_total_price: data.new_total_price, price_difference: data.price_difference, additional_payment: data.additional_payment, amount_paid: data.amount_paid, deposit_available: data.deposit_available || false, new_deposit: data.new_deposit || 0, full_outstanding: data.full_outstanding || 0 });
          setSubmittingDateChange(false);
          return;
        }
        if (data.error === "PENDING_EXISTS") {
          toast.error(t("pendingExists"));
        } else if (data.error === "DATES_UNAVAILABLE") {
          dcUnavailableBookingRef.current = booking;
          setDcUnavailableModal("unavailable");
        } else if (data.error === "DATES_BLOCKED") {
          dcUnavailableBookingRef.current = booking;
          setDcUnavailableModal("blocked");
        } else {
          toast.error(data.message || t("dateChangeError"));
        }
        return;
      }

      setDcSent({
        checkIn: fmtDate(dateRange.from, "d MMM yyyy", locale),
        checkOut: fmtDate(dateRange.to, "d MMM yyyy", locale),
        roomName: dcSelectedRoomId && dcSelectedRoomId !== booking.room_id
          ? (dcRooms.find((r) => r.id === dcSelectedRoomId)?.name ?? null)
          : null,
      });
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
                  new_room_id: dcSelectedRoomId,
                  new_room_name: dcSelectedRoomId ? (dcRooms.find((r) => r.id === dcSelectedRoomId)?.name ?? null) : null,
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

  // Asks the server for the new price without creating the request, so the
  // guest sees what they will pay, or the no-refund warning, before sending.
  // If the preview fails the guest can still send: the submit runs every check.
  const fetchDcPreview = async (booking: SearchResult, from: Date, to: Date) => {
    const seq = ++dcPreviewSeq.current;
    setDcPreviewLoading(true);
    try {
      const body: Record<string, unknown> = {
        booking_id: booking.id,
        new_check_in: format(from, "yyyy-MM-dd"),
        new_check_out: format(to, "yyyy-MM-dd"),
        preview: true,
      };
      if (dcSelectedRoomId && dcSelectedRoomId !== booking.room_id) body.new_room_id = dcSelectedRoomId;
      const res = await fetch("/api/bookings/change-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (seq !== dcPreviewSeq.current) return;
      if (res.ok && data.preview) {
        setDateChangePriceInfo({ new_total_price: data.new_total_price, price_difference: data.price_difference, additional_payment: data.additional_payment, amount_paid: data.amount_paid, deposit_available: data.deposit_available || false, new_deposit: data.new_deposit || 0, full_outstanding: data.full_outstanding || 0 });
      } else if (data.error === "DATES_UNAVAILABLE" || data.error === "DATES_BLOCKED") {
        dcUnavailableBookingRef.current = booking;
        setDcUnavailableModal(data.error === "DATES_BLOCKED" ? "blocked" : "unavailable");
      } else if (data.error === "PENDING_EXISTS") {
        toast.error(t("pendingExists"));
      }
    } catch {
      // Network failure: leave the price unknown; the submit still checks it.
    } finally {
      if (seq === dcPreviewSeq.current) setDcPreviewLoading(false);
    }
  };

  const fetchDisabledDates = async (booking: SearchResult, overrideRoomId?: string) => {
    const targetRoomId = overrideRoomId || booking.room_id;
    setDcLoadingAvailability(true);
    try {
      const availRes = await fetch(`/api/bookings/availability?homestay_id=${homestayId}`, { cache: "no-store" });
      const availData = await availRes.json();
      const bookedRanges: { id: string; room_id: string | null; check_in: string; check_out: string }[] = availData.bookedRanges || [];

      const supabase = createClient();
      const { data: blockedRows } = await supabase
        .from("blocked_dates")
        .select("date, room_id")
        .eq("homestay_id", homestayId);

      let roomQty = 1;
      if (targetRoomId) {
        const { data: roomRow } = await supabase
          .from("rooms")
          .select("quantity")
          .eq("id", targetRoomId)
          .single();
        if (roomRow) roomQty = (roomRow as { quantity: number }).quantity || 1;
      }

      const booked = targetRoomId ? getFullyBookedForRoom(targetRoomId, roomQty, bookedRanges) : new Set<string>();
      const blocked = new Set<string>();
      (blockedRows || []).forEach((d: { date: string; room_id: string | null }) => {
        if (d.room_id === null || d.room_id === targetRoomId) {
          blocked.add(d.date);
        }
      });

      // Booked and blocked both mean "nobody can sleep here that night", and
      // both are equally fine to check out on, so one set covers the picker.
      setDcDisabledDates(new Set([...booked, ...blocked]));
    } catch {
      // Fail silently
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

  const handleDcUnavailableClose = () => {
    const booking = dcUnavailableBookingRef.current;
    setDcUnavailableModal(null);
    dcUnavailableBookingRef.current = null;
    if (booking) {
      fetchDisabledDates(booking, dcSelectedRoomId || undefined);
    }
    setDateRange(undefined);
    setDateChangePriceInfo(null);
    setDateChangeSlipFile(null);
    setDateChangeSlipPreview(null);
    setNoRefundConfirmed(false);
    setDcPhoneSlipReceived(false);
    setDcPaymentOption("deposit");
    setDcCrossedNight(null);
  };

  useEffect(() => {
    if (
      dateChangePriceInfo &&
      dcEffectiveAdditional > 0 &&
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
  }, [dateChangePriceInfo, dcEffectiveAdditional, dateChangeSlipFile, dcPhoneSlipReceived, isMobile, dcUploadSessionId, t]);

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

  return (
    <>
      <div className="space-y-4">
        {/* Same label, field + button as the reviews lookup (review-submission.tsx): keep the two in step. */}
        <div>
        <Label htmlFor="booking-search-query" className="block text-sm font-semibold text-earth-700">
          {t("searchLabel")}
        </Label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-500" size={16} aria-hidden="true" />
            <Input
              id="booking-search-query"
              enterKeyHint="search"
              autoComplete="off"
              placeholder={t("placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!turnstilePassed}
              className="!pl-10 p-3.5 !h-12 rounded-xl !border !border-earth-500 !bg-white hover:!border-earth-700 transition-all text-base md:text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-2 focus-visible:!ring-brand focus-visible:!ring-offset-2"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !query.trim() || !turnstilePassed}
            className="inline-flex h-12 w-full shrink-0 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto sm:min-w-28"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("search")}
          </button>
        </div>
        </div>
        {turnstileSiteKey && !turnstilePassed && (
          <div className="flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => {
                setTurnstileToken(null);
                setTurnstileError(true);
              }}
              options={{ theme: "light", size: "normal" }}
            />
          </div>
        )}

        <div className="space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-earth-400" />
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="h-8 w-8 text-earth-300" />
              <p className="mt-2 text-sm text-earth-500">{t("noResults")}</p>
            </div>
          )}

          {!loading && results.map((booking) => {
            const config = statusConfig[booking.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const isCheckedInStay = booking.status === "confirmed" && !!booking.checked_in_at && !booking.checked_out_at;
            const balanceDue = booking.total_price - (booking.amount_paid || 0);
            const isChangingThisBooking = changingDatesId === booking.id;
            const showCalendarPane = showChangeBookingActions && isChangingThisBooking;

            return (
              <div
                key={booking.id}
                className="rounded-2xl border border-earth-200 bg-white overflow-hidden"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {!showCalendarPane ? (
                    <motion.div key="details" exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-earth-900 text-sm">
                          {booking.guest_name}
                        </span>
                        <Badge variant="secondary" className={config.color}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {isCheckedInStay ? t("checkedIn") : t(`status.${booking.status}`)}
                        </Badge>
                      </div>
                      {/* Phones: one line each for dates, house and amounts; from sm they share a wrapping row. */}
                      <div className="flex flex-col gap-1 text-xs text-earth-600 sm:flex-row sm:flex-wrap sm:gap-x-3">
                        <span className="flex items-center gap-1.5 text-earth-800">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {fmtDateStr(booking.check_in, "d MMM yyyy", locale)} → {fmtDateStr(booking.check_out, "d MMM yyyy", locale)}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{booking.room_name}</span>
                        {booking.group_id && (
                          <span className="rounded-full bg-earth-200 px-2.5 py-0.5 text-xs font-medium text-earth-700">
                            {t("groupBookingBadge")}
                          </span>
                        )}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                        <span className="font-medium text-earth-900">
                          ฿{booking.total_price.toLocaleString()}
                        </span>
                        {booking.selected_options && booking.selected_options.length > 0 && (
                          <span className="text-earth-600">
                            {t("options")}: {booking.selected_options.map((o: { name: string }) => o.name).join(", ")}
                          </span>
                        )}
                        {booking.payment_type === "deposit" && (
                          <span className="text-earth-600">
                            {t("amountPaid")}: ฿{(booking.amount_paid || 0).toLocaleString()}
                          </span>
                        )}
                        {(booking.amount_paid || 0) < booking.total_price && (
                          <span className="font-medium text-amber-700">
                            {t("remainingBalance")}: ฿{(booking.total_price - (booking.amount_paid || 0)).toLocaleString()}
                          </span>
                        )}
                        </span>
                      </div>
                      <p className="text-xs text-earth-600">
                        ID: {booking.id.slice(0, 8)}
                      </p>

                      {/* Confirmed + not checked in */}
                      {booking.status === "confirmed" && !booking.checked_in_at && (
                        <div className="mt-2 pt-2 border-t border-earth-200 space-y-2">
                          {showCheckInOutActions && (
                            booking.check_in > billingTodayStr() ? (
                              // Before the stay the button stays visible but disabled, with the day it opens.
                              <div className="space-y-1.5">
                                <Button
                                  className="h-11 w-full rounded-full bg-brand text-white hover:bg-brand-hover"
                                  disabled
                                  aria-describedby={`checkin-from-${booking.id}`}
                                >
                                  <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                  {t("checkIn")}
                                </Button>
                                <p id={`checkin-from-${booking.id}`} className="text-center text-xs text-earth-600">
                                  {t("checkInFrom", { date: fmtDateStr(booking.check_in, "d MMM yyyy", locale) })}
                                </p>
                              </div>
                            ) : confirmingCheckInId === booking.id ? (
                              <div className="space-y-3 rounded-xl bg-earth-50 p-3">
                                <p className="text-sm font-medium text-earth-900">
                                  {t("checkInConfirmTitle", { house: booking.room_name })}
                                </p>
                                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                  <Button
                                    variant="outline"
                                    className="h-11 flex-1 rounded-full border-earth-200 bg-white"
                                    onClick={() => setConfirmingCheckInId(null)}
                                    disabled={checkingIn === booking.id}
                                  >
                                    {t("checkInNotYet")}
                                  </Button>
                                  <Button
                                    className="h-11 flex-1 rounded-full bg-brand text-white hover:bg-brand-hover"
                                    onClick={() => handleCheckin(booking.id, booking.guest_email, "checkin")}
                                    disabled={checkingIn === booking.id}
                                  >
                                    {checkingIn === booking.id ? (
                                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                    )}
                                    {t("checkInConfirm")}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                className="h-11 w-full rounded-full bg-brand text-white hover:bg-brand-hover"
                                onClick={() => setConfirmingCheckInId(booking.id)}
                              >
                                <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                {t("checkIn")}
                              </Button>
                            )
                          )}

                          {showCheckInOutActions && cancellationDays > 0 && (() => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const checkInDate = new Date(booking.check_in);
                            checkInDate.setHours(0, 0, 0, 0);
                            const daysUntil = Math.floor((checkInDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                            return daysUntil >= cancellationDays;
                          })() && (
                            cancellingId === booking.id ? (
                              <div className="space-y-2 rounded-xl bg-red-50 p-3">
                                <p className="text-sm font-medium text-red-700">{t("cancelConfirmDesc")}</p>
                                <Textarea
                                  value={cancelReason}
                                  onChange={(e) => setCancelReason(e.target.value)}
                                  placeholder={t("cancelReasonPlaceholder")}
                                  aria-label={t("cancelReasonPlaceholder")}
                                  rows={2}
                                  className="bg-white text-base sm:text-sm"
                                />
                                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                  <Button
                                    variant="outline"
                                    className="h-11 flex-1 rounded-full border-earth-200 bg-white"
                                    onClick={() => { setCancellingId(null); setCancelReason(""); }}
                                    disabled={submittingCancel}
                                  >
                                    {t("cancelKeepBooking")}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    className="h-11 flex-1 rounded-full"
                                    onClick={() => handleCancelBooking(booking.id)}
                                    disabled={submittingCancel}
                                  >
                                    {submittingCancel ? (
                                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                    )}
                                    {t("cancelConfirmButton")}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                className="h-11 w-full rounded-full border-earth-200 text-destructive hover:bg-red-50 hover:text-destructive"
                                onClick={() => setCancellingId(booking.id)}
                              >
                                <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                {t("cancelBooking")}
                              </Button>
                            )
                          )}

                          {booking.pending_date_change && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1">
                                <Clock className="h-3.5 w-3.5" />
                                {t("dateChangePending")}
                              </div>
                              <p className="text-xs text-amber-800">
                                {t("dateChangePendingDesc", {
                                  checkIn: fmtDateStr(booking.pending_date_change.new_check_in, "d MMM yyyy", locale),
                                  checkOut: fmtDateStr(booking.pending_date_change.new_check_out, "d MMM yyyy", locale),
                                })}
                              </p>
                              {booking.pending_date_change.new_room_id && booking.pending_date_change.new_room_id !== booking.room_id && (
                                <p className="text-xs text-amber-800">
                                  {t("dateChangePendingRoom", {
                                    oldRoom: booking.room_name,
                                    newRoom: booking.pending_date_change.new_room_name || "—",
                                  })}
                                </p>
                              )}
                            </div>
                          )}

                          {showChangeBookingActions && !booking.pending_date_change && (
                            <Button
                              variant="outline"
                              className="h-11 w-full rounded-full border-earth-200 text-earth-800 hover:bg-earth-50"
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

                      {showChangeBookingActions && !(booking.status === "confirmed" && !booking.checked_in_at) && (
                        <p className="mt-2 border-t border-earth-200 pt-3 text-xs text-earth-600">{t("dcNotChangeable")}</p>
                      )}

                      {/* Confirmed + checked in + not checked out */}
                      {showCheckInOutActions && isCheckedInStay && booking.checked_in_at && (
                        <div className="mt-2 space-y-3 border-t border-earth-200 pt-3">
                          <p className="flex items-center gap-1.5 text-sm text-earth-700">
                            <CheckCircle2 className="h-4 w-4 text-brand" aria-hidden="true" />
                            {t("checkedInAt", { time: fmtDate(new Date(booking.checked_in_at), "d MMM yyyy HH:mm", locale) })}
                          </p>

                          {balanceDue > 0 && (
                            <div className="space-y-3">
                              <p id={`balance-due-${booking.id}`} className="text-sm font-medium text-earth-900">
                                {t("balanceBeforeCheckout")}
                              </p>

                              {payingBalanceId === booking.id ? (
                                <div className="space-y-3">
                                  {!balancePayMethod && (
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                      {promptpayId && (
                                        <Button
                                          variant="outline"
                                          className="h-11 flex-1 rounded-full border-earth-200"
                                          onClick={() => setBalancePayMethod("transfer")}
                                        >
                                          <CreditCard className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                          {t("payViaTransfer")}
                                        </Button>
                                      )}
                                      <Button
                                        variant="outline"
                                        className="h-11 flex-1 rounded-full border-earth-200"
                                        onClick={() => setBalancePayMethod("cash")}
                                      >
                                        <Banknote className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                        {t("payViaCash")}
                                      </Button>
                                    </div>
                                  )}

                                  {balancePayMethod === "transfer" && promptpayId && (
                                    <div className="space-y-3">
                                      {paymentDisplay === "bank" && bankName && bankAccountNumber && bankAccountName ? (
                                        <div className="space-y-1.5 rounded-xl bg-earth-50 p-3">
                                          <div className="flex justify-between text-sm">
                                            <span className="text-earth-600">{t("bankTransferTitle")}</span>
                                            <span className="font-medium text-earth-900">{bankName}</span>
                                          </div>
                                          <div className="flex justify-between text-sm">
                                            <span className="text-earth-600">{t("bankAccountNo")}</span>
                                            <span className="font-mono font-medium text-earth-900">{bankAccountNumber}</span>
                                          </div>
                                          <div className="flex justify-between text-sm">
                                            <span className="text-earth-600">{t("bankAccountHolderName")}</span>
                                            <span className="font-medium text-earth-900">{bankAccountName}</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex justify-center">
                                          <div className="rounded-xl border border-earth-200 bg-white p-3">
                                            <QRCodeSVG
                                              value={generatePayload(promptpayId, { amount: balanceDue })}
                                              size={160}
                                              level="M"
                                            />
                                          </div>
                                        </div>
                                      )}
                                      <p className="text-center text-lg font-semibold tabular-nums text-earth-900">
                                        ฿{balanceDue.toLocaleString()}
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
                                        <div className="space-y-3 text-center">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={balanceSlipPreview} alt={t("slipPreview")} className="mx-auto max-h-40 rounded-lg" />
                                          <div className="flex justify-center gap-2">
                                            <Button
                                              variant="outline"
                                              className="h-11 rounded-full border-earth-200"
                                              onClick={() => {
                                                if (balanceFileRef.current) balanceFileRef.current.value = "";
                                                balanceFileRef.current?.click();
                                              }}
                                            >
                                              <ArrowRightLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                              {t("changeSlip")}
                                            </Button>
                                            <Button
                                              variant="outline"
                                              className="h-11 rounded-full border-earth-200 text-destructive hover:bg-red-50 hover:text-destructive"
                                              onClick={() => {
                                                setBalanceSlipFile(null);
                                                setBalanceSlipPreview(null);
                                                if (balanceFileRef.current) balanceFileRef.current.value = "";
                                              }}
                                            >
                                              <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                              {t("removeSlip")}
                                            </Button>
                                          </div>
                                          <Button
                                            className="h-11 w-full rounded-full bg-brand text-white hover:bg-brand-hover"
                                            onClick={() => handlePayBalance(booking)}
                                            disabled={submittingBalance}
                                          >
                                            {submittingBalance ? (
                                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                                            ) : (
                                              <CreditCard className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                            )}
                                            {t("payRemaining", { amount: balanceDue.toLocaleString() })}
                                          </Button>
                                        </div>
                                      ) : (
                                        <Button
                                          variant="outline"
                                          className="h-11 w-full rounded-full border-earth-200"
                                          onClick={() => balanceFileRef.current?.click()}
                                        >
                                          <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                          {t("uploadSlip")}
                                        </Button>
                                      )}
                                    </div>
                                  )}

                                  {balancePayMethod === "cash" && (
                                    <Button
                                      className="h-11 w-full rounded-full bg-brand text-white hover:bg-brand-hover"
                                      onClick={() => handlePayCash(booking)}
                                      disabled={submittingBalance}
                                    >
                                      {submittingBalance ? (
                                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                                      ) : (
                                        <Banknote className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                      )}
                                      {t("cashConfirm")} ฿{balanceDue.toLocaleString()}
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <Button
                                  className="h-11 w-full rounded-full bg-brand text-white hover:bg-brand-hover"
                                  onClick={() => { setPayingBalanceId(booking.id); setBalancePayMethod(null); }}
                                >
                                  <CreditCard className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                  {t("payRemaining", { amount: balanceDue.toLocaleString() })}
                                </Button>
                              )}
                            </div>
                          )}

                          {/* Shown while a balance is due too, disabled, so the guest sees the step after paying. */}
                          <Button
                            variant={balanceDue > 0 ? "outline" : "default"}
                            className={balanceDue > 0 ? "h-11 w-full rounded-full border-earth-200" : "h-11 w-full rounded-full bg-brand text-white hover:bg-brand-hover"}
                            onClick={() => handleCheckin(booking.id, booking.guest_email, "checkout")}
                            disabled={balanceDue > 0 || checkingIn === booking.id}
                            aria-describedby={balanceDue > 0 ? `balance-due-${booking.id}` : undefined}
                          >
                            {checkingIn === booking.id ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            )}
                            {t("checkOut")}
                          </Button>
                        </div>
                      )}

                      {/* Completed → review */}
                      {showCheckInOutActions && booking.status === "completed" && (
                        <div className="mt-2 pt-2 border-t border-earth-200">
                          {booking.has_review ? (
                            <Badge variant="secondary" className="bg-brand-50 text-brand">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {tr("reviewed")}
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              className="h-11 w-full rounded-full border-earth-200"
                              onClick={() => {
                                setReviewingBookingId(booking.id);
                                setReviewingGuestEmail(booking.guest_email);
                              }}
                            >
                              <MessageSquare className="mr-1.5 h-4 w-4" aria-hidden="true" />
                              {tr("writeReview")}
                            </Button>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div key="calendar" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.25 }} className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={resetDateChangeState} aria-label={t("cancelDateChange")} className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-earth-700 transition-colors hover:bg-earth-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><ArrowLeft size={18} aria-hidden="true" /></button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-earth-900">{t("changeDatesDesc")}</p>
                          <p className="text-xs text-earth-600 truncate">
                            {booking.room_name} · {fmtDateStr(booking.check_in, "d MMM", locale)} → {fmtDateStr(booking.check_out, "d MMM", locale)} · ฿{booking.total_price.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {dcRooms.length > 1 && (
                        <div>
                          <label htmlFor={`dc-house-${booking.id}`} className="mb-1.5 block text-xs font-medium text-earth-700">{t("selectRoom")}</label>
                          <select
                            id={`dc-house-${booking.id}`}
                            className="h-11 w-full rounded-xl border border-earth-500 bg-white px-3 text-base text-earth-900 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            value={dcSelectedRoomId || ""}
                            onChange={(e) => {
                              const newRoomId = e.target.value;
                              dcPreviewSeq.current += 1;
                              setDcPreviewLoading(false);
                              setDcSelectedRoomId(newRoomId);
                              setDateRange(undefined);
                              setDateChangePriceInfo(null);
                              setDateChangeSlipFile(null);
                              setDateChangeSlipPreview(null);
                              setNoRefundConfirmed(false);
                              setDcPhoneSlipReceived(false);
                              setDcCrossedNight(null);
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
                        <div className="flex items-center justify-center gap-2 py-4 text-xs text-earth-600">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        </div>
                      )}
                      <div className="flex justify-center">
                        <Calendar
                          mode="range"
                          selected={dateRange}
                          onSelect={(range, triggerDate) => {
                            const blocker =
                              range?.from && range?.to
                                ? firstUnavailableNight(dcDisabledDates, range.from, range.to)
                                : null;
                            // Beyond a night nobody can sleep in. Ignoring the tap
                            // would strand the guest — react-day-picker turns a tap
                            // on any earlier day into a range ENDING on the pending
                            // check-in — so restart on the tapped day and say why.
                            setDcCrossedNight(blocker);
                            setDateRange(blocker ? { from: triggerDate, to: undefined } : range);
                            setDateChangePriceInfo(null);
                            setDateChangeSlipFile(null);
                            setDateChangeSlipPreview(null);
                            setNoRefundConfirmed(false);
                            setDcPhoneSlipReceived(false);
                            if (!blocker && range?.from && range?.to && range.to > range.from) {
                              fetchDcPreview(booking, range.from, range.to);
                            } else {
                              dcPreviewSeq.current += 1;
                              setDcPreviewLoading(false);
                            }
                          }}
                          locale={locale === "th" ? thLocale : undefined}
                          captionLayout="dropdown"
                          startMonth={startOfToday()}
                          endMonth={addMonths(startOfToday(), 12)}
                          formatters={locale === "th" ? {
                            formatMonthDropdown: (date) =>
                              date.toLocaleDateString("th-TH", { month: "long" }),
                            formatYearDropdown: (date) =>
                              String(date.getFullYear() + 543),
                          } : undefined}
                          disabled={[{ before: new Date() }, isDcDayDisabled]}
                          numberOfMonths={1}
                          className="bg-white"
                        />
                      </div>

                      {dcCrossedNight && (
                        <div
                          role="alert"
                          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left"
                        >
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          <div>
                            <p className="text-xs font-bold text-amber-900">{t("crossBookedTitle")}</p>
                            <p className="mt-0.5 text-xs text-amber-800">
                              {t("crossBookedDesc", {
                                date: fmtDateStr(dcCrossedNight, "d MMM", locale),
                                newDate: dateRange?.from ? fmtDate(dateRange.from, "d MMM", locale) : "",
                              })}
                            </p>
                          </div>
                        </div>
                      )}

                      {dateRange?.from && dateRange?.to && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-xl bg-earth-50 p-3">
                              <span className="text-xs text-earth-600">{t("currentDates")}</span>
                              <p className="font-medium text-earth-800">
                                {fmtDateStr(booking.check_in, "d MMM", locale)} → {fmtDateStr(booking.check_out, "d MMM", locale)}
                              </p>
                            </div>
                            <div className="rounded-xl bg-earth-50 p-3">
                              <span className="text-xs text-earth-600">{t("newDates")}</span>
                              <p className="font-medium text-earth-900">
                                {fmtDate(dateRange.from, "d MMM", locale)} → {fmtDate(dateRange.to, "d MMM", locale)}
                              </p>
                            </div>
                          </div>

                          {dcPreviewLoading && (
                            <div role="status" className="flex items-center gap-2 rounded-xl bg-earth-50 p-3 text-xs text-earth-600">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              {t("dcPriceLoading")}
                            </div>
                          )}

                          {dateChangePriceInfo && !dcPreviewLoading && (
                            <div className="space-y-2">
                              <div ref={dcSummaryRef} tabIndex={-1} aria-label={t("dcPriceSummary")} className="scroll-mt-20 rounded-xl bg-earth-50 p-3 text-sm tabular-nums space-y-1.5 focus-visible:outline-2 focus-visible:outline-brand">
                                <div className="flex justify-between">
                                  <span className="text-earth-600">{t("originalPrice")}</span>
                                  <span>฿{booking.total_price.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-earth-600">{t("newPrice")}</span>
                                  <span className="font-medium">฿{dateChangePriceInfo.new_total_price.toLocaleString()}</span>
                                </div>
                                {dateChangePriceInfo.price_difference !== 0 && (
                                  <div className="flex justify-between font-medium">
                                    <span className="text-earth-600">{t("priceDifference")}</span>
                                    <span className="text-earth-900">
                                      {dateChangePriceInfo.price_difference > 0 ? "+" : ""}฿{dateChangePriceInfo.price_difference.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                                <div className="mt-1.5 space-y-1.5 border-t border-earth-200 pt-1.5">
                                  <div className="flex justify-between">
                                    <span className="text-earth-600">{t("amountPaid")}</span>
                                    <span>฿{dateChangePriceInfo.amount_paid.toLocaleString()}</span>
                                  </div>
                                  {dcEffectiveAdditional > 0 && (
                                    <div className="flex justify-between text-base font-semibold text-earth-900">
                                      <span>{t("additionalPaymentShort")}</span>
                                      <span>฿{dcEffectiveAdditional.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {Math.max(0, dateChangePriceInfo.new_total_price - dateChangePriceInfo.amount_paid - dcEffectiveAdditional) > 0 && (
                                    <div className="flex justify-between font-medium">
                                      <span className="text-earth-600">{t("dcBalanceAtCheckin")}</span>
                                      <span>฿{Math.max(0, dateChangePriceInfo.new_total_price - dateChangePriceInfo.amount_paid - dcEffectiveAdditional).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {dateChangePriceInfo.deposit_available && dcEffectiveAdditional > 0 && (
                                <div className="space-y-1.5">
                                  <p className="text-xs font-medium text-earth-700">{t("dcPaymentOptionTitle")}</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => { setDcPaymentOption("deposit"); setDateChangeSlipFile(null); setDateChangeSlipPreview(null); setDcPhoneSlipReceived(false); }}
                                      className={`rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${dcPaymentOption === "deposit" ? "border-brand bg-brand-50" : "border-earth-200 hover:border-earth-300"}`}>
                                      <p className="font-bold text-earth-900">{t("paymentDeposit")}</p>
                                      <p className="font-semibold tabular-nums text-earth-800">฿{Math.max(0, dateChangePriceInfo.new_deposit - dateChangePriceInfo.amount_paid).toLocaleString()}</p>
                                      <p className="mt-0.5 text-xs text-earth-600">{t("dcDepositDesc", { balance: Math.max(0, dateChangePriceInfo.new_total_price - dateChangePriceInfo.amount_paid - Math.max(0, dateChangePriceInfo.new_deposit - dateChangePriceInfo.amount_paid)).toLocaleString() })}</p>
                                    </button>
                                    <button type="button" onClick={() => { setDcPaymentOption("full"); setDateChangeSlipFile(null); setDateChangeSlipPreview(null); setDcPhoneSlipReceived(false); }}
                                      className={`rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${dcPaymentOption === "full" ? "border-brand bg-brand-50" : "border-earth-200 hover:border-earth-300"}`}>
                                      <p className="font-bold text-earth-900">{t("paymentFull")}</p>
                                      <p className="font-semibold tabular-nums text-earth-800">฿{dateChangePriceInfo.full_outstanding.toLocaleString()}</p>
                                      <p className="mt-0.5 text-xs text-earth-600">{t("dcFullDesc")}</p>
                                    </button>
                                  </div>
                                </div>
                              )}
                              {dcEffectiveAdditional === 0 && dateChangePriceInfo.price_difference >= 0 && (
                                <div className="rounded-xl bg-brand-50 p-3">
                                  <p className="text-xs text-brand">{t("dcNoPaymentNeeded")}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {dateChangePriceInfo && dcEffectiveAdditional === 0 && dateChangePriceInfo.price_difference < 0 && (
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                              <input
                                type="checkbox"
                                checked={noRefundConfirmed}
                                onChange={(e) => setNoRefundConfirmed(e.target.checked)}
                                className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                              />
                              <span>{t("noRefundWarning", { amount: Math.abs(dateChangePriceInfo.price_difference).toLocaleString() })}</span>
                            </label>
                          )}

                          {dateChangePriceInfo && dcEffectiveAdditional > 0 && promptpayId && (
                            <div className="space-y-2">
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
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={dateChangeSlipPreview} alt="Slip" className="mx-auto max-h-32 rounded-lg" />
                                  )}
                                  <div className="flex justify-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs"
                                      onClick={() => {
                                        if (dateChangeFileRef.current) dateChangeFileRef.current.value = "";
                                        dateChangeFileRef.current?.click();
                                      }}
                                    >
                                      <ArrowRightLeft className="mr-1 h-3 w-3" />
                                      {t("changeSlip")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                                      onClick={() => {
                                        setDateChangeSlipFile(null);
                                        setDateChangeSlipPreview(null);
                                        setDcPhoneSlipReceived(false);
                                        if (dateChangeFileRef.current) dateChangeFileRef.current.value = "";
                                      }}
                                    >
                                      <XCircle className="mr-1 h-3 w-3" />
                                      {t("removeSlip")}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex flex-col items-center gap-2">
                                    {paymentDisplay === "bank" && bankName && bankAccountNumber && bankAccountName ? (
                                      <div className="w-full rounded-xl bg-earth-50 p-3 space-y-1.5">
                                        <div className="flex justify-between text-sm">
                                          <span className="text-earth-600">{t("bankTransferTitle")}</span>
                                          <span className="font-medium text-earth-900">{bankName}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                          <span className="text-earth-600">{t("bankAccountNo")}</span>
                                          <span className="font-mono font-medium text-earth-900">{bankAccountNumber}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                          <span className="text-earth-600">{t("bankAccountHolderName")}</span>
                                          <span className="font-medium text-earth-900">{bankAccountName}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div ref={dcQrRef} className="rounded-xl border border-earth-200 bg-white p-3">
                                          <QRCodeSVG
                                            value={generatePayload(promptpayId, { amount: dcEffectiveAdditional })}
                                            size={160}
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
                                                link.download = `promptpay-${dcEffectiveAdditional}.png`;
                                                link.href = canvas.toDataURL("image/png");
                                                link.click();
                                              };
                                              img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
                                            }}
                                            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-earth-200 bg-white px-4 text-sm font-medium text-earth-800 hover:bg-earth-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                          >
                                            <Download className="h-4 w-4" aria-hidden="true" />{t("saveQrImage")}
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                  <Button
                                    variant="outline"
                                    className="h-11 w-full rounded-full border-earth-200"
                                    onClick={() => dateChangeFileRef.current?.click()}
                                  >
                                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                                    {t("uploadSlip")}
                                  </Button>
                                  {!isMobile && (
                                    <>
                                      <div className="relative flex items-center gap-3 py-1">
                                        <div className="flex-1 border-t border-earth-200" />
                                        <span className="text-xs font-medium text-earth-600">{t("orUploadFromPhone")}</span>
                                        <div className="flex-1 border-t border-earth-200" />
                                      </div>
                                      <div className="rounded-xl bg-earth-50 p-3 text-center">
                                        <p className="mb-2 text-xs text-earth-600">{t("scanToUpload")}</p>
                                        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-lg border bg-white p-1">
                                          <QRCodeSVG value={`${typeof window !== "undefined" ? window.location.origin : ""}/upload-slip/${dcUploadSessionId}`} size={80} level="M" />
                                        </div>
                                        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-earth-600">
                                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />{t("waitingForPhoneUpload")}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <Button
                              variant="outline"
                              className="h-11 flex-1 rounded-full border-earth-200"
                              onClick={resetDateChangeState}
                              disabled={submittingDateChange}
                            >
                              {t("cancelDateChange")}
                            </Button>
                            <Button
                              className="h-11 flex-1 rounded-full bg-brand text-white hover:bg-brand-hover"
                              onClick={() => handleDateChangeSubmit(booking)}
                              disabled={submittingDateChange || dcPreviewLoading || !isDcRangeValid || (dateChangePriceInfo !== null && dcEffectiveAdditional > 0 && !dateChangeSlipFile && !dcPhoneSlipReceived) || (dateChangePriceInfo !== null && dcEffectiveAdditional === 0 && dateChangePriceInfo.price_difference < 0 && !noRefundConfirmed)}
                            >
                              {submittingDateChange ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              {dateChangePriceInfo && dcEffectiveAdditional > 0
                                ? t("dcConfirmPaySubmit", { amount: dcEffectiveAdditional.toLocaleString() })
                                : t("submitDateChange")}
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

      <Dialog open={dcUnavailableModal !== null} onOpenChange={(o) => { if (!o) handleDcUnavailableClose(); }}>
        <DialogContent showCloseButton={false} className="z-[70]" overlayClassName="z-[70]">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center">
              {dcUnavailableModal === "blocked" ? t("dcBlockedTitle") : t("dcUnavailableTitle")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {dcUnavailableModal === "blocked" ? t("dcBlockedDesc") : t("dcUnavailableDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full bg-brand text-white hover:bg-brand-hover" onClick={handleDcUnavailableClose}>
              {t("dcChooseDifferentDates")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DateChangeSentDialog sent={dcSent} onClose={() => setDcSent(null)} facebookUrl={facebookUrl} hostPhone={hostPhone} />

      {reviewingBookingId && (
        <ReviewForm
          open={!!reviewingBookingId}
          onOpenChange={(open) => {
            if (!open) {
              setReviewingBookingId(null);
              setReviewingGuestEmail("");
            }
          }}
          bookingId={reviewingBookingId}
          guestEmail={reviewingGuestEmail}
          homestayId={homestayId}
          onSuccess={() => handleReviewSuccess(reviewingBookingId)}
        />
      )}
    </>
  );
}
