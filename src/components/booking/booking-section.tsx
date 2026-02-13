"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { format, differenceInDays, eachDayOfInterval, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Users, CreditCard, Upload, CheckCircle2, Loader2, Camera, ImageIcon, X, Smartphone, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import type { Homestay, Room, BlockedDate, Host } from "@/types/database";
import { THAI_PROVINCES } from "@/lib/provinces";
import generatePayload from "promptpay-qr";
import { QRCodeSVG } from "qrcode.react";

interface BookingSectionProps {
  homestay: Homestay;
  rooms: Room[];
  blockedDates: BlockedDate[];
  host: Host;
  embedded?: boolean;
}

type BookingStep = "dates" | "details" | "payment" | "confirmed";

export function BookingSection({
  homestay,
  rooms,
  blockedDates,
  host,
  embedded = false,
}: BookingSectionProps) {
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const themeColor = homestay.theme_color || "#16a34a";
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<BookingStep>("dates");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [numGuests, setNumGuests] = useState("1");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestProvince, setGuestProvince] = useState("");
  const locale = useLocale();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [paymentPhase, setPaymentPhase] = useState<"qr" | "upload">("qr");
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [uploadSessionId] = useState(() => crypto.randomUUID());
  const [phoneSlipReceived, setPhoneSlipReceived] = useState(false);
  const [phoneSlipUrl, setPhoneSlipUrl] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  const blockedDateSet = useMemo(() => {
    return new Set(blockedDates.map((d) => d.date));
  }, [blockedDates]);

  const disabledDays = useMemo(() => {
    return blockedDates.map((d) => parseISO(d.date));
  }, [blockedDates]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  const nights = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return 0;
    return differenceInDays(dateRange.to, dateRange.from);
  }, [dateRange]);

  const totalPrice = useMemo(() => {
    if (!selectedRoom || nights <= 0) return 0;
    return selectedRoom.price_per_night * nights;
  }, [selectedRoom, nights]);

  const isDateRangeValid = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return false;
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    return !days.some((d) => blockedDateSet.has(format(d, "yyyy-MM-dd")));
  }, [dateRange, blockedDateSet]);

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
  };

  const handleProceedToPayment = () => {
    if (!guestName || !guestEmail || !guestPhone) {
      toast.error(t("errorFillFields"));
      return;
    }
    setStep("payment");
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
      // 1. Create booking in Supabase
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
          check_in: format(dateRange.from, "yyyy-MM-dd"),
          check_out: format(dateRange.to, "yyyy-MM-dd"),
          num_guests: parseInt(numGuests),
          total_price: totalPrice,
        }),
      });

      if (!bookingRes.ok) {
        throw new Error("Failed to create booking");
      }

      const { booking } = await bookingRes.json();
      setBookingId(booking.id);

      // 2. Get the actual slip file for verification
      // If the slip came from phone (cross-device), use the session slip
      // If it's a local file, use it directly
      let slipToVerify: File;
      if (phoneSlipReceived && phoneSlipUrl) {
        // Fetch the slip from the signed URL and convert to File
        const slipRes = await fetch(phoneSlipUrl);
        const blob = await slipRes.blob();
        slipToVerify = new File([blob], "slip.jpg", { type: blob.type });
      } else {
        slipToVerify = slipFile;
      }

      // 3. Upload slip to storage via the session endpoint
      const uploadForm = new FormData();
      uploadForm.append("slip", slipToVerify);
      await fetch(`/api/slip-upload/${uploadSessionId}`, {
        method: "POST",
        body: uploadForm,
      });

      // 4. Verify slip with EasySlip
      const verifyForm = new FormData();
      verifyForm.append("file", slipToVerify);
      verifyForm.append("booking_id", booking.id);
      verifyForm.append("expected_amount", totalPrice.toString());
      verifyForm.append("expected_receiver", host.promptpay_id);

      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        body: verifyForm,
      });

      const verifyData = await verifyRes.json();
      setSlipVerified(verifyData.verified === true);

      setStep("confirmed");
      toast.success(t("successSubmitted"));
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <>
        <h2 className="text-xl font-semibold text-gray-900">{t("title")}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("subtitle")}
        </p>

        {/* Step Indicators */}
        <div className="mt-6 flex items-center gap-2 text-sm">
          {(["dates", "details", "payment", "confirmed"] as BookingStep[]).map(
            (s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className="h-px w-6"
                    style={{
                      backgroundColor:
                        step === s ||
                        (["dates", "details", "payment", "confirmed"].indexOf(step) > i - 1)
                          ? themeColor
                          : "#e5e7eb",
                    }}
                  />
                )}
                <Badge
                  variant={step === s ? "default" : "secondary"}
                  style={step === s ? { backgroundColor: themeColor } : undefined}
                >
                  {i + 1}. {t(`step${s.charAt(0).toUpperCase() + s.slice(1)}`)}
                </Badge>
              </div>
            )
          )}
        </div>

        <div className="mt-6">
          {/* Step 1: Date & Room Selection */}
          {step === "dates" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="h-5 w-5" />
                    {t("selectDates")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mounted ? (
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={handleDateSelect}
                      disabled={[{ before: new Date() }, ...disabledDays]}
                      numberOfMonths={1}
                      className="rounded-md border"
                    />
                  ) : (
                    <div className="flex h-[300px] items-center justify-center rounded-md border">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                  )}
                  {dateRange?.from && dateRange?.to && (
                    <div className="mt-3 text-sm text-gray-600">
                      <span className="font-medium">
                        {format(dateRange.from, "MMM d")} —{" "}
                        {format(dateRange.to, "MMM d, yyyy")}
                      </span>
                      <span className="text-gray-400"> · {nights} {nights > 1 ? tc("nights") : tc("night")}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("selectRoom")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("choosePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.name} — ฿{room.price_per_night.toLocaleString()}/night
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedRoom && (
                      <p className="text-sm text-gray-500">
                        {selectedRoom.description} · {tc("guests", { count: selectedRoom.max_guests })}
                      </p>
                    )}

                    <div>
                      <Label>{t("numGuests")}</Label>
                      <Select value={numGuests} onValueChange={setNumGuests}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            { length: selectedRoom?.max_guests || homestay.max_guests },
                            (_, i) => (
                              <SelectItem key={i + 1} value={String(i + 1)}>
                                {i + 1} {tc("guests")}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Price Summary */}
                {totalPrice > 0 && (
                  <Card style={{ borderColor: themeColor + '40', backgroundColor: themeColor + '0d' }}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          ฿{selectedRoom?.price_per_night.toLocaleString()} × {nights} {nights > 1 ? tc("nights") : tc("night")}
                        </span>
                        <span className="text-lg font-bold" style={{ color: themeColor }}>
                          ฿{totalPrice.toLocaleString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button
                  className="w-full hover:brightness-90"
                  size="lg"
                  style={{ backgroundColor: themeColor }}
                  onClick={handleProceedToDetails}
                  disabled={!dateRange?.from || !dateRange?.to || !selectedRoomId}
                >
                  {t("continueDetails")}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Guest Details */}
          {step === "details" && (
            <Card className="mx-auto max-w-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-5 w-5" />
                  {t("guestInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">{t("fullName")} *</Label>
                  <Input
                    id="name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder={t("fullNamePlaceholder")}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="email">{t("email")} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder={t("emailPlaceholder")}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">{t("phone")} *</Label>
                  <Input
                    id="phone"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder={t("phonePlaceholder")}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t("province")}</Label>
                  <Select value={guestProvince} onValueChange={setGuestProvince}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("provincePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {THAI_PROVINCES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {locale === "th" ? p.labelTh : p.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  <p>
                    <strong>{t("room")}:</strong> {selectedRoom?.name}
                  </p>
                  <p>
                    <strong>{t("dates")}:</strong>{" "}
                    {dateRange?.from && format(dateRange.from, "MMM d")} —{" "}
                    {dateRange?.to && format(dateRange.to, "MMM d, yyyy")}
                  </p>
                  <p>
                    <strong>{tc("guests")}:</strong> {numGuests}
                  </p>
                  <p className="mt-1 text-base font-bold" style={{ color: themeColor }}>
                    {tc("total")}: ฿{totalPrice.toLocaleString()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("dates")}
                  >
                    {tc("back")}
                  </Button>
                  <Button
                    className="flex-1 hover:brightness-90"
                    style={{ backgroundColor: themeColor }}
                    onClick={handleProceedToPayment}
                  >
                    {t("continuePayment")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Payment */}
          {step === "payment" && (
            <Card className="mx-auto max-w-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-5 w-5" />
                  {t("paymentTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Hidden file inputs (always rendered) */}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleSlipSelect(e.target.files?.[0] || null)}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleSlipSelect(e.target.files?.[0] || null)}
                />

                {/* Phase 1: QR Code + Instructions */}
                {paymentPhase === "qr" && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-gray-500">
                        {t("scanQr")}
                      </p>
                      <div className="mx-auto mt-4 flex h-52 w-52 items-center justify-center rounded-lg border bg-white p-3">
                        <QRCodeSVG
                          value={generatePayload(host.promptpay_id, { amount: totalPrice })}
                          size={180}
                          level="M"
                        />
                      </div>
                      <p className="mt-3 text-2xl font-bold" style={{ color: themeColor }}>
                        ฿{totalPrice.toLocaleString()}
                      </p>
                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {host.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {t("promptpayId")}: {host.promptpay_id}
                      </p>
                    </div>

                    <Separator />

                    {/* Step-by-step instructions */}
                    <div className="rounded-xl border bg-gray-50 p-4">
                      <div className="space-y-3">
                        {[
                          { num: 1, icon: Smartphone, text: t("payStep1") },
                          { num: 2, icon: ArrowRight, text: t("payStep2") },
                          { num: 3, icon: CreditCard, text: t("payStep3") },
                          { num: 4, icon: Upload, text: t("payStep4") },
                        ].map((s) => (
                          <div key={s.num} className="flex items-center gap-3">
                            <div
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ backgroundColor: themeColor }}
                            >
                              {s.num}
                            </div>
                            <s.icon className="h-4 w-4 shrink-0 text-gray-400" />
                            <p className="text-sm text-gray-600">{s.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setStep("details"); setPaymentPhase("qr"); }}
                      >
                        {tc("back")}
                      </Button>
                      <Button
                        className="flex-1 hover:brightness-90"
                        style={{ backgroundColor: themeColor }}
                        onClick={() => setPaymentPhase("upload")}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {t("iveTransferred")}
                      </Button>
                    </div>
                  </>
                )}

                {/* Phase 2: Upload Slip */}
                {paymentPhase === "upload" && (
                  <>
                    <div className="text-center">
                      {showWelcomeBack ? (
                        <div
                          className="mb-3 rounded-lg px-4 py-2.5 text-sm font-medium"
                          style={{ backgroundColor: themeColor + '15', color: themeColor }}
                        >
                          {t("welcomeBack")}
                        </div>
                      ) : null}
                      <Upload className="mx-auto h-10 w-10 text-gray-300" />
                      <h3 className="mt-2 text-lg font-semibold text-gray-900">
                        {t("waitingForSlip")}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {t("waitingForSlipDesc")}
                      </p>
                      <p className="mt-2 text-lg font-bold" style={{ color: themeColor }}>
                        ฿{totalPrice.toLocaleString()}
                      </p>
                    </div>

                    <div>
                      {slipPreview ? (
                        /* Preview uploaded slip */
                        <div className="rounded-lg border bg-gray-50 p-3">
                          {phoneSlipReceived && (
                            <div
                              className="mb-3 rounded-lg px-3 py-2 text-center text-sm font-medium"
                              style={{ backgroundColor: themeColor + '15', color: themeColor }}
                            >
                              <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
                              {t("slipReceived")}
                            </div>
                          )}
                          <p className="mb-2 text-center text-xs font-medium text-gray-500">
                            {t("slipPreview")}
                          </p>
                          <div className="relative mx-auto w-fit">
                            <img
                              src={slipPreview}
                              alt={t("slipPreview")}
                              className="mx-auto max-h-64 rounded-lg object-contain"
                            />
                            <button
                              type="button"
                              onClick={handleRemoveSlip}
                              className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-md hover:bg-red-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-3 flex justify-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => galleryInputRef.current?.click()}
                            >
                              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                              {t("changeSlip")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Upload zone: local upload + cross-device QR */
                        <div className="space-y-3">
                          {/* Local upload buttons */}
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => galleryInputRef.current?.click()}
                              className="flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-gray-300 p-5 text-left transition-colors active:bg-gray-50"
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = themeColor + '99'; e.currentTarget.style.backgroundColor = themeColor + '0d'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.backgroundColor = ''; }}
                            >
                              <div className="rounded-lg bg-gray-100 p-3">
                                <ImageIcon className="h-6 w-6 text-gray-500" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-700">{t("chooseFromGallery")}</p>
                                <p className="text-xs text-gray-400">{t("clickUpload")}</p>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => cameraInputRef.current?.click()}
                              className="flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-gray-300 p-5 text-left transition-colors active:bg-gray-50"
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = themeColor + '99'; e.currentTarget.style.backgroundColor = themeColor + '0d'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.backgroundColor = ''; }}
                            >
                              <div className="rounded-lg bg-gray-100 p-3">
                                <Camera className="h-6 w-6 text-gray-500" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-700">{t("takePhoto")}</p>
                                <p className="text-xs text-gray-400">{t("clickUpload")}</p>
                              </div>
                            </button>
                          </div>

                          {/* Cross-device upload: scan QR from phone */}
                          <div className="relative flex items-center gap-3 py-1">
                            <div className="flex-1 border-t border-gray-200" />
                            <span className="text-xs font-medium text-gray-400">{t("orUploadFromPhone")}</span>
                            <div className="flex-1 border-t border-gray-200" />
                          </div>

                          <div className="rounded-xl border bg-gray-50 p-4 text-center">
                            <p className="mb-3 text-xs text-gray-500">
                              {t("scanToUpload")}
                            </p>
                            <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-lg border bg-white p-2">
                              <QRCodeSVG
                                value={`${typeof window !== "undefined" ? window.location.origin : ""}/upload-slip/${uploadSessionId}`}
                                size={120}
                                level="M"
                              />
                            </div>
                            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {t("waitingForPhoneUpload")}
                            </div>
                          </div>
                        </div>
                      )}

                      <p className="mt-2 text-xs text-gray-400">
                        {t("slipVerify")}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setPaymentPhase("qr")}
                      >
                        {tc("back")}
                      </Button>
                      <Button
                        className="flex-1 hover:brightness-90"
                        style={{ backgroundColor: themeColor }}
                        onClick={handleSubmitBooking}
                        disabled={isSubmitting || !slipFile}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("verifying")}
                          </>
                        ) : (
                          t("submitBooking")
                        )}
                      </Button>
                    </div>
                  </>
                )}

              </CardContent>
            </Card>
          )}

          {/* Step 4: Confirmation */}
          {step === "confirmed" && (
            <Card className="mx-auto max-w-lg" style={{ borderColor: themeColor + '40' }}>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16" style={{ color: slipVerified ? themeColor : '#f59e0b' }} />
                <h3 className="mt-4 text-xl font-semibold text-gray-900">
                  {slipVerified ? t("confirmedTitle") : t("confirmedTitlePending")}
                </h3>
                <p className="mt-2 text-gray-600">
                  {slipVerified ? t("confirmedText") : t("confirmedTextPending")}
                </p>
                {bookingId && (
                  <Badge className="mt-4" variant="secondary" style={{ backgroundColor: themeColor + '1a', color: themeColor }}>
                    {t("bookingId")}: {bookingId}
                  </Badge>
                )}

                <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left text-sm text-gray-600">
                  <p><strong>{t("homestay")}:</strong> {homestay.name}</p>
                  <p><strong>{t("room")}:</strong> {selectedRoom?.name}</p>
                  <p>
                    <strong>{t("dates")}:</strong>{" "}
                    {dateRange?.from && format(dateRange.from, "MMM d")} —{" "}
                    {dateRange?.to && format(dateRange.to, "MMM d, yyyy")}
                  </p>
                  <p><strong>{tc("guests")}:</strong> {numGuests}</p>
                  <p><strong>{t("guestInfo")}:</strong> {guestName}</p>
                  <p className="mt-2 text-base font-bold" style={{ color: themeColor }}>
                    {tc("total")}: ฿{totalPrice.toLocaleString()}
                  </p>
                </div>

                <Button
                  className="mt-6 hover:brightness-90"
                  style={{ backgroundColor: themeColor }}
                  onClick={() => {
                    setStep("dates");
                    setPaymentPhase("qr");
                    setSlipVerified(false);
                    setDateRange(undefined);
                    setSelectedRoomId("");
                    setGuestName("");
                    setGuestEmail("");
                    setGuestPhone("");
                    setGuestProvince("");
                    handleRemoveSlip();
                    setBookingId(null);
                  }}
                >
                  {t("bookAnother")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
    </>
  );

  if (embedded) {
    return <div id="booking">{content}</div>;
  }

  return (
    <section id="booking" className="py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {content}
      </div>
    </section>
  );
}
