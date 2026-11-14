"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { format, differenceInDays, eachDayOfInterval, subDays, parseISO } from "date-fns";
import { fmtDate } from "@/lib/format-date";
import NextImage from "next/image";
import { motion, AnimatePresence, useInView, useReducedMotion } from "motion/react";
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
import { ShoppingCart, Wifi, Car, UtensilsCrossed, TreePine, Flame, Waves, Fish, BookOpen, Telescope, CheckCircle2, Loader2, ImageIcon, Smartphone, ArrowRight, ArrowLeft, Clock, AlertTriangle, Download, Shield, Minus, Plus, ShieldUser, ListPlus, Gift, HelpCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { billingTodayStr } from "@/lib/billing-dates";
import { reconcileDraftWithCatalog, type ResumeDraftDetail } from "@/lib/booking-draft";
import { useTranslations, useLocale } from "next-intl";
import type { Homestay, Room, BlockedDate, RoomSeasonalPrice, RoomSpecialPrice, RoomOption, RoomGuestPricing } from "@/types/database";
import type { BookingHost } from "@/lib/public-host";
import { getPriceRange } from "@/lib/calculate-price";
import { composeLineGuestLabel } from "@/lib/guest-pricing";
import { isValidEmail, isValidPhone, sanitizePhoneInput } from "@/lib/utils";
import { getFullyBookedForRoom } from "@/lib/booking-dates";
import { getDepositForMonth } from "@/lib/get-deposit";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { sortProvincesForLocale, getProvinceLabel } from "@/lib/provinces";
import { useIsMobile } from "@/lib/use-is-mobile";
import { prepareSlip } from "@/lib/prepare-slip";
import { DemandEvent } from "@/lib/demand-events";
import { trackDemand } from "@/lib/demand-track";
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
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";
import { BookingTutorialDialog } from "@/components/booking/booking-tutorial-dialog";
import { LeaveBookingDialog } from "@/components/booking/leave-booking-dialog";
import { useBookingCart } from "@/components/booking/booking-cart-context";
import { CartLineList } from "@/components/booking/cart-line-list";
import { HostContactLinks } from "@/components/booking/host-contact-links";
import { QuickBookingNotice } from "@/components/booking/quick-booking-notice";
import { allowsNormal, allowsQuick, bookingCode, guestBookingModeOf } from "@/lib/quick-booking";
import { buildBookingRequest, type BookingSlipFields } from "@/lib/booking-request";

// Only a host who takes quick bookings needs it, so the other guests never load it.
const Turnstile = dynamic(() => import("@marsidev/react-turnstile").then((m) => m.Turnstile), { ssr: false });

interface BookedRange {
  room_id: string | null;
  check_in: string;
  check_out: string;
}

const EMPTY_BOOKED_RANGES: BookedRange[] = [];
const EMPTY_SEASONAL_PRICES: RoomSeasonalPrice[] = [];
const EMPTY_SPECIAL_PRICES: RoomSpecialPrice[] = [];
const EMPTY_ROOM_OPTIONS: RoomOption[] = [];
const EMPTY_GUEST_PRICING: RoomGuestPricing[] = [];

const TUTORIAL_COOKIE = "pn_booking_tutorial_seen";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

const AMENITY_ICONS: Record<string, React.ElementType> = {
  WiFi: Wifi, Parking: Car, Kitchen: UtensilsCrossed, Garden: TreePine,
  BBQ: Flame, Kayaking: Waves, Fishing: Fish, Restaurant: UtensilsCrossed,
  Swimming: Waves, Telescope: Telescope, Fireplace: Flame, Library: BookOpen,
};

interface InitialPromoInfo {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  recommender_name: string | null;
}

interface BookingSectionProps {
  homestay: Homestay;
  rooms: Room[];
  blockedDates: BlockedDate[];
  bookedRanges?: BookedRange[];
  host: BookingHost;
  seasonalPrices?: RoomSeasonalPrice[];
  specialPrices?: RoomSpecialPrice[];
  roomOptions?: RoomOption[];
  guestPricing?: RoomGuestPricing[];
  bookingDisabled?: boolean;
  initialPromo?: InitialPromoInfo | null;
}

type BookingStep = "dates" | "details" | "payment";

// How long the quick-booking button waits for Turnstile before going ahead
// without a token (the server treats a missing token as a pass, too).
const TURNSTILE_PATIENCE_MS = 8000;

// Checkout overlay (steps 2–3, Mist Ridge prototype): white cards on mist, one style set.
const CO_CARD = "rounded-[20px] bg-white p-5 md:p-7";
const CO_H2 = "font-serif text-2xl leading-snug text-ink md:text-[28px]";
const CO_H3 = "text-[17px] font-medium text-ink";
const CO_LEAD = "mt-1.5 text-[15px] leading-relaxed text-ink-2";
const CO_LABEL = "text-[13px] font-medium text-ink-2";
const CO_INPUT =
  "!h-12 rounded-xl !border !border-line-strong !bg-white px-4 text-base text-ink !shadow-none transition-colors hover:!border-ink-2 focus-visible:!ring-2 focus-visible:!ring-pine focus-visible:!ring-offset-2 md:text-[15px]";
const CO_INPUT_ERR = "!border-red-500 hover:!border-red-500";
const CO_PRIMARY =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-pine px-8 text-[15px] font-medium text-white transition-colors hover:bg-pine-hover disabled:cursor-not-allowed disabled:opacity-50";
const CO_MONEY_LG = "font-serif text-2xl text-ink lining-nums tabular-nums";

export function BookingSection({
  homestay,
  rooms,
  blockedDates,
  bookedRanges = EMPTY_BOOKED_RANGES,
  host,
  seasonalPrices = EMPTY_SEASONAL_PRICES,
  specialPrices = EMPTY_SPECIAL_PRICES,
  roomOptions = EMPTY_ROOM_OPTIONS,
  guestPricing = EMPTY_GUEST_PRICING,
  bookingDisabled = false,
  initialPromo = null,
}: BookingSectionProps) {
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const tt = useTranslations("bookingTutorial");
  const tr = useTranslations("resumeBooking");
  const resumeEnabled = (host.booking_draft_hours ?? 0) > 0;
  const hostMode = guestBookingModeOf(host);
  const normalEnabled = allowsNormal(hostMode);
  const quickEnabled = allowsQuick(hostMode);
  const [step, setStep] = useState<BookingStep>("dates");
  const [showConfirmedModal, setShowConfirmedModal] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const checkoutShellRef = useRef<HTMLDivElement>(null);
  // Cart + shared dates live in the BookingCartProvider, so the sticky date bar,
  // room-card "Add to cart", the cart modal, and this panel all share one cart.
  const cart = useBookingCart();
  const { dateRange, lines: cartLines, setDates: setDateRange, clear: clearCart, addLine, isRoomAvailableForRange, computeLineGross, subtotal } = cart;
  // Step 1's empty state opens the real picker instead of pointing at the sticky bar.
  const [calendarOpen, setCalendarOpen] = useState(false);
  // The "draft" room currently being configured to add. The cart accumulates lines.
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [numGuests, setNumGuests] = useState("2");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestProvince, setGuestProvince] = useState("");
  const [guestNote, setGuestNote] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string }>({});
  const locale = useLocale();
  const isMobile = useIsMobile();
  const provinceLabel = (v: string) => getProvinceLabel(v, locale);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Progress of the sequential room-hold requests (step 2 → 3), so the overlay
  // can show "reserving room 2 of 3" instead of a silent multi-second wait.
  const [holdProgress, setHoldProgress] = useState<{ done: number; total: number } | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  // The hold ran out on the payment page: the overlay shows the expired page until the guest starts over.
  const [holdExpired, setHoldExpired] = useState(false);
  // A slip is with /api/verify-slip: the overlay shows the "checking your slip" card.
  const [verifyingSlip, setVerifyingSlip] = useState(false);
  const uploadCardRef = useRef<HTMLElement>(null);
  const [paymentOption, setPaymentOption] = useState<"full" | "deposit">("full");
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [uploadSessionId, setUploadSessionId] = useState(() => crypto.randomUUID());
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<number | null>(null);
  const [showHeldModal, setShowHeldModal] = useState(false);
  // Guest quick booking: the booking was placed without a slip, and a hold that
  // runs out after the guest may already have transferred.
  const [quickPlaced, setQuickPlaced] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  // Fails open, like every other Turnstile call site: Cloudflare being
  // unreachable must never stop a guest from booking.
  const turnstilePassed = !turnstileSiteKey || !!turnstileToken || turnstileError;
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [promoInput, setPromoInput] = useState(initialPromo?.code ?? "");
  const [appliedPromo, setAppliedPromo] = useState<{ id: string; code: string; discount_type: "percentage" | "fixed"; discount_value: number } | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const autoPromoTriedRef = useRef(false);
  const [phoneSlipReceived, setPhoneSlipReceived] = useState(false);
  const [phoneSlipUrl, setPhoneSlipUrl] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // "How to book?" help pill: pulse once when the form first scrolls into view,
  // unless the tutorial was already seen or the user prefers reduced motion.
  // useInView({ once }) flips false→true a single time; the keyframe array then
  // plays one shot (framer doesn't loop keyframes), so no state/timeout is needed.
  const helpPillRef = useRef<HTMLButtonElement>(null);
  const pillInView = useInView(helpPillRef, { once: true, amount: 0.6 });
  const reduceMotion = useReducedMotion();
  const pulseHelp = pillInView && !reduceMotion && !getCookie(TUTORIAL_COOKIE);

  const handleSlipSelect = async (file: File | null) => {
    if (slipPreview) URL.revokeObjectURL(slipPreview);

    // Shrink before it ever hits the network. Guests here are often on rural
    // mobile data, where an untouched 2-4MB phone screenshot is several
    // seconds of upload on its own — the largest single cost in the booking.
    // Done at selection time, not at submit, so the work overlaps the guest
    // still looking at the preview instead of the spinner.
    const prepared = file ? await prepareSlip(file) : null;

    setSlipFile(prepared);
    setSlipPreview(prepared ? URL.createObjectURL(prepared) : null);
    // Only an attach counts; clearing the slip is not a step backwards.
    if (prepared) {
      trackDemand({ homestayId: homestay.id, eventType: DemandEvent.SLIP_UPLOADED, locale });
    }
  };

  const handleRemoveSlip = () => {
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setSlipFile(null);
    setSlipPreview(null);
    setPhoneSlipReceived(false);
    setPhoneSlipUrl(null);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };
  const [bookingId, setBookingId] = useState<string | null>(null);

  // Back from the banking app (Page Visibility API): the payment page is one page now, so bring
  // its slip upload card into view and greet them there.
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === "visible" && step === "payment" && normalEnabled && !slipFile && !holdExpired) {
      uploadCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setShowWelcomeBack(true);
      setTimeout(() => setShowWelcomeBack(false), 4000);
    }
  }, [step, normalEnabled, slipFile, holdExpired]);

  useEffect(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [handleVisibilityChange]);

  // Poll for a cross-device slip upload while the payment page is waiting for a slip
  useEffect(() => {
    if (step === "payment" && normalEnabled && !holdExpired && !showConfirmedModal && !slipFile && !phoneSlipReceived) {
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
            // Cross-device upload bypasses handleSlipSelect, so the funnel
            // stage has to be recorded here too or phone uploaders would look
            // like they abandoned at step 3.
            trackDemand({
              homestayId: homestay.id,
              eventType: DemandEvent.SLIP_UPLOADED,
              locale,
              data: { source: "cross_device" },
            });
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
  }, [step, normalEnabled, holdExpired, showConfirmedModal, slipFile, phoneSlipReceived, uploadSessionId, homestay.id, locale]);

  // Listen for "book-room" custom event dispatched from RoomsSection
  useEffect(() => {
    const handler = (e: Event) => {
      const { roomId } = (e as CustomEvent<{ roomId: string }>).detail;
      if (roomId && rooms.some((r) => r.id === roomId)) {
        handleRoomChange(roomId);
        setStep("dates");
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        // First-time guests: surface the "How to book" tutorial once they reach the form
        if (!getCookie(TUTORIAL_COOKIE)) {
          setCookie(TUTORIAL_COOKIE, "1", 365);
          setTimeout(() => setShowTutorial(true), 600);
        }
      }
    };
    document.addEventListener("book-room", handler);
    return () => document.removeEventListener("book-room", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  // --- Resume an abandoned booking ---------------------------------------
  // Dispatched by ResumeBookingDialog once a draft is found. Restoring runs in
  // three phases because each one needs the previous phase's state committed:
  //   1. guest fields + dates        (dates first: isRoomAvailableForRange reads
  //                                   the cart's CURRENT range, so reconciling
  //                                   before they land rejects every house)
  //   2. reconcile against the catalog, then rebuild the cart
  //   3. once the cart matches, re-acquire the holds through the normal path
  // Phase 3 deliberately reuses handleProceedToPayment untouched, which is what
  // gives the 409 DATES_UNAVAILABLE / DATES_HELD / 429 outcomes for free.
  const [pendingDraft, setPendingDraft] = useState<ResumeDraftDetail | null>(null);
  const [restoreExpected, setRestoreExpected] = useState<number | null>(null);
  const restoreSubtotalRef = useRef(0);
  const restoredRef = useRef(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const draft = (e as CustomEvent<ResumeDraftDetail>).detail;
      if (!draft?.found) return;

      setGuestName(draft.guest.name);
      setGuestEmail(draft.guest.email);
      setGuestPhone(draft.phone);
      setGuestProvince(draft.guest.province);
      setGuestNote(draft.guest.note);
      setPaymentOption(draft.payment_option);
      setPromoInput(draft.promo_code ?? "");
      // Never trust a stored discount: the code is re-validated in phase 3.
      setAppliedPromo(null);
      // They consented in the dialog, so this is honest rather than a bypass.
      setPdpaConsent(true);
      handleRemoveSlip();
      // A fresh session id, always. It doubles as the cross-device slip path, so
      // reusing it would let the polling effect pick up a slip left over from
      // the abandoned attempt and treat it as a new upload. 049's same-phone
      // takeover means a new session id costs nothing for reclaiming the hold.
      setUploadSessionId(crypto.randomUUID());
      setStep("dates");
      setDateRange({ from: parseISO(draft.check_in), to: parseISO(draft.check_out) });
      setPendingDraft(draft);
      // The dialog that dispatched this is still open — it calls onOpenChange
      // only after we return — and Radix locks body scroll while a dialog is
      // mounted (react-remove-scroll sets overflow:hidden on <body>), so
      // scrolling here is a silent no-op: the guest is left wherever the header
      // menu was while the panel swaps to step 3 far below. Defer past the exit
      // animation, the same 250ms handleStayInBooking uses for this exact
      // reason. The section's top edge is the right landing spot for every
      // outcome — its position does not move between steps — so this covers the
      // clean restore into step 3 and the step-1 fallbacks alike.
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    };
    document.addEventListener("resume-draft", handler);
    return () => document.removeEventListener("resume-draft", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Steps 2–3 run full screen, under the site header (z-45: every dialog the steps open sits at
  // z-50 or above, so none can open behind it). While open, the page behind is locked and taken
  // out of the tab order; the same card element moves, so no form state, hold or timer remounts.
  const checkoutOpen = step !== "dates";
  useEffect(() => {
    const shell = checkoutShellRef.current;
    if (!checkoutOpen || !shell) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    // Everything in <main> beside the card's own ancestors; outside a <main> nothing is touched.
    const main = shell.closest("main");
    const inerted: HTMLElement[] = [];
    for (let el: HTMLElement = shell; main && el.parentElement && el !== main; el = el.parentElement) {
      for (const sibling of Array.from(el.parentElement.children)) {
        if (sibling !== el && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          inerted.push(sibling);
        }
      }
      if (el.parentElement === main) break;
    }
    shell.focus({ preventScroll: true });
    return () => {
      root.style.overflow = previousOverflow;
      for (const el of inerted) el.inert = false;
    };
  }, [checkoutOpen]);
  // Each page of the overlay (details, review, payment, done, expired) starts at its top.
  useEffect(() => {
    if (checkoutOpen) checkoutShellRef.current?.scrollTo({ top: 0 });
  }, [step, checkoutOpen, showConfirmModal, showConfirmedModal, holdExpired]);

  // Broadcast the current step so MobileBookingBar can hide itself past step 1
  useEffect(() => {
    document.dispatchEvent(new CustomEvent("booking-step", { detail: { step } }));
  }, [step]);

  // Tell MobileBookingBar when this card is on screen above it, so the fixed bar
  // doesn't cover the step-1 button. The margins trim the header and the bar.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const send = (inView: boolean) => document.dispatchEvent(new CustomEvent("booking-card-view", { detail: { inView } }));
    const io = new IntersectionObserver(([entry]) => send(entry.isIntersecting), { rootMargin: "-72px 0px -88px 0px" });
    io.observe(el);
    return () => { io.disconnect(); send(false); };
  }, []);

  // Broadcast cart size so MobileBookingBar can show a count badge.
  useEffect(() => {
    document.dispatchEvent(new CustomEvent("cart-count", { detail: { count: cartLines.length } }));
  }, [cartLines.length]);

  // Live booked ranges fetched client-side to stay up-to-date
  const [liveBookedRanges, setLiveBookedRanges] = useState<BookedRange[]>(bookedRanges);

  useEffect(() => {
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

  // How many rooms RoomsSection will actually show for the chosen range — drives
  // the "no rooms selected" panel's hint so it can't promise rooms that aren't there.
  const availableRoomCount = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return 0;
    return rooms.filter((r) => cart.isRoomAvailableForRange(r)).length;
  }, [dateRange?.from, dateRange?.to, rooms, cart]);


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

  const specialsByRoom = useMemo(() => {
    const map: Record<string, RoomSpecialPrice[]> = {};
    for (const s of specialPrices) {
      if (!map[s.room_id]) map[s.room_id] = [];
      map[s.room_id].push(s);
    }
    return map;
  }, [specialPrices]);

  const nights = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return 0;
    return differenceInDays(dateRange.to, dateRange.from);
  }, [dateRange]);

  // With no usable range — or a range nothing is free for — the only sensible next
  // step is the date picker, so the empty state points there instead of the rooms.
  // nights < 1 covers both "nothing picked" and "check-in only" (from === to).
  const emptyCartNeedsDates = nights < 1 || availableRoomCount === 0;

  const optionsTotal = useMemo(() => {
    return selectedOptionIds.reduce((sum, id) => {
      const opt = roomOptions.find((o) => o.id === id);
      if (!opt) return sum;
      return sum + (opt.pricing_type === "per_time" ? opt.price : opt.price * (nights || 1));
    }, 0);
  }, [selectedOptionIds, roomOptions, nights]);

  // Per-line gross + cart subtotal come from the shared cart context
  // (single source of truth — see booking-cart-context).

  // Cart subtotal (sum of all added lines) drives promo, totals, deposit, payment.
  const subtotalPrice = subtotal;

  const promoDiscount = useMemo(() => {
    if (!appliedPromo || subtotalPrice <= 0) return 0;
    const v = Number(appliedPromo.discount_value || 0);
    if (!Number.isFinite(v) || v <= 0) return 0;
    const raw = appliedPromo.discount_type === "percentage"
      ? Math.floor((subtotalPrice * v) / 100)
      : Math.floor(v);
    return Math.max(0, Math.min(raw, subtotalPrice));
  }, [appliedPromo, subtotalPrice]);

  const totalPrice = Math.max(0, subtotalPrice - promoDiscount);

  // Deposit scales with the number of rooms (shared dates → one check-in month).
  const resolvedDeposit = useMemo(() => {
    return getDepositForMonth(host, dateRange?.from) * cartLines.length;
  }, [host, dateRange?.from, cartLines.length]);

  const depositAvailable = resolvedDeposit > 0 && resolvedDeposit < totalPrice;
  // Same test the QR card uses to decide between the bank details and the PromptPay QR.
  const payByBank = host.payment_display === "bank" && !!host.bank_name && !!host.bank_account_number && !!host.bank_account_name;

  const paymentAmount = useMemo(() => {
    if (paymentOption === "deposit" && depositAvailable) {
      return resolvedDeposit;
    }
    return totalPrice;
  }, [paymentOption, depositAvailable, resolvedDeposit, totalPrice]);

  // Same cut-off as /api/bookings/cancel (cancel allowed while days-to-check-in
  // >= cancellation_days), so the last free day is check-in minus N. Hidden once passed.
  const cancellationDays = host.cancellation_days || 0;
  const freeCancelDeadline = cancellationDays > 0 && dateRange?.from ? subDays(dateRange.from, cancellationDays) : null;
  const freeCancelUntil =
    freeCancelDeadline && format(freeCancelDeadline, "yyyy-MM-dd") >= billingTodayStr()
      ? fmtDate(freeCancelDeadline, "d MMM yyyy", locale)
      : null;

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

  // Select the DRAFT room to configure. Dates are shared across the cart, so
  // (unlike the old single-room flow) we keep the chosen date range.
  const handleRoomChange = (roomId: string) => {
    setSelectedRoomId(roomId);
    setSelectedOptionIds([]);
    setNumGuests("2");
  };


  const handleApplyPromo = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const codeRaw = promoInput.trim();
    if (!codeRaw) return;
    if (subtotalPrice <= 0) {
      if (!silent) toast.error(t("promoErrorNoSubtotal"));
      return;
    }
    setPromoApplying(true);
    try {
      const res = await fetch("/api/promos/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homestay_id: homestay.id,
          code: codeRaw,
          subtotal: subtotalPrice,
          guest_phone: guestPhone || undefined,
          guest_email: guestEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        if (!silent) {
          const reason = data.reason || "INVALID";
          toast.error(t(`promoError${reason}` as Parameters<typeof t>[0], { default: t("promoErrorINVALID") }));
        }
        return;
      }
      setAppliedPromo({
        id: data.code_id,
        code: data.code,
        discount_type: data.discount_type,
        discount_value: Number(data.discount_value),
      });
      if (!silent) toast.success(t("promoApplied"));
    } catch {
      if (!silent) toast.error(t("promoErrorINVALID"));
    } finally {
      setPromoApplying(false);
    }
  }, [promoInput, subtotalPrice, homestay.id, guestPhone, guestEmail, t]);

  // Auto-apply when a recommender link supplied ?promo= and dates+room produce a subtotal.
  // Fires at most once per session (autoPromoTriedRef), and only if the user has not
  // already applied or replaced the code manually.
  useEffect(() => {
    if (!initialPromo) return;
    if (autoPromoTriedRef.current) return;
    if (appliedPromo) return;
    if (subtotalPrice <= 0) return;
    if (promoInput.trim().toUpperCase() !== initialPromo.code.toUpperCase()) return;
    autoPromoTriedRef.current = true;
    void handleApplyPromo({ silent: true });
  }, [initialPromo, appliedPromo, subtotalPrice, promoInput, handleApplyPromo]);

  const handleRemovePromo = useCallback(() => {
    setAppliedPromo(null);
    setPromoInput("");
  }, []);

  // Demand funnel. A step is recorded when the guest advances OUT of it, not on
  // arrival: `step` initialises to "dates", so arrival-based tracking would make
  // step 1 a duplicate of page_view. Always sync and never awaited — this sits
  // in the hold-acquisition path and must not widen that race window.
  const trackStep = useCallback(
    (demandStep: "dates" | "details" | "payment", data?: Record<string, unknown>) => {
      trackDemand({
        homestayId: homestay.id,
        eventType: DemandEvent.CHECKOUT_STEP,
        step: demandStep,
        checkIn: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null,
        checkOut: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null,
        nights,
        locale,
        ...(data ? { data } : {}),
      });
    },
    [homestay.id, dateRange, nights, locale],
  );

  const handleProceedToDetails = () => {
    if (cartLines.length === 0) {
      toast.error(t("errorCartEmpty"));
      return;
    }
    trackStep("dates");
    // Always start at the form: a review left open by an earlier, abandoned try must not come back.
    setShowConfirmModal(false);
    setStep("details");
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  // The province is optional: it feeds the host's guest-origin chart and nothing
  // the stay needs, so it is not asked for as a condition of booking.
  const validateGuestForm = useCallback((): { name?: string; email?: string; phone?: string } => {
    const e: { name?: string; email?: string; phone?: string } = {};
    if (!guestName.trim()) e.name = t("fieldRequired");
    if (!guestEmail.trim()) e.email = t("fieldRequired");
    else if (!isValidEmail(guestEmail)) e.email = t("errorInvalidEmail");
    if (!guestPhone.trim()) e.phone = t("fieldRequired");
    else if (!isValidPhone(guestPhone)) e.phone = t("errorInvalidPhone");
    return e;
  }, [guestName, guestEmail, guestPhone, t]);

  const focusFirstError = useCallback((e: { name?: string; email?: string; phone?: string }) => {
    if (e.name) nameInputRef.current?.focus();
    else if (e.email) emailInputRef.current?.focus();
    else if (e.phone) phoneInputRef.current?.focus();
  }, []);

  const handleProceedToPayment = async () => {
    const formErrors = validateGuestForm();
    if (Object.keys(formErrors).length > 0) {
      // Can fire from the confirm summary (fields not visible there) — bounce
      // back to the details form so the inline errors are seen.
      setErrors(formErrors);
      setShowConfirmModal(false);
      focusFirstError(formErrors);
      return;
    }
    setErrors({});
    if (!dateRange?.from || !dateRange?.to || cartLines.length === 0) return;

    // Finished step 2. Recorded before the hold loop on purpose: the gap
    // between this and the "payment" event below is exactly the bookings lost
    // to a 409 hold conflict.
    trackStep("details");

    setIsSubmitting(true);
    setHoldProgress({ done: 0, total: cartLines.length });
    try {
      const checkIn = format(dateRange.from, "yyyy-MM-dd");
      const checkOut = format(dateRange.to, "yyyy-MM-dd");
      // Hold every room in the cart under the shared session id. Fired
      // together rather than one after another: each is an independent round
      // trip against a different room, so a 3-room cart used to pay three
      // serial latencies for work that has no ordering requirement. The
      // per-IP rate limit is unchanged — same number of requests either way.
      const settled = await Promise.all(
        cartLines.map(async (line) => {
          const res = await fetch("/api/bookings/hold", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              room_id: line.roomId,
              check_in: checkIn,
              check_out: checkOut,
              session_id: uploadSessionId,
              guest_phone: guestPhone.trim(),
            }),
          });
          const payload = await res.json().catch(() => ({}));
          setHoldProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
          return { status: res.status, ok: res.ok, payload };
        }),
      );

      // Promise.all preserves cart order, so the guest sees the same message
      // they would have before rather than whichever request happened to land
      // first.
      const failure = settled.find((r) => !r.ok);
      if (failure) {
        // Rooms that did succeed are held under this session and must be given
        // back — in flight together, any of them can win while another loses.
        // (The old loop only released on a 409, stranding rooms for the full
        // 10-minute hold on a 429 or a 500.)
        fetch("/api/bookings/hold", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: uploadSessionId }),
        }).catch(() => {});

        if (failure.status === 409) {
          if (failure.payload?.error === "DATES_UNAVAILABLE") {
            toast.error(t("errorDatesUnavailable"));
            fetch(`/api/bookings/availability?homestay_id=${homestay.id}`)
              .then((r) => r.json())
              .then((d) => { if (d.bookedRanges) setLiveBookedRanges(d.bookedRanges); })
              .catch(() => {});
            setStep("dates");
          } else {
            setShowHeldModal(true);
          }
        } else if (failure.status === 429) {
          toast.error(t("errorTooManyRequests"));
        } else {
          toast.error(t("errorGeneric"));
        }
        setIsSubmitting(false);
        return;
      }

      const first = settled[0]?.payload;
      setHoldId(first?.hold_id ?? null);
      setHoldExpiresAt(first?.expires_at ? new Date(first.expires_at).getTime() : null);

      // Snapshot the form so a guest who switches to their banking app and
      // never comes back can restore it with their phone + email instead of
      // retyping steps 1 and 2. This is the ONLY reliable moment to write it: a
      // backgrounded or memory-killed tab fires no pagehide and no trustworthy
      // visibilitychange — the same reason handleHoldExpired never runs in that
      // case. Fire-and-forget, like trackDemand: a slow save must never delay
      // the QR, and its failure must never surface here.
      fetch("/api/bookings/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homestay_id: homestay.id,
          guest_phone: guestPhone.trim(),
          guest_email: guestEmail.trim(),
          guest_name: guestName.trim(),
          guest_province: guestProvince,
          guest_note: guestNote,
          check_in: checkIn,
          check_out: checkOut,
          lines: cartLines.map((l) => ({
            room_id: l.roomId,
            num_guests: l.numGuests,
            tier_ids: l.tierIds,
            option_ids: l.optionIds,
          })),
          promo_code: appliedPromo?.code ?? (promoInput.trim() || null),
          payment_option: paymentOption,
          subtotal_at_save: subtotal,
          locale,
        }),
      }).catch(() => {});

      trackStep("payment", restoredRef.current ? { source: "resumed" } : undefined);
      setStep("payment");
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setIsSubmitting(false);
      setHoldProgress(null);
    }
  };

  // handleProceedToPayment is a plain render-scope function, not a useCallback,
  // so calling it from an effect would capture a stale closure. Same shape as
  // releaseHoldRef below.
  const proceedRef = useRef(handleProceedToPayment);
  useEffect(() => { proceedRef.current = handleProceedToPayment; });

  // Phase 2: the draft's dates are committed, so the catalog check is meaningful.
  useEffect(() => {
    if (!pendingDraft) return;
    if (!dateRange?.from || !dateRange?.to) return;
    if (format(dateRange.from, "yyyy-MM-dd") !== pendingDraft.check_in) return;

    const result = reconcileDraftWithCatalog(pendingDraft, {
      rooms,
      roomOptions,
      guestPricing,
      isRoomAvailableForRange,
      todayStr: billingTodayStr(),
    });
    restoreSubtotalRef.current = pendingDraft.subtotal_at_save;
    setPendingDraft(null);

    if (result.reason === "past_dates") {
      setDateRange(undefined);
      toast.error(tr("restoredDatesPast"));
      return;
    }

    clearCart();
    for (const l of result.lines) {
      addLine({
        lineId: crypto.randomUUID(),
        roomId: l.room_id,
        numGuests: l.num_guests,
        tierIds: l.tier_ids,
        optionIds: l.option_ids,
      });
    }

    if (result.reason === "no_rooms") {
      toast.error(tr("restoredNoRooms"));
      return;
    }
    // Something is gone: stop at step 1 so they re-pick knowingly, rather than
    // paying for a cart we quietly edited. Their details stay filled in.
    if (result.droppedCount > 0) {
      toast.warning(
        result.droppedRoomNames.length > 0
          ? tr("restoredPartial", { names: result.droppedRoomNames.join(", ") })
          : tr("restoredPartialGeneric"),
      );
      return;
    }

    setRestoreExpected(result.lines.length);
  }, [pendingDraft, dateRange, rooms, roomOptions, guestPricing, isRoomAvailableForRange, clearCart, addLine, setDateRange, tr]);

  // Phase 3: the cart now reflects the restored lines, so the hold request will
  // see them.
  useEffect(() => {
    if (restoreExpected === null) return;
    if (cartLines.length !== restoreExpected) return;
    setRestoreExpected(null);

    void (async () => {
      // Re-validate rather than trust: a code can have expired or hit MAX_USES
      // since they saved.
      if (promoInput.trim()) await handleApplyPromo({ silent: true });
      if (restoreSubtotalRef.current > 0 && subtotal !== restoreSubtotalRef.current) {
        toast.warning(tr("restoredPriceChanged"));
      } else {
        toast.success(tr("restored"));
      }
      restoredRef.current = true;
      await proceedRef.current();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreExpected, cartLines.length]);

  const releaseHold = useCallback(() => {
    if (!holdId) return;
    // Release every hold in this session — a multi-room cart may have held
    // several rooms under the one session id, not just the first.
    fetch("/api/bookings/hold", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: uploadSessionId }),
    }).catch(() => { });
    setHoldId(null);
    setHoldExpiresAt(null);
  }, [holdId, uploadSessionId]);

  // Hold expiry callback — passed to <HoldCountdown onExpire />. The overlay switches to the
  // expired page, which tells every guest to contact the host if they already transferred.
  const handleHoldExpired = useCallback(() => {
    releaseHold();
    handleRemoveSlip();
    setHoldExpired(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Choose new dates" on the expired page: back to step 1 with the picker open.
  const handleStartOver = () => {
    setHoldExpired(false);
    setDateRange(undefined);
    setStep("dates");
    setTimeout(() => setCalendarOpen(true), 150);
  };

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

  // A quick booking the server turned down for a reason the guest can act on.
  // True once the guest has been told why, so the caller stops quietly.
  const explainQuickRefusal = async (res: Response): Promise<boolean> => {
    const { code } = (await res.json().catch(() => ({}))) as { code?: string };
    if (code === "TOO_MANY_PENDING") toast.error(t("errorQuickPendingLimit"));
    else if (code === "QUICK_NOT_ENABLED" || code === "NORMAL_NOT_ENABLED") toast.error(t("errorBookingModeChanged"));
    else if (code === "TURNSTILE_FAILED") toast.error(t("errorVerification"));
    else if (res.status === 429) toast.error(t("errorTooManyRequests"));
    else return false;
    return true;
  };

  // Creates the booking(s) for the cart: one house goes to /api/bookings, several
  // to /api/bookings/group. `slip` is what the server is told about payment.
  // True when the booking was created.
  const createBookingFromCart = async (slip: BookingSlipFields): Promise<boolean> => {
    if (!dateRange?.from || !dateRange?.to) return false;
    const checkIn = format(dateRange.from, "yyyy-MM-dd");
    const checkOut = format(dateRange.to, "yyyy-MM-dd");
    const optionsForLine = (optionIds: string[]) =>
      optionIds.map((id) => {
        const opt = roomOptions.find((o) => o.id === id);
        const price = opt?.pricing_type === "per_time" ? (opt?.price || 0) : (opt?.price || 0) * nights;
        return { id, name: opt?.name || "", price };
      });

    const handleCreateConflict = () => {
      toast.error(t("errorDatesUnavailable"));
      fetch(`/api/bookings/availability?homestay_id=${homestay.id}`)
        .then((res) => res.json())
        .then((data) => { if (data.bookedRanges) setLiveBookedRanges(data.bookedRanges); })
        .catch(() => {});
      setStep("dates");
      setIsSubmitting(false);
    };

    // 3. Create the booking(s) — 1 room → single endpoint, ≥2 rooms → group endpoint.
    const request = buildBookingRequest({
      homestayId: homestay.id,
      guest: { name: guestName, email: guestEmail, phone: guestPhone, province: guestProvince, note: guestNote },
      checkIn,
      checkOut,
      lines: cartLines,
      lineGross: computeLineGross,
      optionsForLine,
      totalPrice,
      paymentType: paymentOption,
      paymentAmount,
      promoCodeId: appliedPromo?.id,
      sessionId: uploadSessionId,
      locale,
      slip,
    });
    const res = await fetch(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
    });
    if (!res.ok) {
      if (res.status === 409) { handleCreateConflict(); return false; }
      if (slip.quick && (await explainQuickRefusal(res))) return false;
      throw new Error("Failed to create booking");
    }
    const created = await res.json();
    const createdId: string | null =
      request.url === "/api/bookings" ? created.booking.id : created.group?.id || created.bookings?.[0]?.id || null;

    setBookingId(createdId);
    setSlipVerified(slip.easyslip_verified);
    setQuickPlaced(!!slip.quick);
    trackDemand({
      homestayId: homestay.id,
      eventType: DemandEvent.BOOKING_SUBMITTED,
      checkIn: format(dateRange.from, "yyyy-MM-dd"),
      checkOut: format(dateRange.to, "yyyy-MM-dd"),
      nights,
      locale,
      ...(slip.quick ? { data: { quick: true } } : {}),
    });
    // Hold is cleaned up server-side by create_booking_atomic; clear local state
    releaseHold();
    setHoldId(null);
    setHoldExpiresAt(null);

    // No second upload here. This used to re-send the whole slip to
    // /api/slip-upload/{uploadSessionId} as a "backup", but nothing ever read
    // it: sessions/{id}/slip is consumed only by the cross-device polling
    // loop BEFORE submission, and the booking stores the pending/{uuid} path
    // that /api/verify-slip already wrote. It cost the guest a second
    // full-file upload on mobile data and left an orphan object that nothing
    // deletes.

    setShowConfirmedModal(true);
    // toast.success(t("successSubmitted"));
    return true;
  };

  const handleSubmitBooking = async () => {
    if (!slipFile) {
      toast.error(t("errorUploadSlip"));
      return;
    }

    if (!dateRange?.from || !dateRange?.to) return;

    setIsSubmitting(true);
    setVerifyingSlip(true);

    try {
      // 1. Prepare the slip file
      let slipToVerify: File;
      if (phoneSlipReceived && phoneSlipUrl) {
        const slipRes = await fetch(phoneSlipUrl);
        const blob = await slipRes.blob();
        // Came from the phone rather than handleSlipSelect, so it has not been
        // through prepareSlip yet.
        slipToVerify = await prepareSlip(
          new File([blob], "slip.jpg", { type: blob.type }),
        );
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

      // Defensive: a 5xx from the edge can arrive as an HTML body, and this
      // used to throw straight into the generic catch.
      let verifyData: {
        duplicate?: boolean;
        slip_pending?: boolean;
        verified?: boolean;
        reason?: string;
        message?: string;
        error?: string;
        slip_hash?: string;
        slip_trans_ref?: string | null;
        payment_slip_url?: string | null;
        easyslip_response?: unknown;
      } = {};
      try {
        verifyData = await verifyRes.json();
      } catch {
        verifyData = {};
      }

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

      // Stop here on a failed verification instead of falling through. Without
      // this, a 500 left slip_hash undefined and we posted a booking that
      // /api/bookings is guaranteed to reject with a 400 — the guest saw a
      // generic error and no booking, with no way to tell what went wrong.
      // The slip stays attached so the guest can simply retry.
      if (!verifyRes.ok || !verifyData.slip_hash) {
        // Say WHICH failure this was. "Verification failed" is the same words
        // for a 4MB photo, an unconfigured API key, a rate limit and a real
        // mismatch — so a guest retries something that cannot succeed, and a
        // broken deployment is indistinguishable from a bad screenshot.
        // 429 has no body reason: it comes from the shared rate limiter.
        const reason = verifyRes.status === 429 ? "RATE_LIMITED" : verifyData.reason;
        const key = `slipError${reason}` as Parameters<typeof t>[0];
        console.error(
          `[Slip] verification failed (HTTP ${verifyRes.status}, reason=${reason ?? "none"}):`,
          verifyData.error || verifyData.message || "no message",
        );
        toast.error(reason && t.has(key) ? t(key) : t("errorSlipVerifyFailed"));
        setIsSubmitting(false);
        return;
      }

      const isSlipVerified = !!verifyData.verified;
      if (!isSlipVerified) {
        // The guest still gets a booking (confirmedTextPending explains the
        // manual review), but the reason is otherwise invisible — including to
        // whoever is testing why nothing ever auto-confirms.
        console.warn(
          `[Slip] not auto-verified (reason=${verifyData.reason ?? "none"}):`,
          verifyData.message || "no message",
        );
      }
      await createBookingFromCart({
        slip_hash: verifyData.slip_hash,
        slip_trans_ref: verifyData.slip_trans_ref || null,
        payment_slip_url: verifyData.payment_slip_url || null,
        easyslip_response: verifyData.easyslip_response || null,
        easyslip_verified: isSlipVerified,
      });
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setIsSubmitting(false);
      setVerifyingSlip(false);
    }
  };

  // A widget that never loads (script blocked, no network to Cloudflare) raises
  // no error event, so without this the button would stay disabled for good.
  // Cloudflare being out must never stop a guest from booking.
  useEffect(() => {
    if (!quickEnabled || !turnstileSiteKey || step !== "payment" || turnstilePassed) return;
    const timer = setTimeout(() => setTurnstileError(true), TURNSTILE_PATIENCE_MS);
    return () => clearTimeout(timer);
  }, [quickEnabled, turnstileSiteKey, step, turnstilePassed, turnstileNonce]);

  // Guest quick booking: no slip, the host checks the transfer by hand. The
  // Turnstile token is single use, so a try that did not create a booking asks
  // for a fresh one.
  const handleSubmitQuick = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setIsSubmitting(true);
    let created = false;
    try {
      created = await createBookingFromCart({
        easyslip_verified: false,
        quick: true,
        ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
      });
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setIsSubmitting(false);
      if (!created) {
        setTurnstileToken(null);
        setTurnstileNonce((n) => n + 1);
      }
    }
  };


  // --- Guard against losing in-progress booking data on browser Back ---
  // The whole funnel lives in client state on a single URL. While there is unsaved
  // progress we arm a sentinel history entry; pressing Back (or mobile swipe-back)
  // fires popstate instead of leaving the page, and we show a confirmation dialog —
  // the guest stays ("Continue") or leaves ("Leave & clear"). Refresh / tab-close /
  // window-close are intentionally NOT guarded (the browser only allows its generic
  // native prompt there, which we chose to drop).
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const leavingRef = useRef(false);
  const stepRef = useRef(step);
  const releaseHoldRef = useRef(releaseHold);
  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { releaseHoldRef.current = releaseHold; }, [releaseHold]);

  // Push a guard history entry so the next Back fires popstate WITHOUT leaving the
  // page. Pass null state and NO url: Next.js's patched pushState then just augments
  // the entry with its internal markers (__NA + router tree) and adds it. Passing a
  // url would make Next dispatch an ACTION_RESTORE navigation, which is unnecessary
  // here. Only ever call this OUTSIDE the popstate handler (arming on mount and from
  // the "Continue" button) — re-pushing during popstate makes Next reload the page.
  const armBackGuard = useCallback(() => {
    window.history.pushState(null, "");
  }, []);

  const hasProgress =
    !showConfirmedModal &&
    (step !== "dates" ||
      Boolean(dateRange?.from) ||
      selectedRoomId !== "" ||
      guestName.trim() !== "" ||
      guestEmail.trim() !== "" ||
      guestPhone.trim() !== "");

  // Browser Back / mobile swipe-back (same-document history navigation).
  useEffect(() => {
    if (!hasProgress) return;
    armBackGuard();
    const onPopState = () => {
      if (leavingRef.current) return;
      // Show the warning on ANY Back, at every step. We must NOT re-push a history
      // entry here: re-arming inside the popstate handler destabilises Next.js'
      // App Router and reloads the page (→ native "Leave site?" prompt). That is
      // exactly why step 1 worked (it never re-armed) but steps 2/3 didn't.
      // Re-arming happens only from the dialog's "Continue" button (a click).
      setShowLeaveWarning(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hasProgress, armBackGuard]);

  const handleStayInBooking = () => {
    setShowLeaveWarning(false);
    armBackGuard(); // re-arm for the next Back
    // Bring the booking form back into view. Deferred so it runs after the
    // dialog's exit animation releases Radix's body scroll lock (~200ms).
    setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
  };

  const handleLeaveAndClear = () => {
    leavingRef.current = true;
    setShowLeaveWarning(false);
    if (stepRef.current === "payment") releaseHoldRef.current(); // free the room hold on exit
    window.history.back();
  };

  const roomSeasons = selectedRoom ? (seasonsByRoom[selectedRoom.id] || []) : [];
  const roomSpecials = selectedRoom ? (specialsByRoom[selectedRoom.id] || []) : [];
  const { min: priceMin, max: priceMax } = selectedRoom
    ? getPriceRange({ basePricePerNight: selectedRoom.price_per_night, seasons: roomSeasons, specialPrices: roomSpecials })
    : { min: 0, max: 0 };
  const priceLabel = selectedRoom
    ? priceMin !== priceMax
      ? `฿${priceMin.toLocaleString()}–฿${priceMax.toLocaleString()}`
      : `฿${selectedRoom.price_per_night.toLocaleString()}`
    : "";

  // Where the checkout overlay is, for its header: the back button and the four named steps.
  const checkoutView = showConfirmedModal ? "done" : holdExpired ? "expired" : step === "payment" ? "pay" : showConfirmModal ? "review" : "details";
  const checkoutStepIndex = { details: 0, review: 1, pay: 2, expired: 2, done: 3 }[checkoutView];
  const checkoutBack =
    checkoutView === "details"
      ? () => setStep("dates")
      : checkoutView === "review"
        ? () => setShowConfirmModal(false)
        : checkoutView === "pay"
          ? () => { releaseHold(); setStep("details"); setShowConfirmModal(true); }
          : null;
  const nightsLabel = `${nights} ${nights > 1 ? tc("nights") : tc("night")}`;

  /** The stay (check-in → check-out) and every house in the cart, for the review and done pages. */
  const renderStaySummary = () => (
    <div className="space-y-4">
      {dateRange?.from && dateRange?.to && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-mist p-4">
          {([[homestay.check_in_time ? t("checkInTime", { time: homestay.check_in_time }) : t("checkInLabel"), dateRange.from], [homestay.check_out_time ? t("checkOutTime", { time: homestay.check_out_time }) : t("checkOutLabel"), dateRange.to]] as const).map(([label, d], i) => (
            <div key={i} className={i === 1 ? "order-3 text-right" : ""}>
              {/* A no-break space keeps "14:00 น." together when the label wraps on a phone. */}
              <p className="text-[13px] text-ink-2">{label.replace(/ (?=น\.)/, "\u00a0")}</p>
              <p className={`mt-0.5 flex items-baseline gap-1.5 ${i === 1 ? "justify-end" : ""}`}>
                <span className="font-serif text-3xl leading-none text-ink lining-nums">{fmtDate(d, "d", locale)}</span>
                <span className="text-[15px] text-ink">{fmtDate(d, "MMM", locale)}</span>
              </p>
              <p className="mt-0.5 text-[13px] text-ink-2">{fmtDate(d, "EEEE", locale)}</p>
            </div>
          ))}
          <p className="order-2 text-center text-[13px] text-ink-2">
            {nightsLabel}
            <br />→
          </p>
        </div>
      )}
      <ul className="divide-y divide-line">
        {cartLines.map((line) => {
          const room = rooms.find((r) => r.id === line.roomId);
          const guestLabel = composeLineGuestLabel(guestPricing.filter((g) => g.room_id === line.roomId), line.tierIds, line.numGuests, tc("guests"), locale);
          return (
            <li key={line.lineId} className="flex items-start gap-3.5 py-3.5 first:pt-0 last:pb-0">
              <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-mist-2">
                {room?.images?.[0] && <NextImage src={room.images[0]} alt="" fill sizes="80px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{room?.name}</p>
                <p className="text-[13px] text-ink-2">
                  {guestLabel}
                  {line.optionIds.length > 0 ? ` · ${t("optionsSelected", { count: line.optionIds.length })}` : ""}
                </p>
                <p className="mt-1 font-serif text-lg text-ink lining-nums tabular-nums">฿{computeLineGross(line).toLocaleString()}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const resetBooking = () => {
    setStep("dates");
    setHoldExpired(false);
    setPaymentOption("full");
    setSlipVerified(false);
    setQuickPlaced(false);
    setDateRange(undefined);
    setSelectedRoomId("");
    setNumGuests("2");
    clearCart();
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setGuestProvince("");
    setGuestNote("");
    handleRemoveSlip();
    setUploadSessionId(crypto.randomUUID());
    setBookingId(null);
    setPdpaConsent(false);
    setShowOptions(false);
    setShowConfirmModal(false);
    setShowConfirmedModal(false);
    setSelectedOptionIds([]);
    setAppliedPromo(null);
    setPromoInput("");
  };

  return (
    <>
      {/* Securing the houses (step 2 → 3: one hold request per house, several seconds for a big
          cart) or checking the slip: a full card over the checkout, under the site header like it. */}
      {((isSubmitting && step === "details") || verifyingSlip) && (
        <div
          className="fixed inset-x-0 top-[69px] bottom-0 z-[80] flex items-start justify-center bg-mist/95 px-4 pt-24"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="w-full max-w-md rounded-[24px] bg-white p-8 text-center">
            <span aria-hidden className="mx-auto mb-5 block h-12 w-12 animate-spin rounded-full border-[3px] border-pine-mist border-t-pine motion-reduce:animate-none" />
            <h3 className="font-serif text-2xl text-ink">{verifyingSlip ? t("verifyingSlipTitle") : t("securingRoomsTitle")}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{verifyingSlip ? t("verifyingSlipDesc") : t("securingRoomsDesc")}</p>
            {!verifyingSlip && holdProgress && holdProgress.total > 1 && (
              <div className="mt-5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-mist-2">
                  <div
                    className="h-full rounded-full bg-pine transition-all duration-300"
                    style={{ width: `${Math.round((holdProgress.done / holdProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-[13px] text-ink-2">
                  {t("securingRoomsProgress", { done: holdProgress.done, total: holdProgress.total })}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      <section id="booking-section" ref={sectionRef} className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {bookingDisabled && (
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-center">
              <Clock className="h-6 w-6 text-amber-500 mx-auto mb-2" />
              <p className="text-base font-medium text-amber-800">{t("unavailableTitle")}</p>
              <p className="text-sm text-amber-600 mt-1">{t("unavailableDesc")}</p>
            </div>
          )}
          <div className={`mx-auto max-w-5xl ${bookingDisabled ? "pointer-events-none opacity-50 select-none" : ""}`}>
            {/* ── Heading & how it works, above the card ── */}
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="font-serif text-3xl font-normal leading-tight text-ink md:text-4xl">{t("yourBooking")}</h2>
                {cartLines.length > 0 && dateRange?.from && dateRange?.to && (
                  <p className="text-sm text-ink-2">
                    {fmtDate(dateRange.from, "EEE d MMM", locale)} – {fmtDate(dateRange.to, "EEE d MMM", locale)} · {nightsLabel} · {t("roomsCount", { count: cartLines.length })}
                  </p>
                )}
              </div>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
                <span>{t(normalEnabled ? "howItWorks" : "howItWorksQuick")}</span>{" "}
                {/* How to book — reopens the tutorial (pulses once on first arrival) */}
                <motion.button
                  ref={helpPillRef}
                  type="button"
                  onClick={() => { setShowTutorial(true); setCookie(TUTORIAL_COOKIE, "1", 365); }}
                  animate={pulseHelp ? { scale: [1, 1.08, 1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 align-middle font-medium text-pine underline underline-offset-4 hover:text-pine-hover"
                >
                  {tt("reopen")}
                  <HelpCircle className="h-4 w-4" />
                </motion.button>
              </p>
            </div>

            {/* ── Booking card: full width on the page for step 1; steps 2–3 open it full screen ── */}
            <div
              ref={checkoutShellRef}
              data-checkout={checkoutOpen ? "open" : "closed"}
              role={checkoutOpen ? "dialog" : undefined}
              aria-label={checkoutOpen ? t("yourBooking") : undefined}
              tabIndex={checkoutOpen ? -1 : undefined}
              className={
                checkoutOpen
                  ? "fixed inset-x-0 top-[69px] bottom-0 z-[45] overflow-x-hidden overflow-y-auto overscroll-contain bg-mist outline-none animate-in fade-in slide-in-from-bottom-4 duration-300 motion-reduce:animate-none"
                  : "mt-6"
              }
            >
            {/* The checkout's own header: back, the stay, the hold timer, and where the guest is. */}
            {checkoutOpen && (
              <div className="sticky top-0 z-10 border-b border-line bg-white">
                <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-2 px-2 sm:px-4">
                  {checkoutBack ? (
                    <button type="button" onClick={checkoutBack} aria-label={tc("back")} className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-mist focus-visible:outline-2 focus-visible:outline-pine">
                      <ArrowLeft size={20} />
                    </button>
                  ) : (
                    <span aria-hidden className="size-11 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1 py-2">
                    <p className="leading-tight font-medium text-ink">{t("bookHouse")}</p>
                    <p className="truncate text-[13px] text-ink-2">
                      {homestay.name}
                      {dateRange?.from && dateRange?.to ? ` · ${fmtDate(dateRange.from, "d MMM", locale)} – ${fmtDate(dateRange.to, "d MMM", locale)} · ${nightsLabel}` : ""}
                    </p>
                  </div>
                  {step === "payment" && !showConfirmedModal && !holdExpired && (
                    <HoldCountdown expiresAt={holdExpiresAt} onExpire={handleHoldExpired} />
                  )}
                </div>
                <ol className="mx-auto flex max-w-3xl gap-1.5 px-4 pb-3 sm:px-6">
                  {[t("guestInfo"), t("stepReview"), t("stepPayment"), t("stepDone")].map((label, i) => (
                    <li
                      key={label}
                      aria-current={i === checkoutStepIndex ? "step" : undefined}
                      className={`flex-1 border-t-[3px] pt-1.5 text-xs ${i < checkoutStepIndex ? "border-pine text-ink-2" : i === checkoutStepIndex ? "border-pine font-medium text-ink" : "border-line text-ink-3"}`}
                    >
                      {label}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className={checkoutOpen ? "px-4 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-6" : ""}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.25, 0.1, 0, 1] }}
              ref={cardRef}
              id="booking-card"
              className={checkoutOpen ? "relative mx-auto flex w-full max-w-3xl scroll-mt-24 flex-col" : "relative flex scroll-mt-24 flex-col rounded-[24px] bg-white p-5 md:p-8"}
            >
            {!checkoutOpen && initialPromo && promoInput.trim().toUpperCase() === initialPromo.code.toUpperCase() && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-pine-mist bg-pine-mist p-3.5">
                <Gift className="mt-0.5 h-4 w-4 shrink-0 text-pine" />
                <div className="text-sm leading-snug text-ink">
                  <span className="font-semibold">
                    {t("promoFromLinkBanner", { code: initialPromo.code })}
                  </span>
                  {initialPromo.discount_value > 0 && (
                    <span>
                      {initialPromo.discount_type === "percentage"
                        ? t("promoFromLinkDiscountPct", { value: initialPromo.discount_value })
                        : t("promoFromLinkDiscountFixed", { value: initialPromo.discount_value.toLocaleString() })}
                    </span>
                  )}
                  {initialPromo.recommender_name && (
                    <span className="text-ink-2">
                      {t("promoFromLinkRef", { name: initialPromo.recommender_name })}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Hidden file inputs */}
            <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleSlipSelect(e.target.files?.[0] || null)} />

            <div>
              <AnimatePresence mode="wait">
                {/* ═══ Step 1: Dates ═══ */}
                {step === "dates" && (
                  <motion.div key="step-dates" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <AnimatePresence mode="wait">
                      {!showOptions ? (
                        <motion.div key="dates-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} aria-live="polite">
                          {cartLines.length === 0 ? (
                            <div className="px-2 py-4 text-center">
                              <span aria-hidden className="mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-full bg-pine-mist text-pine">
                                <ShoppingCart className="h-7 w-7" />
                              </span>
                              <h3 className="font-serif text-[22px] leading-snug text-ink">{t("noRoomSelected")}</h3>
                              <p className="mx-auto mt-1.5 max-w-[34ch] text-[15px] text-ink-2">
                                {!dateRange?.from
                                  ? t("noRoomSelectedNoDates")
                                  : nights < 1
                                    ? t("noRoomSelectedNeedCheckOut")
                                    : availableRoomCount === 0
                                      ? t("noRoomSelectedSoldOut")
                                      : t("noRoomSelectedHint", { count: availableRoomCount })}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  emptyCartNeedsDates
                                    ? setCalendarOpen(true)
                                    : document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" })
                                }
                                className="mt-5 inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
                              >
                                {emptyCartNeedsDates ? t("selectDates") : t("viewRooms")}
                              </button>
                            </div>
                          ) : (
                            <>
                              <CartLineList />
                              <div className="mt-4 space-y-2 border-t border-line pt-4">
                                {appliedPromo && promoDiscount > 0 && (
                                  <div className="flex justify-between text-[15px] text-emerald-700">
                                    <span>{t("promoLabel")} ({appliedPromo.code})</span>
                                    <span>−฿{promoDiscount.toLocaleString()}</span>
                                  </div>
                                )}
                                <div className="flex items-baseline justify-between gap-4 text-ink">
                                  <span className="text-[15px] font-medium">{tc("total")}</span>
                                  <span className={CO_MONEY_LG}>฿{totalPrice.toLocaleString()}</span>
                                </div>
                              </div>
                              <button onClick={handleProceedToDetails} className={`${CO_PRIMARY} mt-4`}>
                                {t("continueDetails")} <ArrowRight size={18} />
                              </button>
                            </>
                          )}
                        </motion.div>
                      ) : showOptions ? (
                        <motion.div key="dates-options" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.25 }} className="space-y-4">
                          <div className="flex items-center gap-3">
                            <button onClick={() => setShowOptions(false)} aria-label={tc("back")} className="-ml-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-mist-2 text-ink-2"><ArrowLeft size={18} /></button>
                            <h3 className="text-xl font-bold text-ink">{t("options")}</h3>
                          </div>
                          <p className="text-sm text-ink-3">{t("optionsDesc")}</p>

                          <div className="space-y-2">
                            {optionsForRoom.map((option) => {
                              const isChecked = selectedOptionIds.includes(option.id);
                              return (
                                <label
                                  key={option.id}
                                  className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${isChecked ? "border-pine bg-pine/5" : "border-line hover:border-line-strong"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setSelectedOptionIds((prev) =>
                                        isChecked ? prev.filter((id) => id !== option.id) : [...prev, option.id]
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-line-strong text-pine focus:ring-pine"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-ink">{option.name}</p>
                                  </div>
                                  <span className="text-sm font-semibold text-pine whitespace-nowrap">+฿{option.price.toLocaleString()}{option.pricing_type === "per_time" ? tc("perStay") : `/${tc("night")}`}</span>
                                </label>
                              );
                            })}
                          </div>

                          {optionsTotal > 0 && (
                            <div className="rounded-xl bg-mist px-3 py-2 flex justify-between text-sm">
                              <span className="text-ink-3">{t("optionsTotal")}</span>
                              <span className="font-bold text-ink">+฿{optionsTotal.toLocaleString()}</span>
                            </div>
                          )}

                          <button
                            onClick={() => setShowOptions(false)}
                            className="w-full bg-pine text-white px-10 py-4 rounded-full font-bold text-sm hover:bg-pine-hover transition-all flex items-center justify-center gap-2"
                          >
                            {tc("done")}
                          </button>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ═══ Step 2: Guest details (the checkout overlay's first page) ═══ */}
                {step === "details" && !showConfirmModal && (
                  <motion.div key="step-details" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                    <section className={CO_CARD}>
                      <h2 className={CO_H2}>{t("guestInfo")}</h2>
                      <p className={CO_LEAD}>{t("detailsLead")}</p>
                      <div className="mt-6 grid gap-x-4 gap-y-5 md:grid-cols-2">
                        <div className="space-y-1.5 md:col-span-2">
                          <label htmlFor="bk-name" className={CO_LABEL}>{t("fullName")} <span className="text-red-500">*</span></label>
                          <Input ref={nameInputRef} autoComplete="name" value={guestName} id="bk-name" aria-required="true" aria-invalid={!!errors.name} aria-describedby={errors.name ? "bk-name-error" : undefined} onChange={(e) => { setGuestName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }} placeholder={t("fullNamePlaceholder")} className={`${CO_INPUT} ${errors.name ? CO_INPUT_ERR : ""}`} />
                          {errors.name && <p id="bk-name-error" role="alert" className="text-[13px] font-medium text-red-700">{errors.name}</p>}
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="bk-phone" className={CO_LABEL}>{t("phone")} <span className="text-red-500">*</span></label>
                          <Input ref={phoneInputRef} type="tel" autoComplete="tel" inputMode="numeric" maxLength={10} value={guestPhone} id="bk-phone" aria-required="true" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "bk-phone-error" : undefined} onChange={(e) => { setGuestPhone(sanitizePhoneInput(e.target.value)); if (errors.phone) setErrors((p) => ({ ...p, phone: undefined })); }} placeholder={t("phonePlaceholder")} className={`${CO_INPUT} ${errors.phone ? CO_INPUT_ERR : ""}`} />
                          {errors.phone && <p id="bk-phone-error" role="alert" className="text-[13px] font-medium text-red-700">{errors.phone}</p>}
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="bk-email" className={CO_LABEL}>{t("email")} <span className="text-red-500">*</span></label>
                          <Input ref={emailInputRef} type="email" autoComplete="email" value={guestEmail} id="bk-email" aria-required="true" aria-invalid={!!errors.email} aria-describedby={errors.email ? "bk-email-error" : undefined} onChange={(e) => { setGuestEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }} placeholder={t("emailPlaceholder")} className={`${CO_INPUT} ${errors.email ? CO_INPUT_ERR : ""}`} />
                          {errors.email && <p id="bk-email-error" role="alert" className="text-[13px] font-medium text-red-700">{errors.email}</p>}
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                          <label htmlFor="bk-province" className={CO_LABEL}>{t("province")}</label>
                          <Select value={guestProvince} onValueChange={setGuestProvince}>
                            <SelectTrigger id="bk-province" className={`${CO_INPUT} !w-full justify-between`}>
                              <SelectValue placeholder={t("provincePlaceholder")} />
                            </SelectTrigger>
                            <SelectContent className="max-h-60 z-70">
                              {sortProvincesForLocale(locale).map((p) => (
                                <SelectItem key={p.value} value={p.value}>
                                  {locale === "th" ? p.labelTh : p.labelEn}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                          <label htmlFor="bk-note" className={CO_LABEL}>{t("notes")}</label>
                          <Textarea id="bk-note" value={guestNote} onChange={(e) => setGuestNote(e.target.value)} placeholder={t("notesPlaceholder")} className="min-h-24 rounded-xl !border !border-line-strong !bg-white px-4 py-3 text-base text-ink !shadow-none transition-colors hover:!border-ink-2 focus-visible:!ring-2 focus-visible:!ring-pine focus-visible:!ring-offset-2 md:text-[15px]" rows={3} />
                        </div>

                        {homestay.promo_codes_enabled && (
                          <div className="space-y-1.5 md:col-span-2">
                            <label htmlFor="bk-promo" className={CO_LABEL}>{t("promoLabel")}</label>
                            {appliedPromo ? (
                              <div className="flex items-center justify-between gap-3 rounded-xl bg-pine-mist px-4 py-3">
                                <div className="flex items-center gap-2 text-[15px] text-pine-deep">
                                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                                  <span className="font-mono font-semibold">{appliedPromo.code}</span>
                                  {promoDiscount > 0 && <span>−฿{promoDiscount.toLocaleString()}</span>}
                                </div>
                                <button type="button" onClick={handleRemovePromo} className="min-h-11 text-sm font-medium text-pine underline underline-offset-4 hover:text-pine-hover">
                                  {t("promoRemove")}
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <Input
                                  id="bk-promo"
                                  value={promoInput}
                                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                                  placeholder={t("promoPlaceholder")}
                                  className={`${CO_INPUT} flex-1 font-mono uppercase`}
                                />
                                <button
                                  type="button"
                                  disabled={promoApplying || !promoInput.trim() || subtotalPrice <= 0}
                                  onClick={() => handleApplyPromo()}
                                  className="min-h-12 shrink-0 rounded-full border border-line-strong bg-white px-5 text-[15px] font-medium text-ink transition-colors hover:bg-mist disabled:opacity-40"
                                >
                                  {promoApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : t("promoApply")}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </section>

                    <section className={CO_CARD}>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={pdpaConsent} onChange={(e) => setPdpaConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-line-strong accent-pine" />
                        <span className="text-[15px] text-ink-2">
                          {t.rich("pdpaConsent", {
                            privacy: (chunks) => <a href="/legal#privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-pine underline underline-offset-2">{chunks}</a>,
                            terms: (chunks) => <a href="/legal#terms" target="_blank" rel="noopener noreferrer" className="font-medium text-pine underline underline-offset-2">{chunks}</a>,
                          })}
                        </span>
                      </label>
                      <button
                        disabled={!pdpaConsent}
                        aria-describedby={pdpaConsent ? undefined : "co-consent-why"}
                        onClick={() => {
                          const formErrors = validateGuestForm();
                          setErrors(formErrors);
                          if (Object.keys(formErrors).length > 0) { focusFirstError(formErrors); return; }
                          setShowConfirmModal(true);
                        }}
                        className={`${CO_PRIMARY} mt-5`}
                      >
                        {t("continuePayment")} <ArrowRight size={18} />
                      </button>
                      {!pdpaConsent && <p id="co-consent-why" className="mt-2 text-center text-[13px] text-ink-2">{t("consentRequired")}</p>}
                    </section>
                  </motion.div>
                )}

                {/* ═══ Review: the whole booking, the way to pay, then the hold ═══ */}
                {step === "details" && showConfirmModal && (
                  <motion.div key="step-review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                    <section className={CO_CARD}>
                      <h2 className={CO_H2}>{t("confirmTitle")}</h2>
                      <p className={CO_LEAD}>{t("confirmDesc")}</p>
                      <div className="mt-5">{renderStaySummary()}</div>
                    </section>

                    <section className={CO_CARD}>
                      <h3 className={CO_H3}>{t("guestInfo")}</h3>
                      <dl className="mt-3 divide-y divide-line text-[15px]">
                        {[
                          [t("fullName"), guestName],
                          [t("phone"), guestPhone],
                          [t("email"), guestEmail],
                          ...(guestProvince ? [[t("province"), provinceLabel(guestProvince)]] : []),
                          ...(guestNote ? [[t("notes"), guestNote]] : []),
                        ].map(([label, value]) => (
                          <div key={label} className="flex justify-between gap-4 py-2.5">
                            <dt className="shrink-0 text-ink-2">{label}</dt>
                            <dd className="min-w-0 break-words text-right text-ink">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <button type="button" onClick={() => setShowConfirmModal(false)} className="mt-2 min-h-11 text-[15px] font-medium text-pine underline underline-offset-4 hover:text-pine-hover">
                        {t("confirmEdit")}
                      </button>
                    </section>

                    <section className={CO_CARD}>
                      <h3 className={CO_H3}>{t("priceBreakdown")}</h3>
                      <div className="mt-3 space-y-2 text-[15px]">
                        <div className="flex justify-between gap-4 text-ink-2">
                          <span>{t("staySubtotal")}</span>
                          <span className="text-ink">฿{subtotalPrice.toLocaleString()}</span>
                        </div>
                        {appliedPromo && promoDiscount > 0 && (
                          <div className="flex justify-between gap-4 text-emerald-700">
                            <span>{t("promoLabel")} ({appliedPromo.code})</span>
                            <span>−฿{promoDiscount.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3 font-medium text-ink">
                          <span>{tc("total")}</span>
                          <span className={CO_MONEY_LG}>฿{totalPrice.toLocaleString()}</span>
                        </div>
                      </div>
                    </section>

                    <section className={CO_CARD}>
                      <h3 id="co-pay-choice" className={CO_H3}>{t("choosePayment")}</h3>
                      {depositAvailable ? (
                        <div role="radiogroup" aria-labelledby="co-pay-choice" className="mt-3 grid gap-2.5">
                          {([
                            ["full", t("payFull"), totalPrice, t("payFullNote")],
                            ["deposit", t("payDeposit"), resolvedDeposit, t("payDepositNote", { amount: (totalPrice - resolvedDeposit).toLocaleString() })],
                          ] as const).map(([value, label, amount, note]) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={paymentOption === value}
                              onClick={() => setPaymentOption(value)}
                              className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${paymentOption === value ? "border-pine bg-pine-mist" : "border-line hover:border-line-strong"}`}
                            >
                              <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${paymentOption === value ? "border-pine" : "border-line-strong"}`}>
                                {paymentOption === value && <span className="h-2.5 w-2.5 rounded-full bg-pine" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium text-ink">{label}</span>
                                <span className="block text-[13px] text-ink-2">{note}</span>
                              </span>
                              <span className="font-serif text-xl text-ink" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>฿{amount.toLocaleString()}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 flex items-baseline justify-between gap-4 text-[15px] text-ink-2">
                          {t("payFull")} <span className={CO_MONEY_LG}>฿{totalPrice.toLocaleString()}</span>
                        </p>
                      )}
                      {freeCancelUntil && (
                        <p className="mt-3 text-[13px] text-emerald-700">{t("freeCancellationUntil", { date: freeCancelUntil })}</p>
                      )}
                      <button disabled={isSubmitting} onClick={() => handleProceedToPayment()} className={`${CO_PRIMARY} mt-5`}>
                        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t("confirmProceed")} ฿{paymentAmount.toLocaleString()}
                      </button>
                    </section>
                  </motion.div>
                )}

                {/* ═══ Payment: amount, how to pay, then the slip — one page ═══ */}
                {step === "payment" && !showConfirmedModal && !holdExpired && (
                  <motion.div key="step-payment" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                    {/* The page's heading for screen readers; the amount is its visual headline. */}
                    <h2 className="sr-only">{t("stepPayment")}</h2>
                    <section className={CO_CARD}>
                      <div className="border-b border-line pb-5 text-center">
                        <p className="text-[13px] text-ink-2">
                          {t("amountToTransfer")}
                          {paymentOption === "deposit" && depositAvailable ? ` (${t("payDeposit")})` : ""}
                        </p>
                        <p className="mt-1 font-serif text-5xl leading-tight text-ink" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
                          ฿{paymentAmount.toLocaleString()}
                        </p>
                        {paymentOption === "deposit" && depositAvailable && (
                          <p className="mt-1 text-[13px] text-amber-800">{t("payDepositNote", { amount: (totalPrice - paymentAmount).toLocaleString() })}</p>
                        )}
                      </div>

                      <div className="mt-6 grid gap-5 md:grid-cols-[1fr_260px] md:items-start">
                        {/* Step 1 (save the QR) only makes sense on a phone; hidden items don't take a number. */}
                        <ol className="space-y-3 text-[15px] text-ink [counter-reset:how]">
                          {[
                            ...(payByBank ? [] : [{ text: t("payStep1"), phoneOnly: true }, { text: t("payStep2") }]),
                            { text: t("payStep3") },
                            { text: normalEnabled ? t("payStep4") : t("quickPayStep4") },
                          ].map(({ text, phoneOnly }) => (
                            <li
                              key={text}
                              className={`items-start gap-3 [counter-increment:how] before:flex before:h-8 before:w-8 before:shrink-0 before:items-center before:justify-center before:rounded-full before:border before:border-ink before:font-serif before:text-sm before:content-[counter(how)] ${phoneOnly ? "flex md:hidden" : "flex"}`}
                            >
                              <span className="pt-1">{text}</span>
                            </li>
                          ))}
                        </ol>
                        <div>
                          {payByBank ? (
                            <>
                              <p className="mb-2 text-[15px] text-ink-2">{t("bankTransferDesc")}</p>
                              <dl className="divide-y divide-line rounded-2xl border border-line bg-white px-4 text-[15px]">
                                <div className="flex justify-between gap-3 py-3"><dt className="text-ink-2">{t("bankTransferTitle")}</dt><dd className="text-right font-medium text-ink">{host.bank_name}</dd></div>
                                <div className="flex justify-between gap-3 py-3"><dt className="text-ink-2">{t("bankAccountNo")}</dt><dd className="font-mono font-medium text-ink">{host.bank_account_number}</dd></div>
                                <div className="flex justify-between gap-3 py-3"><dt className="text-ink-2">{t("bankAccountHolderName")}</dt><dd className="text-right font-medium text-ink">{host.bank_account_name}</dd></div>
                              </dl>
                            </>
                          ) : (
                            <>
                            <p className="mb-2 text-center text-[13px] text-ink-2">{t("scanQr")}</p>
                            <div className="rounded-2xl border border-line bg-white p-4 text-center">
                              <span lang="en" className="inline-flex rounded-full bg-[#113566] px-3 py-1 text-[13px] font-semibold text-white">PromptPay</span>
                              <div ref={qrContainerRef} className="mx-auto mt-2 w-fit rounded-xl bg-white p-2">
                                <QRCodeSVG value={generatePayload(host.promptpay_id, { amount: paymentAmount })} size={180} level="M" />
                              </div>
                              <p className="mt-2 text-[13px] text-ink-2">{host.name}<br />{t("promptpayId")}: {host.promptpay_id}</p>
                              <button type="button" onClick={handleSaveQr} className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-mist">
                                <Download className="h-4 w-4" />{t("saveQrImage")}
                              </button>
                            </div>
                            </>
                          )}
                        </div>
                      </div>

                      {!normalEnabled && (
                        <div className="mt-5 flex gap-3 rounded-2xl bg-pine-mist p-4 text-[15px] text-pine-deep" data-testid="quick-no-slip-notice">
                          <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-pine" aria-hidden="true" />
                          <div className="space-y-1">
                            <p className="font-medium">{t("quickNoSlipTitle")}</p>
                            <p className="leading-relaxed">{t("quickNoSlipDesc")}</p>
                          </div>
                        </div>
                      )}
                    </section>

                    {normalEnabled && (
                      <section ref={uploadCardRef} className={`${CO_CARD} scroll-mt-40`}>
                        <h3 className={CO_H3}>{t("waitingForSlip")}</h3>
                        {showWelcomeBack && <p className="mt-3 rounded-xl bg-pine-mist px-4 py-2.5 text-[15px] text-pine-deep">{t("welcomeBack")}</p>}
                        <div className="mt-4">
                          {slipPreview ? (
                            <div className="space-y-3">
                              {phoneSlipReceived && (
                                <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-[15px] font-medium text-emerald-800">
                                  <CheckCircle2 className="h-4 w-4 shrink-0" />{t("slipReceived")}
                                </p>
                              )}
                              <div className="flex items-center gap-4 rounded-2xl border border-line p-3">
                                <img src={slipPreview} alt={t("slipPreview")} className="h-32 w-24 shrink-0 rounded-lg bg-mist object-cover" />
                                <div className="min-w-0">
                                  <p className="font-medium text-ink">{t("slipPreview")}</p>
                                  <p className="mt-0.5 text-[13px] text-ink-2">{t("slipVerify")}</p>
                                  <div className="mt-2 flex flex-wrap gap-x-4">
                                    <button type="button" onClick={() => galleryInputRef.current?.click()} className="min-h-11 text-[15px] font-medium text-pine underline underline-offset-4 hover:text-pine-hover">{t("changeSlip")}</button>
                                    <button type="button" onClick={handleRemoveSlip} className="min-h-11 text-[15px] font-medium text-red-700 underline underline-offset-4">{t("removeSlip")}</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button type="button" onClick={() => galleryInputRef.current?.click()}
                                className="flex w-full flex-col items-center gap-1 rounded-2xl border-[1.5px] border-dashed border-line-strong bg-mist px-4 py-7 text-center transition-colors hover:border-pine hover:bg-pine-mist">
                                <ImageIcon className="mb-1 h-6 w-6 text-pine" />
                                <span className="font-medium text-ink">{t("chooseFromGallery")}</span>
                                <span className="text-[13px] text-ink-2">{t("clickUpload")} · {t("slipVerify")}</span>
                              </button>
                              {!isMobile && (
                                <div className="mt-5">
                                  <div className="flex items-center gap-3 text-[13px] text-ink-2">
                                    <span className="h-px flex-1 bg-line" />{t("orUploadFromPhone")}<span className="h-px flex-1 bg-line" />
                                  </div>
                                  <div className="mt-4 flex items-center gap-5 rounded-2xl bg-mist p-4">
                                    <div className="shrink-0 rounded-xl border border-line bg-white p-2">
                                      <QRCodeSVG value={`${typeof window !== "undefined" ? window.location.origin : ""}/upload-slip/${uploadSessionId}`} size={100} level="M" />
                                    </div>
                                    <div>
                                      <p className="font-medium text-ink">{t("scanToUpload")}</p>
                                      <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("waitingForPhoneUpload")}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <button onClick={handleSubmitBooking} disabled={isSubmitting || !slipFile} className={`${CO_PRIMARY} mt-5`}>
                          {isSubmitting && verifyingSlip ? (<><Loader2 className="h-4 w-4 animate-spin" />{t("verifying")}</>) : t("submitBooking")}
                        </button>
                      </section>
                    )}

                    {quickEnabled && (
                      <section className={CO_CARD}>
                        {turnstileSiteKey && !turnstilePassed && (
                          <div className="mb-4 flex justify-center">
                            <Turnstile
                              key={turnstileNonce}
                              siteKey={turnstileSiteKey}
                              onSuccess={(token) => setTurnstileToken(token)}
                              onExpire={() => setTurnstileToken(null)}
                              onError={() => {
                                setTurnstileToken(null);
                                setTurnstileError(true);
                              }}
                              options={{ theme: "light", appearance: "interaction-only" }}
                            />
                          </div>
                        )}
                        {normalEnabled ? (
                          <button type="button" onClick={handleSubmitQuick} disabled={isSubmitting || !turnstilePassed}
                            className="flex min-h-12 w-full items-center justify-center rounded-full border border-line-strong bg-white px-6 py-2.5 text-center text-[15px] font-medium text-ink transition-colors hover:bg-mist disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine">
                            {t("quickSubmitAlt")}
                          </button>
                        ) : (
                          <button onClick={handleSubmitQuick} disabled={isSubmitting || !turnstilePassed} className={CO_PRIMARY}>
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            {t("quickSubmit")}
                          </button>
                        )}
                      </section>
                    )}

                    {/* Only promise the resume route when this host actually keeps drafts; otherwise the menu item the copy points at is not rendered. */}
                    <p className="px-2 text-center text-[13px] leading-relaxed text-ink-2">{t(resumeEnabled ? "doNotClosePageResume" : "doNotClosePage")}</p>
                  </motion.div>
                )}

                {/* ═══ Done: the booking was placed ═══ */}
                {step === "payment" && showConfirmedModal && (
                  <motion.div key="step-done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                    <section className={`${CO_CARD} text-center`}>
                      <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${slipVerified ? "bg-pine text-white" : "bg-amber-100 text-amber-800"}`} aria-hidden>
                        {slipVerified ? <CheckCircle2 size={32} /> : <Clock size={32} />}
                      </div>
                      <h2 className={CO_H2}>{slipVerified ? t("confirmedTitle") : quickPlaced ? t("quickPlacedTitle") : t("confirmedTitlePending")}</h2>
                      <p className={`${CO_LEAD} mx-auto max-w-md`}>{slipVerified ? t("confirmedText") : quickPlaced ? t("quickPlacedText") : t("confirmedTextPending")}</p>
                      {quickPlaced && bookingId && (
                        <QuickBookingNotice
                          code={bookingCode(bookingId)}
                          amountToTransfer={paymentAmount}
                          facebookUrl={homestay.facebook_url}
                          hostPhone={host.phone}
                        />
                      )}
                      {bookingId && !quickPlaced && (
                        <div className="mt-5">
                          <p className="text-[13px] text-ink-2">{t("bookingId")}</p>
                          {/* The first 8 characters: what the guest's email and the host's message quote. */}
                          <p className="mt-1.5 inline-block rounded-xl border border-line-strong px-5 py-2 font-serif text-2xl tracking-[0.08em] text-ink uppercase lining-nums">{bookingCode(bookingId)}</p>
                        </div>
                      )}
                      <p className="mt-4 text-[13px] text-ink-2">
                        {t("checkEmailForDetails")} <span className="font-medium break-all text-ink">{guestEmail}</span>
                      </p>
                    </section>

                    <section className={CO_CARD}>
                      {renderStaySummary()}
                      <div className="mt-4 space-y-2 border-t border-line pt-4 text-[15px]">
                        <div className="flex items-baseline justify-between gap-4 text-ink">
                          <span>{tc("total")}</span>
                          <span className={CO_MONEY_LG}>฿{totalPrice.toLocaleString()}</span>
                        </div>
                        {paymentOption === "deposit" && depositAvailable && (
                          <>
                            <div className="flex justify-between gap-4 text-ink-2">
                              <span>{quickPlaced ? t("amountToTransfer") : t("amountPaid")}</span>
                              <span className="text-ink">฿{paymentAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between gap-4 text-amber-800">
                              <span>{t("balanceDue")}</span>
                              <span>฿{(totalPrice - paymentAmount).toLocaleString()}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </section>

                    <section className={CO_CARD}>
                      <h3 className={CO_H3}>{t("doneNextSteps")}</h3>
                      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] text-ink-2 marker:text-ink">
                        <li>{t("doneStepCode")}</li>
                        {homestay.check_in_time && <li>{t("checkInTime", { time: homestay.check_in_time })}</li>}
                        {paymentOption === "deposit" && depositAvailable && (
                          <li>{t("payDepositNote", { amount: (totalPrice - paymentAmount).toLocaleString() })}</li>
                        )}
                      </ol>
                    </section>

                    <div className="grid gap-2.5">
                      <button type="button" onClick={() => { resetBooking(); window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); }} className={CO_PRIMARY}>
                        {t("backToHomestay")}
                      </button>
                      <button type="button" onClick={() => { resetBooking(); setTimeout(() => document.getElementById("rooms-section")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }), 50); }}
                        className="flex min-h-12 w-full items-center justify-center rounded-full border border-line-strong bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-mist">
                        {t("bookAnother")}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ═══ The hold ran out on the payment page ═══ */}
                {step === "payment" && holdExpired && !showConfirmedModal && (
                  <motion.div key="step-expired" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <section className={`${CO_CARD} text-center`}>
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-800" aria-hidden>
                        <Clock size={32} />
                      </div>
                      <h2 className={CO_H2}>{t("quickExpiredTitle")}</h2>
                      <p className={CO_LEAD}>{t("holdExpiredReleased")}</p>
                      <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-left text-[15px] leading-relaxed text-amber-900">{t("quickExpiredDesc")}</p>
                      <div className="mt-4 text-left">
                        <HostContactLinks facebookUrl={homestay.facebook_url} hostPhone={host.phone} />
                      </div>
                      <button type="button" onClick={handleStartOver} className={`${CO_PRIMARY} mt-5`}>
                        {t("chooseDifferentDates")}
                      </button>
                    </section>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
            </motion.div>{/* end form card */}
            </div>{/* end checkout padding */}
            </div>{/* end checkout shell */}
          </div>{/* end grid */}
        </div>{/* end max-w container */}
      </section>

      <BookingTutorialDialog open={showTutorial} onOpenChange={setShowTutorial} quickOnly={!normalEnabled} />

      {/* Step 1's date field + empty state open the same picker as the sticky bar. */}
      <BookingCalendarDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        onDone={() => document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

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
            <Button className="w-full bg-pine text-white hover:bg-pine-hover" onClick={handleHeldModalClose}>{t("chooseDifferentDates")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave-booking warning — browser Back / swipe-back that would exit the site */}
      <LeaveBookingDialog
        open={showLeaveWarning}
        onContinue={handleStayInBooking}
        onLeave={handleLeaveAndClear}
        roomName={
          cartLines.length === 1
            ? rooms.find((r) => r.id === cartLines[0].roomId)?.name ?? null
            : cartLines.length > 1
              ? t("roomsCount", { count: cartLines.length })
              : selectedRoom?.name ?? null
        }
        // Thai puts the day before the month ("20 พ.ย."), English the other way round.
        dateLabel={
          dateRange?.from
            ? `${fmtDate(dateRange.from, locale === "th" ? "d MMM" : "MMM d", locale)}${
                dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
                  ? ` – ${fmtDate(dateRange.to, locale === "th" ? "d MMM" : "MMM d", locale)}`
                  : ""
              }`
            : null
        }
        nightsLabel={nights > 0 ? `${nights} ${nights > 1 ? tc("nights") : tc("night")}` : null}
        guestsLabel={
          cartLines.length > 0
            ? `${cartLines.reduce((sum, l) => sum + l.numGuests, 0)} ${tc("guests")}`
            : dateRange?.from
              ? `${numGuests} ${tc("guests")}`
              : null
        }
      />
    </>
  );
}
