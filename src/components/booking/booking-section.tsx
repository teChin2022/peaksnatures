"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
import { CalendarDays, Users, CreditCard, Upload, CheckCircle2, Loader2, Camera, ImageIcon, X } from "lucide-react";
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
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };
  const [bookingId, setBookingId] = useState<string | null>(null);

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

  const handleSubmitBooking = async () => {
    if (!slipFile) {
      toast.error(t("errorUploadSlip"));
      return;
    }

    setIsSubmitting(true);

    try {
      // Simulate booking creation & slip verification
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // In production: POST to /api/bookings with form data
      // Then POST slip to /api/verify-slip
      const fakeBookingId = `BK-${format(new Date(), "yyyyMMdd")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      setBookingId(fakeBookingId);
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

                <div>
                  <Label>{t("uploadSlip")} *</Label>

                  {/* Hidden file inputs */}
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

                  {slipPreview ? (
                    /* Preview uploaded slip */
                    <div className="mt-2 rounded-lg border bg-gray-50 p-3">
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
                    /* Upload zone */
                    <div className="mt-2 space-y-2">
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
                  )}

                  <p className="mt-2 text-xs text-gray-400">
                    {t("slipVerify")}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("details")}
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
              </CardContent>
            </Card>
          )}

          {/* Step 4: Confirmation */}
          {step === "confirmed" && (
            <Card className="mx-auto max-w-lg" style={{ borderColor: themeColor + '40' }}>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16" style={{ color: themeColor }} />
                <h3 className="mt-4 text-xl font-semibold text-gray-900">
                  {t("confirmedTitle")}
                </h3>
                <p className="mt-2 text-gray-600">
                  {t("confirmedText")}
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
