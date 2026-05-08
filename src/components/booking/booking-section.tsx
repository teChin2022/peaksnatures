"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { format, differenceInDays, eachDayOfInterval, parseISO, subDays, startOfToday, addMonths } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import { fmtDate } from "@/lib/format-date";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Wifi, Car, UtensilsCrossed, TreePine, Flame, Waves, Fish, BookOpen, Telescope,
  CalendarDays, Calendar as CalendarIcon, Users, CreditCard, Upload, CheckCircle2, Loader2,
  Camera, ImageIcon, X, Smartphone, ArrowRight, ArrowLeft, Clock, AlertTriangle,
  Download, Shield, Minus, Plus, User, ShieldUser, Mail, Phone, Sparkles, FileText, Lock, MousePointerClick, ListPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import type { Homestay, Room, BlockedDate, Host, RoomSeasonalPrice, RoomOption } from "@/types/database";
import { calculateTotalPrice, getPriceRange } from "@/lib/calculate-price";
import { getFullyBookedForRoom } from "@/lib/booking-dates";
import { getDepositForMonth } from "@/lib/get-deposit";
import { THAI_PROVINCES, getProvinceLabel } from "@/lib/provinces";
import { useIsMobile } from "@/lib/use-is-mobile";
import generatePayload from "promptpay-qr";
import { QRCodeSVG } from "qrcode.react";
import { HTMLContent } from "@/components/ui/html-content";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface BookedRange {
  room_id: string | null;
  check_in: string;
  check_out: string;
}

const EMPTY_BOOKED_RANGES: BookedRange[] = [];
const EMPTY_SEASONAL_PRICES: RoomSeasonalPrice[] = [];
const EMPTY_ROOM_OPTIONS: RoomOption[] = [];

function HoldCountdown({ expiresAt, onExpire }: { expiresAt: number | null; onExpire: () => void }) {
  const [timeLeft, setTimeLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) { setTimeLeft(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) { clearInterval(id); onExpire(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  if (timeLeft <= 0) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: timeLeft <= 60 ? '#fef2f2' : '#f3f4f6', color: timeLeft <= 60 ? '#dc2626' : '#111827' }}
    >
      <Clock className="h-3.5 w-3.5" />
      {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
    </div>
  );
}

const AMENITY_ICONS: Record<string, React.ElementType> = {
  WiFi: Wifi, Parking: Car, Kitchen: UtensilsCrossed, Garden: TreePine,
  BBQ: Flame, Kayaking: Waves, Fishing: Fish, Restaurant: UtensilsCrossed,
  Swimming: Waves, Telescope: Telescope, Fireplace: Flame, Library: BookOpen,
};

interface BookingSectionProps {
  homestay: Homestay;
  rooms: Room[];
  blockedDates: BlockedDate[];
  bookedRanges?: BookedRange[];
  host: Host;
  seasonalPrices?: RoomSeasonalPrice[];
  roomOptions?: RoomOption[];
  bookingDisabled?: boolean;
}

type BookingStep = "dates" | "details" | "payment";

export function BookingSection({
  homestay,
  rooms,
  blockedDates,
  bookedRanges = EMPTY_BOOKED_RANGES,
  host,
  seasonalPrices = EMPTY_SEASONAL_PRICES,
  roomOptions = EMPTY_ROOM_OPTIONS,
  bookingDisabled = false,
}: BookingSectionProps) {
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<BookingStep>("dates");
  const [showConfirmedModal, setShowConfirmedModal] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [numGuests, setNumGuests] = useState("2");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestProvince, setGuestProvince] = useState("");
  const [guestNote, setGuestNote] = useState("");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const provinceLabel = (v: string) => getProvinceLabel(v, locale);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [paymentPhase, setPaymentPhase] = useState<"qr" | "upload">("qr");
  const [paymentOption, setPaymentOption] = useState<"full" | "deposit">("full");
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [uploadSessionId, setUploadSessionId] = useState(() => crypto.randomUUID());
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<number | null>(null);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateMatchType, setDuplicateMatchType] = useState<"email" | "phone" | "both" | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [phoneSlipReceived, setPhoneSlipReceived] = useState(false);
  const [phoneSlipUrl, setPhoneSlipUrl] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  const handleSlipSelect = (file: File | null) => {
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setSlipFile(file);
    setSlipPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleRemoveSlip = () => {
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setSlipFile(null);
    setSlipPreview(null);
    setPhoneSlipReceived(false);
    setPhoneSlipUrl(null);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };
  const [bookingId, setBookingId] = useState<string | null>(null);

  // Detect when user returns from banking app (Page Visibility API)
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === "visible" && step === "payment" && paymentPhase === "qr" && !slipFile) {
      setPaymentPhase("upload");
      setShowWelcomeBack(true);
      setTimeout(() => setShowWelcomeBack(false), 4000);
    }
  }, [step, paymentPhase, slipFile]);

  useEffect(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [handleVisibilityChange]);

  // Poll for cross-device slip upload when in upload phase
  useEffect(() => {
    if (step === "payment" && paymentPhase === "upload" && !slipFile && !phoneSlipReceived) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/slip-upload/${uploadSessionId}`);
          const data = await res.json();
          if (data.uploaded && data.url) {
            setPhoneSlipReceived(true);
            setPhoneSlipUrl(data.url);
            setSlipPreview(data.url);
            // Create a dummy file reference so the submit button enables
            setSlipFile(new File(["phone-upload"], data.filename || "slip.jpg", { type: "image/jpeg" }));
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        } catch {
          // Silently ignore polling errors
        }
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [step, paymentPhase, slipFile, phoneSlipReceived, uploadSessionId]);

  // Listen for "book-room" custom event dispatched from RoomsSection
  useEffect(() => {
    const handler = (e: Event) => {
      const { roomId } = (e as CustomEvent<{ roomId: string }>).detail;
      if (roomId && rooms.some((r) => r.id === roomId)) {
        handleRoomChange(roomId);
        setStep("dates");
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    document.addEventListener("book-room", handler);
    return () => document.removeEventListener("book-room", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  // Broadcast the current step so MobileBookingBar can hide itself past step 1
  useEffect(() => {
    document.dispatchEvent(new CustomEvent("booking-step", { detail: { step } }));
  }, [step]);

  // Live booked ranges fetched client-side to stay up-to-date
  const [liveBookedRanges, setLiveBookedRanges] = useState<BookedRange[]>(bookedRanges);

  useEffect(() => {
    setMounted(true);
    // Fetch fresh availability on mount
    fetch(`/api/bookings/availability?homestay_id=${homestay.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.bookedRanges) {
          setLiveBookedRanges(data.bookedRanges);
        }
      })
      .catch(() => {
        // Fall back to server-provided data
      });
  }, [homestay.id]);

  const blockedDateSet = useMemo(() => {
    return new Set(
      blockedDates
        .filter((d) => d.room_id === null || !selectedRoomId || d.room_id === selectedRoomId)
        .map((d) => d.date)
    );
  }, [blockedDates, selectedRoomId]);

  // Compute fully-booked dates (same pattern as blocked dates — always visible)
  // A booking with check_in=12, check_out=14 occupies nights 12 & 13 (not 14)
  // So disabled dates = check_in .. check_out-1 (check_out day is free for new check-in)
  const bookedDatesForRoom = useMemo(() => {
    if (selectedRoomId) {
      const roomObj = rooms.find((r) => r.id === selectedRoomId);
      return getFullyBookedForRoom(selectedRoomId, roomObj?.quantity || 1, liveBookedRanges);
    }

    // No room selected: a date is disabled if it is fully booked in ALL rooms
    if (rooms.length === 0) return new Set<string>();
    const perRoom = rooms.map((r) => getFullyBookedForRoom(r.id, r.quantity || 1, liveBookedRanges));
    const allDates = new Set<string>();
    perRoom.forEach((s) => s.forEach((d) => allDates.add(d)));
    const fullyBookedEverywhere = new Set<string>();
    allDates.forEach((d) => {
      if (perRoom.every((s) => s.has(d))) fullyBookedEverywhere.add(d);
    });
    return fullyBookedEverywhere;
  }, [selectedRoomId, liveBookedRanges, rooms]);

  // When selecting check-out, compute which booked date (if any) is allowed
  // as a valid check-out and where to cap the selectable range.
  const allowedCheckoutKey = useMemo<string | null>(() => {
    if (!dateRange?.from) return null;
    // react-day-picker v9 sets from===to on first click; treat as "selecting checkout"
    if (dateRange?.to && dateRange.to.getTime() !== dateRange.from.getTime()) return null;
    const fromTime = dateRange.from.getTime();

    const firstBooked = Array.from(bookedDatesForRoom)
      .map((d) => ({ key: d, time: parseISO(d).getTime() }))
      .filter((d) => d.time > fromTime)
      .sort((a, b) => a.time - b.time)[0];

    const firstBlockedTime = blockedDates
      .map((d) => parseISO(d.date).getTime())
      .filter((t) => t > fromTime)
      .sort((a, b) => a - b)[0];

    if (!firstBooked) return null;
    // If a blocked date comes before or on the same day, don't allow checkout on booked
    if (firstBlockedTime !== undefined && firstBlockedTime <= firstBooked.time) return null;
    return firstBooked.key;
  }, [dateRange?.from, dateRange?.to, bookedDatesForRoom, blockedDates]);

  const checkoutBarrierTime = useMemo<number | null>(() => {
    if (!dateRange?.from) return null;
    if (dateRange?.to && dateRange.to.getTime() !== dateRange.from.getTime()) return null;
    const fromTime = dateRange.from.getTime();
    const allTimes = [
      ...Array.from(bookedDatesForRoom).map((d) => parseISO(d).getTime()),
      ...blockedDates.map((d) => parseISO(d.date).getTime()),
    ]
      .filter((t) => t > fromTime)
      .sort((a, b) => a - b);
    return allTimes[0] ?? null;
  }, [dateRange?.from, dateRange?.to, bookedDatesForRoom, blockedDates]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  const optionsForRoom = useMemo(() => {
    if (!selectedRoomId) return [];
    return roomOptions.filter((o) => o.room_id === selectedRoomId);
  }, [selectedRoomId, roomOptions]);

  const seasonsByRoom = useMemo(() => {
    const map: Record<string, RoomSeasonalPrice[]> = {};
    for (const s of seasonalPrices) {
      if (!map[s.room_id]) map[s.room_id] = [];
      map[s.room_id].push(s);
    }
    return map;
  }, [seasonalPrices]);

  const nights = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return 0;
    return differenceInDays(dateRange.to, dateRange.from);
  }, [dateRange]);

  const optionsTotal = useMemo(() => {
    return selectedOptionIds.reduce((sum, id) => {
      const opt = roomOptions.find((o) => o.id === id);
      return sum + (opt?.price || 0) * (nights || 1);
    }, 0);
  }, [selectedOptionIds, roomOptions, nights]);

  const priceResult = useMemo(() => {
    if (!selectedRoom || nights <= 0 || !dateRange?.from || !dateRange?.to) return null;
    const roomSeasons = seasonsByRoom[selectedRoom.id] || [];
    return calculateTotalPrice(selectedRoom.price_per_night, dateRange.from, dateRange.to, roomSeasons);
  }, [selectedRoom, nights, dateRange, seasonsByRoom]);

  const totalPrice = (priceResult?.total ?? 0) + optionsTotal;

  const resolvedDeposit = useMemo(() => {
    return getDepositForMonth(host, dateRange?.from);
  }, [host, dateRange?.from]);

  const depositAvailable = resolvedDeposit > 0 && resolvedDeposit < totalPrice;

  const paymentAmount = useMemo(() => {
    if (paymentOption === "deposit" && depositAvailable) {
      return resolvedDeposit;
    }
    return totalPrice;
  }, [paymentOption, depositAvailable, resolvedDeposit, totalPrice]);

  const handleSaveQr = useCallback(() => {
    const container = qrContainerRef.current;
    if (!container) return;
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `promptpay-${totalPrice}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }, [totalPrice]);

  const isDateRangeValid = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return false;
    // Check occupied nights: from check-in to check-out - 1
    const lastNight = subDays(dateRange.to, 1);
    if (lastNight < dateRange.from) return false;
    const nights = eachDayOfInterval({ start: dateRange.from, end: lastNight });
    return !nights.some((d) => {
      const key = format(d, "yyyy-MM-dd");
      return blockedDateSet.has(key) || bookedDatesForRoom.has(key);
    });
  }, [dateRange, blockedDateSet, bookedDatesForRoom]);

  const handleRoomChange = (roomId: string) => {
    setSelectedRoomId(roomId);
    // Clear date range when switching rooms so stale selections
    // that overlap with the new room's booked dates are reset
    setDateRange(undefined);
    setSelectedOptionIds([]);
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    setDateRange(range);
  };

  const handleProceedToDetails = () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error(t("errorSelectDates"));
      return;
    }
    if (!isDateRangeValid) {
      toast.error(t("errorBlockedDates"));
      return;
    }
    if (!selectedRoomId) {
      toast.error(t("errorSelectRoom"));
      return;
    }
    setStep("details");
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  const handleProceedToPayment = async (skipDuplicateCheck = false) => {
    if (!guestName || !guestEmail || !guestPhone) {
      toast.error(t("errorFillFields"));
      return;
    }
    if (!dateRange?.from || !dateRange?.to || !selectedRoomId) return;

    if (!skipDuplicateCheck) {
      try {
        const dupRes = await fetch("/api/bookings/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ homestay_id: homestay.id, guest_email: guestEmail, guest_phone: guestPhone }),
        });
        if (dupRes.ok) {
          const dupData = await dupRes.json();
          if (dupData.isDuplicate) {
            setDuplicateMatchType(dupData.matchType);
            setShowDuplicateModal(true);
            return;
          }
        }
      } catch {
        // non-blocking — proceed if check fails
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/bookings/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: selectedRoomId,
          check_in: format(dateRange.from, "yyyy-MM-dd"),
          check_out: format(dateRange.to, "yyyy-MM-dd"),
          session_id: uploadSessionId,
          guest_phone: guestPhone.trim(),
        }),
      });

      if (res.status === 409) {
        const errorData = await res.json();
        if (errorData.error === "DATES_UNAVAILABLE") {
          toast.error(t("errorDatesUnavailable"));
          fetch(`/api/bookings/availability?homestay_id=${homestay.id}`)
            .then((r) => r.json())
            .then((d) => { if (d.bookedRanges) setLiveBookedRanges(d.bookedRanges); })
            .catch(() => { });
          setDateRange(undefined);
          setStep("dates");
        } else {
          setShowHeldModal(true);
        }
        setIsSubmitting(false);
        return;
      }

      if (!res.ok) {
        toast.error(t("errorGeneric"));
        setIsSubmitting(false);
        return;
      }

      const data = await res.json();
      setHoldId(data.hold_id);
      const expiresMs = new Date(data.expires_at).getTime();
      setHoldExpiresAt(expiresMs);
      setStep("payment");
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const releaseHold = useCallback(() => {
    if (holdId) {
      fetch("/api/bookings/hold", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hold_id: holdId, session_id: uploadSessionId }),
      }).catch(() => { });
      setHoldId(null);
      setHoldExpiresAt(null);
    }
  }, [holdId, uploadSessionId]);

  // Hold expiry callback — passed to <HoldCountdown onExpire />
  const handleHoldExpired = useCallback(() => {
    releaseHold();
    toast.error(t("holdExpired"));
    setDateRange(undefined);
    setStep("dates");
    setPaymentPhase("qr");
    handleRemoveSlip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHeldModalClose = () => {
    setShowHeldModal(false);
    fetch(`/api/bookings/availability?homestay_id=${homestay.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.bookedRanges) setLiveBookedRanges(data.bookedRanges);
      })
      .catch(() => { });
    setDateRange(undefined);
    setStep("dates");
  };

  const [slipVerified, setSlipVerified] = useState(false);

  const handleSubmitBooking = async () => {
    if (!slipFile) {
      toast.error(t("errorUploadSlip"));
      return;
    }

    if (!dateRange?.from || !dateRange?.to) return;

    setIsSubmitting(true);

    try {
      // 1. Prepare the slip file
      let slipToVerify: File;
      if (phoneSlipReceived && phoneSlipUrl) {
        const slipRes = await fetch(phoneSlipUrl);
        const blob = await slipRes.blob();
        slipToVerify = new File([blob], "slip.jpg", { type: blob.type });
      } else {
        slipToVerify = slipFile;
      }

      // 2. Verify slip FIRST — no booking is created yet
      const verifyForm = new FormData();
      verifyForm.append("file", slipToVerify);
      verifyForm.append("expected_amount", paymentAmount.toString());
      verifyForm.append("expected_receiver", host.promptpay_id);
      if (host.bank_account_number) {
        verifyForm.append("expected_receiver_bank", host.bank_account_number);
      }

      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        body: verifyForm,
      });

      const verifyData = await verifyRes.json();

      if (verifyRes.status === 409 && verifyData.duplicate) {
        toast.error(t("errorDuplicateSlip"));
        handleRemoveSlip();
        setIsSubmitting(false);
        return;
      }

      if (verifyData.slip_pending) {
        toast.error(t("errorSlipPending"));
        setIsSubmitting(false);
        return;
      }

      const isSlipVerified = !!verifyData.verified;

      // 3. Create the booking — verified or pending (host review)
      const bookingRes = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homestay_id: homestay.id,
          room_id: selectedRoomId || undefined,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          guest_province: guestProvince || undefined,
          notes: guestNote || undefined,
          check_in: format(dateRange.from, "yyyy-MM-dd"),
          check_out: format(dateRange.to, "yyyy-MM-dd"),
          num_guests: parseInt(numGuests),
          total_price: totalPrice,
          payment_type: paymentOption,
          amount_paid: paymentAmount,
          slip_hash: verifyData.slip_hash,
          slip_trans_ref: verifyData.slip_trans_ref || null,
          payment_slip_url: verifyData.payment_slip_url || null,
          easyslip_response: verifyData.easyslip_response || null,
          easyslip_verified: isSlipVerified,
          session_id: uploadSessionId,
          locale,
          selected_options: selectedOptionIds.map((id) => {
            const opt = roomOptions.find((o) => o.id === id);
            return { id, name: opt?.name || "", price: (opt?.price || 0) * nights };
          }),
        }),
      });

      if (!bookingRes.ok) {
        if (bookingRes.status === 409) {
          toast.error(t("errorDatesUnavailable"));
          fetch(`/api/bookings/availability?homestay_id=${homestay.id}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.bookedRanges) setLiveBookedRanges(data.bookedRanges);
            })
            .catch(() => { });
          setDateRange(undefined);
          setStep("dates");
          setIsSubmitting(false);
          return;
        }
        throw new Error("Failed to create booking");
      }

      const { booking } = await bookingRes.json();
      setBookingId(booking.id);
      setSlipVerified(isSlipVerified);
      // Hold is cleaned up server-side by create_booking_atomic; clear local state
      releaseHold();
      setHoldId(null);
      setHoldExpiresAt(null);

      // 4. Upload slip to session storage (backup)
      const uploadForm = new FormData();
      uploadForm.append("slip", slipToVerify);
      fetch(`/api/slip-upload/${uploadSessionId}`, {
        method: "POST",
        body: uploadForm,
      }).catch(() => { });

      setShowConfirmedModal(true);
      // toast.success(t("successSubmitted"));
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps: BookingStep[] = ["dates", "details", "payment"];
  const currentStepIndex = steps.indexOf(step);

  const roomSeasons = selectedRoom ? (seasonsByRoom[selectedRoom.id] || []) : [];
  const { min: priceMin, max: priceMax } = selectedRoom
    ? getPriceRange(selectedRoom.price_per_night, roomSeasons)
    : { min: 0, max: 0 };
  const priceLabel = selectedRoom
    ? priceMin !== priceMax
      ? `฿${priceMin.toLocaleString()}–฿${priceMax.toLocaleString()}`
      : `฿${selectedRoom.price_per_night.toLocaleString()}`
    : "";

  const resetBooking = () => {
    setStep("dates");
    setPaymentPhase("qr");
    setPaymentOption("full");
    setSlipVerified(false);
    setDateRange(undefined);
    setSelectedRoomId("");
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setGuestProvince("");
    setGuestNote("");
    handleRemoveSlip();
    setUploadSessionId(crypto.randomUUID());
    setBookingId(null);
    setPdpaConsent(false);
    setShowCalendar(false);
    setShowOptions(false);
    setShowConfirmModal(false);
    setShowConfirmedModal(false);
    setSelectedOptionIds([]);
  };

  return (
    <>
      <section id="booking-section" ref={sectionRef} className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {bookingDisabled && (
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-center">
              <Clock className="h-6 w-6 text-amber-500 mx-auto mb-2" />
              <p className="text-base font-medium text-amber-800">{t("unavailableTitle")}</p>
              <p className="text-sm text-amber-600 mt-1">{t("unavailableDesc")}</p>
            </div>
          )}
          <div className={`grid gap-10 lg:grid-cols-2 lg:gap-12 xl:gap-16 items-start ${bookingDisabled ? "pointer-events-none opacity-50 select-none" : ""}`}>
            {/* ── Left Column: Heading & Trust Badges ── */}
            <div className="flex flex-col justify-center">
              <h2 className="font-serif text-4xl font-normal text-earth-900 leading-tight lg:text-5xl tracking-tight">
                {t("sectionHeading")}{" "}
                <span className="italic text-brand">{t("sectionHeadingAccent")}</span>
              </h2>
              <p className="mt-4 text-base text-earth-500 leading-[1.8] max-w-md">{t("sectionDesc")}</p>
              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                    <Sparkles className="h-4.5 w-4.5 text-brand" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-earth-900">{t("trustResponse")}</p>
                    <p className="text-xs text-earth-500">{t("trustResponseDesc")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                    <FileText className="h-4.5 w-4.5 text-brand" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-earth-900">{t("trustData")}</p>
                    <p className="text-xs text-earth-500">{t("trustDataDesc")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                    <Lock className="h-4.5 w-4.5 text-brand" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-earth-900">{t("trustSecure")}</p>
                    <p className="text-xs text-earth-500">{t("trustSecureDesc")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                    <MousePointerClick className="h-4.5 w-4.5 text-brand" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-earth-900">{t("trustStep")}</p>
                    <p className="text-xs text-earth-500">{t("trustStepDesc")}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right Column: Booking Form Card ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.25, 0.1, 0, 1] }}
              className="bg-white rounded-3xl shadow-xl border border-earth-100 p-5 lg:p-8 relative flex flex-col lg:sticky lg:top-8"
            >
            {/* Step indicator (compact) */}
            <div className="flex items-center gap-1 mb-6">
              {steps.map((s, i) => {
                const isActive = step === s;
                const isCompleted = currentStepIndex > i;
                return (
                  <div key={s} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                        isActive || isCompleted ? 'bg-brand text-white' : 'bg-earth-100 text-earth-400'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`mx-1 h-px flex-1 ${currentStepIndex > i ? 'bg-earth-900' : 'bg-earth-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Hidden file inputs */}
            <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleSlipSelect(e.target.files?.[0] || null)} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleSlipSelect(e.target.files?.[0] || null)} />

            <div className="min-h-[480px] max-h-[600px] lg:max-h-[700px] overflow-y-auto pr-1">
              <AnimatePresence mode="wait">
                {/* ═══ Step 1: Dates ═══ */}
                {step === "dates" && (
                  <motion.div key="step-dates" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <AnimatePresence mode="wait">
                      {!showCalendar && !showOptions ? (
                        <motion.div key="dates-form" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">
                          {/* Room detail or prompt */}
                          {selectedRoom ? (
                            <div className="rounded-xl bg-earth-50 p-3">
                              <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("room")}</p>
                              <div className="flex items-baseline justify-between mt-1">
                                <p className="text-base font-bold text-earth-900">{selectedRoom.name}</p>
                                <p className="text-sm font-semibold">{priceLabel}/{tc("night")}</p>
                              </div>
                              {/* {selectedRoom.description && (
                                <div className="mt-2 text-xs text-earth-500">
                                  <HTMLContent content={selectedRoom.description} className="inline" />
                                </div>
                              )} */}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-earth-300 bg-earth-50 p-4 text-center">
                              <CalendarDays className="mx-auto h-8 w-8 text-earth-300 mb-2" />
                              <p className="text-sm font-medium text-earth-500">{t("selectRoomFirst")}</p>
                            </div>
                          )}

                          <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("selectDates")}</label>

                          {/* Date picker toggle */}
                          <button
                            onClick={() => selectedRoomId && setShowCalendar(true)}
                            disabled={!selectedRoomId}
                            className={`w-full flex items-center justify-between p-3.5 rounded-xl border border-earth-200 transition-all text-sm font-medium bg-white ${selectedRoomId ? "hover:border-earth-400 text-earth-900 cursor-pointer" : "opacity-50 cursor-not-allowed text-earth-400"}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <CalendarIcon size={16} className="text-earth-400" />
                              <span>
                                {dateRange?.from ? (
                                  <>
                                    {fmtDate(dateRange.from, "MMM d, yyyy", locale)}
                                    {dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime() && ` — ${fmtDate(dateRange.to, "MMM d, yyyy", locale)}`}
                                  </>
                                ) : t("selectDates")}
                              </span>
                            </div>
                            <span className="text-earth-400 text-xs">
                              {nights > 0 ? `${nights} ${nights > 1 ? tc("nights") : tc("night")}` : ""}
                            </span>
                          </button>

                          {/* Guests */}
                          <div className="space-y-2">
                            <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("numGuests")}</label>
                            <div className="flex items-center justify-between p-3 rounded-xl border border-earth-200">
                              <span className="text-sm font-medium text-earth-700">{numGuests} {tc("guests")}</span>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setNumGuests(String(Math.max(1, parseInt(numGuests) - 1)))}
                                  className="p-1 rounded-full border border-earth-200 hover:bg-earth-100 text-earth-400"
                                >
                                  <Minus size={14} />
                                </button>
                                <button
                                  onClick={() => setNumGuests(String(Math.min(selectedRoom?.max_guests || homestay.max_guests, parseInt(numGuests) + 1)))}
                                  className="p-1 rounded-full border border-earth-200 hover:bg-earth-100 text-earth-400"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Room Options toggle */}
                          {optionsForRoom.length > 0 && (
                            <div className="space-y-2">
                              <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("options")}</label>
                              <button
                                onClick={() => setShowOptions(true)}
                                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-earth-200 transition-all text-sm font-medium bg-white hover:border-earth-400 text-earth-900 cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <ListPlus size={16} className="text-earth-400" />
                                  <span>
                                    {selectedOptionIds.length > 0
                                      ? t("optionsSelected", { count: selectedOptionIds.length })
                                      : t("selectOptions")}
                                  </span>
                                </div>
                                {optionsTotal > 0 && (
                                  <span className="text-xs font-semibold text-brand">+฿{optionsTotal.toLocaleString()}</span>
                                )}
                              </button>
                            </div>
                          )}

                          {/* Price breakdown */}
                          {totalPrice > 0 && priceResult && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="pt-4 border-t border-earth-100 space-y-2">
                              {(() => {
                                const hasSeasons = priceResult.breakdown.some((b) => b.seasonName);
                                if (!hasSeasons) {
                                  return (
                                    <div className="flex justify-between text-sm text-earth-600">
                                      <span>฿{selectedRoom?.price_per_night.toLocaleString()} × {nights} {nights > 1 ? tc("nights") : tc("night")}</span>
                                      <span>฿{priceResult.total.toLocaleString()}</span>
                                    </div>
                                  );
                                }
                                const groups: { label: string; price: number; count: number }[] = [];
                                for (const b of priceResult.breakdown) {
                                  const label = b.seasonName || t("baseRate");
                                  const last = groups[groups.length - 1];
                                  if (last && last.label === label && last.price === b.price) last.count++;
                                  else groups.push({ label, price: b.price, count: 1 });
                                }
                                return (
                                  <>
                                    {groups.map((g, i) => (
                                      <div key={i} className="flex justify-between text-sm text-earth-600">
                                        <span>{g.label}: ฿{g.price.toLocaleString()} × {g.count}</span>
                                        <span>฿{(g.price * g.count).toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </>
                                );
                              })()}
                              {optionsTotal > 0 && (
                                <div className="flex justify-between text-sm text-earth-600">
                                  <span>{t("options")} ({selectedOptionIds.length}) × {nights} {nights > 1 ? tc("nights") : tc("night")}</span>
                                  <span>+฿{optionsTotal.toLocaleString()}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-base font-bold text-earth-900 pt-2 border-t border-earth-100">
                                <span>{tc("total")}</span>
                                <span>฿{totalPrice.toLocaleString()}</span>
                              </div>
                            </motion.div>
                          )}

                          {/* PDPA */}
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" checked={pdpaConsent} onChange={(e) => setPdpaConsent(e.target.checked)} className="mt-1 h-4 w-4 rounded border-earth-300 text-earth-900 focus:ring-earth-900" />
                            <span className="text-xs text-earth-600">
                              {t.rich("pdpaConsent", {
                                privacy: (chunks) => <a href="/legal#privacy" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-earth-900">{chunks}</a>,
                                terms: (chunks) => <a href="/legal#terms" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-earth-900">{chunks}</a>,
                              })}
                            </span>
                          </label>

                          <button
                            onClick={handleProceedToDetails}
                            disabled={!dateRange?.from || !dateRange?.to || !selectedRoomId || !pdpaConsent}
                            className="w-full bg-brand text-white px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {t("continueDetails")} <ArrowRight size={18} />
                          </button>
                          <p className="text-center text-[11px] text-earth-400">{t("subtitle")}</p>
                        </motion.div>
                      ) : showOptions ? (
                        <motion.div key="dates-options" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.25 }} className="space-y-4">
                          <div className="flex items-center gap-3">
                            <button onClick={() => setShowOptions(false)} className="p-2 rounded-full hover:bg-earth-100 text-earth-400"><ArrowLeft size={18} /></button>
                            <h3 className="text-xl font-bold text-earth-900">{t("options")}</h3>
                          </div>
                          <p className="text-sm text-earth-500">{t("optionsDesc")}</p>

                          <div className="space-y-2">
                            {optionsForRoom.map((option) => {
                              const isChecked = selectedOptionIds.includes(option.id);
                              return (
                                <label
                                  key={option.id}
                                  className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${isChecked ? "border-brand bg-brand/5" : "border-earth-200 hover:border-earth-300"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setSelectedOptionIds((prev) =>
                                        isChecked ? prev.filter((id) => id !== option.id) : [...prev, option.id]
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-earth-300 text-brand focus:ring-brand"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-earth-900">{option.name}</p>
                                  </div>
                                  <span className="text-sm font-semibold text-brand whitespace-nowrap">+฿{option.price.toLocaleString()}/{tc("night")}</span>
                                </label>
                              );
                            })}
                          </div>

                          {optionsTotal > 0 && (
                            <div className="rounded-xl bg-earth-50 px-3 py-2 flex justify-between text-sm">
                              <span className="text-earth-500">{t("optionsTotal")}</span>
                              <span className="font-bold text-earth-900">+฿{optionsTotal.toLocaleString()}</span>
                            </div>
                          )}

                          <button
                            onClick={() => setShowOptions(false)}
                            className="w-full bg-brand text-white px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                          >
                            {tc("done")}
                          </button>
                        </motion.div>
                      ) : (
                        <motion.div key="dates-calendar" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.25 }} className="space-y-4">
                          <div className="flex items-center gap-3">
                            <button onClick={() => setShowCalendar(false)} className="p-2 rounded-full hover:bg-earth-100 text-earth-400"><ArrowLeft size={18} /></button>
                            <h3 className="text-xl font-bold text-earth-900">{t("selectDates")}</h3>
                          </div>

                          {/* Selected dates summary */}
                          {dateRange?.from && (
                            <div className="rounded-xl bg-earth-50 px-3 py-2 text-sm text-earth-700 flex items-center gap-2">
                              <CalendarIcon size={14} className="text-earth-400" />
                              <span>
                                {fmtDate(dateRange.from, "MMM d, yyyy", locale)}
                                {dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime() && ` — ${fmtDate(dateRange.to, "MMM d, yyyy", locale)}`}
                              </span>
                              {nights > 0 && <span className="ml-auto text-xs text-earth-400">{nights} {nights > 1 ? tc("nights") : tc("night")}</span>}
                            </div>
                          )}

                          <div className="bg-white rounded-2xl p-3 border border-earth-100">
                            {mounted ? (
                              <Calendar
                                key={dateRange?.from?.toISOString() || "no-date"}
                                mode="range"
                                selected={dateRange}
                                onSelect={handleDateSelect}
                                locale={locale === "th" ? thLocale : undefined}
                                captionLayout="dropdown"
                                defaultMonth={dateRange?.from || startOfToday()}
                                startMonth={startOfToday()}
                                endMonth={addMonths(startOfToday(), 12)}
                                formatters={locale === "th" ? {
                                  formatMonthDropdown: (date) =>
                                    date.toLocaleDateString("th-TH", { month: "long" }),
                                  formatYearDropdown: (date) =>
                                    String(date.getFullYear() + 543),
                                } : undefined}
                                disabled={[
                                  { before: startOfToday() },
                                  (date: Date) => {
                                    const key = format(date, "yyyy-MM-dd");
                                    if (blockedDateSet.has(key)) return true;
                                    if (bookedDatesForRoom.has(key)) return key !== allowedCheckoutKey;
                                    if (checkoutBarrierTime !== null && date.getTime() > checkoutBarrierTime) return true;
                                    return false;
                                  },
                                ]}
                                numberOfMonths={1}
                                className="w-full"
                              />
                            ) : (
                              <div className="flex h-[280px] items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-earth-400" />
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => setShowCalendar(false)}
                            className="w-full bg-brand text-white px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                          >
                            {tc("done")}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ═══ Step 2: Guest Details ═══ */}
                {step === "details" && (
                  <motion.div key="step-details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                    <AnimatePresence mode="wait">
                      {!showConfirmModal ? (
                        <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                          <div className="flex items-center gap-3">
                            <button onClick={() => setStep("dates")} className="p-2 rounded-full hover:bg-earth-100 text-earth-400"><ArrowLeft size={18} /></button>
                            <h3 className="text-xl font-bold text-earth-900">{t("guestInfo")}</h3>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("fullName")} <span className="text-red-500">*</span></label>
                              <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400" size={16} />
                                <Input ref={nameInputRef} value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t("fullNamePlaceholder")} className="!pl-10 p-3.5 !h-auto rounded-xl !border !border-earth-200 !bg-white hover:!border-earth-400 transition-all text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-0 focus-visible:!border-earth-400" />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("email")} <span className="text-red-500">*</span></label>
                              <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400" size={16} />
                                <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder={t("emailPlaceholder")} className="!pl-10 p-3.5 !h-auto rounded-xl !border !border-earth-200 !bg-white hover:!border-earth-400 transition-all text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-0 focus-visible:!border-earth-400" />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("phone")} <span className="text-red-500">*</span></label>
                              <div className="relative">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400" size={16} />
                                <Input type="number" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder={t("phonePlaceholder")} className="!pl-10 p-3.5 !h-auto rounded-xl !border !border-earth-200 !bg-white hover:!border-earth-400 transition-all text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-0 focus-visible:!border-earth-400" />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("province")} <span className="text-red-500">*</span></label>
                              <Select value={guestProvince} onValueChange={setGuestProvince}>
                                <SelectTrigger className="!w-full p-3.5 !h-auto rounded-xl !border !border-earth-200 !bg-white hover:!border-earth-400 transition-all text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-0 focus-visible:!border-earth-400">
                                  <SelectValue placeholder={t("provincePlaceholder")} />
                                </SelectTrigger>
                                <SelectContent className="max-h-60 z-70">
                                  {THAI_PROVINCES.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>
                                      {locale === "th" ? p.labelTh : p.labelEn}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("notes")}</label>
                              <Textarea value={guestNote} onChange={(e) => setGuestNote(e.target.value)} placeholder={t("notesPlaceholder")} className="p-3.5 !h-auto rounded-xl !border !border-earth-200 !bg-white hover:!border-earth-400 transition-all text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-0 focus-visible:!border-earth-400" rows={2} />
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              if (!guestName || !guestEmail || !guestPhone || !guestProvince) { toast.error(t("errorFillFields")); return; }
                              setShowConfirmModal(true);
                            }}
                            className="w-full bg-brand text-white px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                          >
                            {t("continuePayment")} <ArrowRight size={18} />
                          </button>
                        </motion.div>
                      ) : (
                        <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                          <div className="flex items-center gap-3">
                            <button onClick={() => setShowConfirmModal(false)} className="p-2 rounded-full hover:bg-earth-100 text-earth-400"><ArrowLeft size={18} /></button>
                            <h3 className="text-xl font-bold text-earth-900">{t("confirmTitle")}</h3>
                          </div>
                          <p className="text-sm text-earth-500">{t("confirmDesc")}</p>
                          <div className="space-y-3 rounded-xl bg-earth-50 p-4 text-sm">
                            <div className="flex justify-between">
                              <span className="text-earth-500">{t("room")}</span>
                              <span className="font-medium text-earth-900">{selectedRoom?.name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-earth-500">{t("dates")}</span>
                              <span className="font-medium text-earth-900">
                                {dateRange?.from && fmtDate(dateRange.from, "MMM d", locale)} — {dateRange?.to && fmtDate(dateRange.to, "MMM d, yyyy", locale)}
                              </span>
                            </div>
                            {(homestay.check_in_time || homestay.check_out_time) && (
                              <div className="flex justify-between text-xs">
                                <span className="text-earth-400">{homestay.check_in_time && t("checkInTime", { time: homestay.check_in_time })}</span>
                                <span className="text-earth-400">{homestay.check_out_time && t("checkOutTime", { time: homestay.check_out_time })}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-earth-500">{tc("guests")}</span>
                              <span className="font-medium text-earth-900">{numGuests}</span>
                            </div>
                            {selectedOptionIds.length > 0 && (
                              <div>
                                <span className="text-earth-500">{t("options")} × {nights} {nights > 1 ? tc("nights") : tc("night")}</span>
                                <div className="mt-1 space-y-1">
                                  {selectedOptionIds.map((id) => {
                                    const opt = roomOptions.find((o) => o.id === id);
                                    if (!opt) return null;
                                    return (
                                      <div key={id} className="flex justify-between text-xs">
                                        <span className="text-earth-600">{opt.name} (฿{opt.price.toLocaleString()}/{tc("night")})</span>
                                        <span className="font-medium text-brand">+฿{(opt.price * nights).toLocaleString()}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <Separator />
                            <div className="flex justify-between">
                              <span className="text-earth-500">{t("fullName")}</span>
                              <span className="font-medium text-earth-900">{guestName}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-earth-500">{t("email")}</span>
                              <span className="font-medium text-earth-900">{guestEmail}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-earth-500">{t("phone")}</span>
                              <span className="font-medium text-earth-900">{guestPhone}</span>
                            </div>
                            {guestProvince && (
                              <div className="flex justify-between">
                                <span className="text-earth-500">{t("province")}</span>
                                <span className="font-medium text-earth-900">{provinceLabel(guestProvince)}</span>
                              </div>
                            )}
                            {guestNote && (
                              <div className="flex justify-between">
                                <span className="text-earth-500">{t("notes")}</span>
                                <span className="font-medium text-earth-900 text-right max-w-[200px]">{guestNote}</span>
                              </div>
                            )}
                            <Separator />
                            <div className="flex justify-between">
                              <span className="font-semibold text-earth-900">{tc("total")}</span>
                              <span className="text-lg font-bold text-earth-900">฿{totalPrice.toLocaleString()}</span>
                            </div>
                            {depositAvailable && (
                              <div className="flex justify-between text-xs text-earth-400">
                                <span>{t("payDeposit")}: ฿{resolvedDeposit.toLocaleString()}</span>
                                <span>{t("payFull")}: ฿{totalPrice.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <button
                              onClick={() => setShowConfirmModal(false)}
                              className="flex-1 py-3 rounded-2xl font-bold text-sm border border-earth-200 text-earth-700 hover:bg-earth-50 transition-all"
                            >
                              {t("confirmEdit")}
                            </button>
                            <button
                              disabled={isSubmitting}
                              onClick={() => { setShowConfirmModal(false); handleProceedToPayment(); }}
                              className="flex-1 bg-brand text-white px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("confirmProceed")}</>) : <>{t("confirmProceed")} <ArrowRight size={18} /></>}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ═══ Step 3: Payment ═══ */}
                {step === "payment" && (
                  <motion.div key="step-payment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {paymentPhase === "qr" && (
                          <button onClick={() => { releaseHold(); setStep("details"); setPaymentPhase("qr"); }} className="p-2 rounded-full hover:bg-earth-100 text-earth-400"><ArrowLeft size={18} /></button>
                        )}
                        {paymentPhase === "upload" && (
                          <button onClick={() => setPaymentPhase("qr")} className="p-2 rounded-full hover:bg-earth-100 text-earth-400"><ArrowLeft size={18} /></button>
                        )}
                        <h3 className="text-xl font-bold text-earth-900">{t("paymentTitle")}</h3>
                      </div>
                      <HoldCountdown expiresAt={step === "payment" ? holdExpiresAt : null} onExpire={handleHoldExpired} />
                    </div>

                    {/* Deposit vs Full */}
                    {depositAvailable && paymentPhase === "qr" && (
                      <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setPaymentOption("full")}
                          className={`rounded-2xl border-2 p-3 text-left text-sm transition-all ${paymentOption === "full" ? "border-brand bg-brand-50" : "border-earth-100 hover:border-earth-300"}`}>
                          <div className={`p-2 rounded-xl inline-block mb-1 ${paymentOption === "full" ? "bg-brand text-white" : "bg-earth-100 text-earth-400"}`}><CreditCard size={18} /></div>
                          <p className="font-bold text-earth-900">{t("payFull")}</p>
                          <p className="text-xs text-earth-500">฿{totalPrice.toLocaleString()}</p>
                        </button>
                        <button type="button" onClick={() => setPaymentOption("deposit")}
                          className={`rounded-2xl border-2 p-3 text-left text-sm transition-all ${paymentOption === "deposit" ? "border-brand bg-brand-50" : "border-earth-100 hover:border-earth-300"}`}>
                          <div className={`p-2 rounded-xl inline-block mb-1 ${paymentOption === "deposit" ? "bg-brand text-white" : "bg-earth-100 text-earth-400"}`}><CreditCard size={18} /></div>
                          <p className="font-bold text-earth-900">{t("payDeposit")}</p>
                          <p className="text-xs text-earth-500">฿{resolvedDeposit.toLocaleString()}</p>
                        </button>
                      </div>
                    )}

                    <AnimatePresence mode="wait">
                      {/* QR / Bank Transfer Phase */}
                      {paymentPhase === "qr" && (
                        <motion.div key="qr" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                          <div className="flex flex-col items-center p-5 bg-earth-50 rounded-2xl border border-earth-100">
                            {host.payment_display === "bank" && host.bank_name && host.bank_account_number && host.bank_account_name ? (
                              <>
                                <p className="text-sm text-earth-500 mb-3">{t("bankTransferTitle")}</p>
                                <div className="w-full space-y-2 bg-white rounded-xl p-4 border border-earth-100">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-earth-500">{t("bankTransferTitle")}</span>
                                    <span className="font-medium text-earth-900">{host.bank_name}</span>
                                  </div>
                                  <Separator />
                                  <div className="flex justify-between text-sm">
                                    <span className="text-earth-500">{t("bankAccountNo")}</span>
                                    <span className="font-mono font-medium text-earth-900">{host.bank_account_number}</span>
                                  </div>
                                  <Separator />
                                  <div className="flex justify-between text-sm">
                                    <span className="text-earth-500">{t("bankAccountHolderName")}</span>
                                    <span className="font-medium text-earth-900">{host.bank_account_name}</span>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="text-sm text-earth-500 mb-3">{t("scanQr")}</p>
                                <div ref={qrContainerRef} className="bg-white p-3 rounded-2xl shadow-sm">
                                  <QRCodeSVG value={generatePayload(host.promptpay_id, { amount: paymentAmount })} size={160} level="M" />
                                </div>
                                <button type="button" onClick={handleSaveQr} className="mt-3 flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-medium text-earth-700 border border-earth-200 hover:bg-earth-50">
                                  <Download className="h-3.5 w-3.5" />{t("saveQrImage")}
                                </button>
                              </>
                            )}
                            <p className="mt-3 text-2xl font-bold text-earth-900">฿{paymentAmount.toLocaleString()}</p>
                            {paymentOption === "deposit" && depositAvailable && (
                              <p className="mt-1 text-xs text-amber-600">{t("balanceDue")}: ฿{(totalPrice - paymentAmount).toLocaleString()} — {t("payOnArrival")}</p>
                            )}
                            <p className="mt-1 text-sm font-medium text-earth-700">{host.name}</p>
                            {host.payment_display !== "bank" && (
                              <p className="text-xs text-earth-400">{t("promptpayId")}: {host.promptpay_id}</p>
                            )}
                          </div>

                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                            {t("doNotClosePage")}
                          </div>

                          <button onClick={() => setPaymentPhase("upload")}
                            className="w-full bg-brand text-white px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />{t("iveTransferred")}
                          </button>
                        </motion.div>
                      )}

                      {/* Upload Phase */}
                      {paymentPhase === "upload" && (
                        <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                          <div className="text-center">
                            {showWelcomeBack && <div className="mb-3 rounded-xl bg-earth-100 px-4 py-2.5 text-sm font-medium text-earth-900">{t("welcomeBack")}</div>}
                            <Upload className="mx-auto h-8 w-8 text-earth-300" />
                            <h4 className="mt-2 text-base font-bold text-earth-900">{t("waitingForSlip")}</h4>
                            <p className="mt-1 text-xs text-earth-500">{t("waitingForSlipDesc")}</p>
                            <p className="mt-2 text-lg font-bold text-earth-900">฿{paymentAmount.toLocaleString()}</p>
                            {paymentOption === "deposit" && depositAvailable && (
                              <p className="mt-1 text-xs text-amber-600">{t("balanceDue")}: ฿{(totalPrice - paymentAmount).toLocaleString()} — {t("payOnArrival")}</p>
                            )}
                          </div>

                          {slipPreview ? (
                            <div className="rounded-2xl border bg-earth-50 p-3">
                              {phoneSlipReceived && (
                                <div className="mb-3 rounded-xl bg-earth-100 px-3 py-2 text-center text-sm font-medium text-earth-900">
                                  <CheckCircle2 className="mr-1.5 inline h-4 w-4" />{t("slipReceived")}
                                </div>
                              )}
                              <p className="mb-2 text-center text-xs font-medium text-earth-500">{t("slipPreview")}</p>
                              <div className="relative mx-auto w-fit">
                                <img src={slipPreview} alt={t("slipPreview")} className="mx-auto max-h-52 rounded-xl object-contain" />
                                <button type="button" onClick={handleRemoveSlip} className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-md hover:bg-red-600"><X className="h-3 w-3" /></button>
                              </div>
                              <div className="mt-3 flex justify-center">
                                <Button type="button" variant="outline" size="sm" onClick={() => galleryInputRef.current?.click()} className="rounded-full">
                                  <ImageIcon className="mr-1.5 h-3.5 w-3.5" />{t("changeSlip")}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <button type="button" onClick={() => galleryInputRef.current?.click()}
                                className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-earth-300 p-4 text-left transition-colors hover:border-earth-400 hover:bg-earth-50">
                                <div className="rounded-xl bg-earth-100 p-2.5"><ImageIcon className="h-5 w-5 text-earth-500" /></div>
                                <div>
                                  <p className="text-sm font-medium text-earth-700">{t("chooseFromGallery")}</p>
                                  <p className="text-xs text-earth-400">{t("clickUpload")}</p>
                                </div>
                              </button>
                              {isMobile && (
                                <button type="button" onClick={() => cameraInputRef.current?.click()}
                                  className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-earth-300 p-4 text-left transition-colors hover:border-earth-400 hover:bg-earth-50">
                                  <div className="rounded-xl bg-earth-100 p-2.5"><Camera className="h-5 w-5 text-earth-500" /></div>
                                  <div>
                                    <p className="text-sm font-medium text-earth-700">{t("takePhoto")}</p>
                                    <p className="text-xs text-earth-400">{t("clickUpload")}</p>
                                  </div>
                                </button>
                              )}
                              {!isMobile && (
                                <>
                                  <div className="relative flex items-center gap-3 py-1">
                                    <div className="flex-1 border-t border-earth-200" />
                                    <span className="text-xs font-medium text-earth-400">{t("orUploadFromPhone")}</span>
                                    <div className="flex-1 border-t border-earth-200" />
                                  </div>
                                  <div className="rounded-2xl border bg-earth-50 p-4 text-center">
                                    <p className="mb-3 text-xs text-earth-500">{t("scanToUpload")}</p>
                                    <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-xl border bg-white p-2">
                                      <QRCodeSVG value={`${typeof window !== "undefined" ? window.location.origin : ""}/upload-slip/${uploadSessionId}`} size={100} level="M" />
                                    </div>
                                    <div className="mt-3 flex items-center justify-center gap-2 text-xs text-earth-400">
                                      <Loader2 className="h-3 w-3 animate-spin" />{t("waitingForPhoneUpload")}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-earth-400 text-center">{t("slipVerify")}</p>

                          <button onClick={handleSubmitBooking} disabled={isSubmitting || !slipFile}
                            className="w-full bg-brand text-white px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed">
                            {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin inline" />{t("verifying")}</>) : t("submitBooking")}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
            </motion.div>{/* end form card */}
          </div>{/* end grid */}
        </div>{/* end max-w container */}
      </section>

      {/* ═══ Confirmed Booking Modal ═══ */}
      <Dialog open={showConfirmedModal} onOpenChange={(o) => { if (!o) { resetBooking(); } }}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center text-center py-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${slipVerified ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
              <CheckCircle2 size={36} />
            </div>
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-2xl font-bold text-earth-900 text-center">
                {slipVerified ? t("confirmedTitle") : t("confirmedTitlePending")}
              </DialogTitle>
              <DialogDescription className="text-sm text-earth-500 text-center">
                {slipVerified ? t("confirmedText") : t("confirmedTextPending")}
              </DialogDescription>
            </DialogHeader>
            {bookingId && (
              <Badge className="mt-3 mb-4 bg-earth-100 text-earth-900" variant="secondary">
                {t("bookingId")}: {bookingId}
              </Badge>
            )}

            <div className="bg-earth-50 p-5 rounded-2xl w-full text-left space-y-2.5 text-sm mt-2">
              <div className="flex justify-between">
                <span className="text-earth-400">{t("homestay")}</span>
                <span className="font-bold text-earth-900">{homestay.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-400">{t("room")}</span>
                <span className="font-bold text-earth-900">{selectedRoom?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-400">{t("dates")}</span>
                <span className="font-bold text-earth-900">
                  {dateRange?.from && fmtDate(dateRange.from, "MMM d", locale)} — {dateRange?.to && fmtDate(dateRange.to, "MMM d, yyyy", locale)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-400">{t("guestInfo")}</span>
                <span className="font-bold text-earth-900">{guestName}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-earth-400">{tc("total")}</span>
                <span className="text-lg font-bold text-earth-900">฿{totalPrice.toLocaleString()}</span>
              </div>
              {paymentOption === "deposit" && depositAvailable && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-earth-400">{t("amountPaid")}</span>
                    <span className="text-earth-900">฿{paymentAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-600">{t("balanceDue")}</span>
                    <span className="text-amber-600">฿{(totalPrice - paymentAmount).toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 w-full mt-5">
              <button onClick={() => { resetBooking(); }}
                className="flex-1 bg-brand text-white px-6 py-3 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl">
                {t("bookAnother")}
              </button>
              <button onClick={() => { setShowConfirmedModal(false); resetBooking(); }}
                className="flex-1 py-3 rounded-full font-bold text-sm border border-earth-200 text-earth-700 hover:bg-earth-50 transition-all">
                {t("confirmedClose")}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Booking Modal */}
      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent showCloseButton={false} className="z-70" overlayClassName="z-70">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center">{t("duplicateTitle")}</DialogTitle>
            <DialogDescription className="text-center">
              {duplicateMatchType === "both" ? t("duplicateDescBoth") : duplicateMatchType === "phone" ? t("duplicateDescPhone") : t("duplicateDescEmail")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full bg-brand text-white hover:bg-brand-hover" onClick={() => { setShowDuplicateModal(false); handleProceedToPayment(true); }}>{t("duplicateContinue")}</Button>
            <Button variant="outline" className="w-full" onClick={() => setShowDuplicateModal(false)}>{t("duplicateCancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dates Held Modal */}
      <Dialog open={showHeldModal} onOpenChange={(o) => { if (!o) handleHeldModalClose(); }}>
        <DialogContent showCloseButton={false} className="z-70" overlayClassName="z-70">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center">{t("datesHeldTitle")}</DialogTitle>
            <DialogDescription className="text-center">{t("datesHeldDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full bg-brand text-white hover:bg-brand-hover" onClick={handleHeldModalClose}>{t("chooseDifferentDates")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
