"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { format, startOfToday, addMonths } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import { fmtDate } from "@/lib/format-date";
import {
  CalendarIcon,
  Loader2,
  Zap,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { isValidEmail, isValidPhone, sanitizePhoneInput } from "@/lib/utils";

interface Room {
  id: string;
  name: string;
  price_per_night: number;
  max_guests: number;
}

interface QuickBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  homestayId: string;
  rooms: Room[];
  onSuccess?: () => void;
  defaultCheckIn?: Date;
  defaultCheckOut?: Date;
}

const BOOKING_SOURCES = [
  { value: "booking_com", labelKey: "sourceBookingCom" },
  { value: "agoda", labelKey: "sourceAgoda" },
  { value: "airbnb", labelKey: "sourceAirbnb" },
  { value: "trip_com", labelKey: "sourceTripCom" },
  { value: "walk_in", labelKey: "sourceWalkIn" },
  { value: "phone", labelKey: "sourcePhone" },
  { value: "other", labelKey: "sourceOther" },
] as const;

export function QuickBookingDialog({
  open,
  onOpenChange,
  homestayId,
  rooms,
  onSuccess,
  defaultCheckIn,
  defaultCheckOut,
}: QuickBookingDialogProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();


  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [roomId, setRoomId] = useState("");
  const [checkIn, setCheckIn] = useState<Date | undefined>(defaultCheckIn);
  const [checkOut, setCheckOut] = useState<Date | undefined>(defaultCheckOut);
  const [numGuests, setNumGuests] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [bookingSource, setBookingSource] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setGuestName("");
      setGuestPhone("");
      setGuestEmail("");
      setRoomId(rooms.length === 1 ? rooms[0].id : "");
      setCheckIn(defaultCheckIn);
      setCheckOut(defaultCheckOut);
      setNumGuests("");
      setTotalPrice("");
      setAmountPaid("");
      setPaidTouched(false);
      setBookingSource("");
      setNotes("");
    }
  }, [open, rooms, defaultCheckIn, defaultCheckOut]);

  const nights =
    checkIn && checkOut
      ? Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

  const agreedNum = totalPrice ? parseInt(totalPrice, 10) || 0 : 0;
  const paidNum = amountPaid ? parseInt(amountPaid, 10) || 0 : 0;
  const balance = Math.max(0, agreedNum - paidNum);
  const paidOver = paidNum > agreedNum;

  // The paid field mirrors the agreed price until the host edits it, so an OTA
  // booking where only a total is entered still records as fully paid.
  const handleAgreedChange = (v: string) => {
    setTotalPrice(v);
    if (!v || parseInt(v, 10) <= 0) {
      // Clearing the agreed price disables the paid input, so drop any stale
      // amount with it — otherwise a leftover value would block submit with no
      // editable field to correct it.
      setAmountPaid("");
      setPaidTouched(false);
    } else if (!paidTouched) {
      setAmountPaid(v);
    }
  };
  const handlePaidChange = (v: string) => {
    setPaidTouched(true);
    setAmountPaid(v);
  };

  const canSubmit =
    guestName.trim() &&
    guestPhone.trim() &&
    roomId &&
    checkIn &&
    checkOut &&
    nights > 0 &&
    !paidOver;

  const handleSubmit = async () => {
    if (!canSubmit || !checkIn || !checkOut) return;
    if (!isValidPhone(guestPhone)) {
      toast.error(t("errorInvalidPhone"));
      return;
    }
    if (guestEmail.trim() && !isValidEmail(guestEmail)) {
      toast.error(t("errorInvalidEmail"));
      return;
    }
    if (paidOver) {
      toast.error(t("errorPaidExceedsAgreed"));
      return;
    }
    setSaving(true);

    try {
      const res = await fetch("/api/bookings/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homestay_id: homestayId,
          room_id: roomId,
          guest_name: guestName.trim(),
          guest_email: guestEmail.trim() || undefined,
          guest_phone: guestPhone.trim(),
          check_in: format(checkIn, "yyyy-MM-dd"),
          check_out: format(checkOut, "yyyy-MM-dd"),
          num_guests: numGuests ? parseInt(numGuests, 10) : 2,
          total_price: totalPrice ? parseInt(totalPrice, 10) : 0,
          amount_paid: amountPaid ? parseInt(amountPaid, 10) : 0,
          booking_source: bookingSource || "other",
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.error === "DATES_UNAVAILABLE") {
          toast.error(t("datesUnavailable"));
        } else if (err.error === "DATES_BLOCKED") {
          toast.error(t("datesBlocked"));
        } else if (err.error === "DATES_HELD") {
          toast.error(t("datesHeld"));
        } else {
          toast.error(t("quickBookingError"));
        }
        setSaving(false);
        return;
      }

      toast.success(t("quickBookingSuccess"));
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error(t("quickBookingError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand" />
            {t("quickBooking")}
          </DialogTitle>
          <DialogDescription>{t("quickBookingDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Name + Phone row — the two required identity fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qb-name">{t("guestNameLabel")}</Label>
              <Input
                id="qb-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder={t("guestNamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-phone">{t("guestPhoneLabel")}</Label>
              <Input
                id="qb-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={guestPhone}
                onChange={(e) => setGuestPhone(sanitizePhoneInput(e.target.value))}
                placeholder={t("guestPhonePlaceholder")}
              />
            </div>
          </div>

          {/* Email + Platform row — both optional metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qb-email">{t("guestEmailLabel")}</Label>
              <Input
                id="qb-email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder={t("guestEmailPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("bookingSourceLabel")}</Label>
              <Select value={bookingSource} onValueChange={setBookingSource}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("bookingSourcePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_SOURCES.map((src) => (
                    <SelectItem key={src.value} value={src.value}>
                      {t(src.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Check-in / Check-out */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("checkInLabel")}</Label>
              <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-gray-400" />
                    {checkIn ? fmtDate(checkIn, "d MMM yyyy", locale) : <span className="text-gray-400">—</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={checkIn}
                    onSelect={(d) => {
                      setCheckIn(d);
                      setCheckInOpen(false);
                      if (d && checkOut && d >= checkOut) {
                        setCheckOut(undefined);
                      }
                    }}
                    locale={locale === "th" ? thLocale : undefined}
                    captionLayout="dropdown"
                    startMonth={startOfToday()}
                    endMonth={addMonths(startOfToday(), 24)}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>{t("checkOutLabel")}</Label>
              <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-gray-400" />
                    {checkOut ? fmtDate(checkOut, "d MMM yyyy", locale) : <span className="text-gray-400">—</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={checkOut}
                    onSelect={(d) => {
                      setCheckOut(d);
                      setCheckOutOpen(false);
                    }}
                    locale={locale === "th" ? thLocale : undefined}
                    captionLayout="dropdown"
                    startMonth={startOfToday()}
                    endMonth={addMonths(startOfToday(), 24)}
                    disabled={(date) =>
                      checkIn ? date <= checkIn : date <= new Date(new Date().setHours(0, 0, 0, 0))
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {nights > 0 && (
            <p className="text-xs text-brand font-medium -mt-2">
              {t("nightsCount", { count: nights })}
            </p>
          )}

          {/* House + Guests row — which unit, and how many people in it */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("selectRoomLabel")}</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectRoomPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} — ฿{r.price_per_night.toLocaleString()}/{locale === "th" ? "คืน" : "night"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-guests">{t("numGuestsLabel")} ({locale === "th" ? "ไม่บังคับ" : "optional"})</Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  id="qb-guests"
                  type="number"
                  min={1}
                  value={numGuests}
                  onChange={(e) => setNumGuests(e.target.value)}
                  placeholder="2"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Agreed Price + Amount Paid row — the balance rides under the paid field */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qb-agreed">{t("agreedPriceLabel")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">฿</span>
                <Input
                  id="qb-agreed"
                  type="number"
                  min={0}
                  value={totalPrice}
                  onChange={(e) => handleAgreedChange(e.target.value)}
                  placeholder={t("totalPricePlaceholder")}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-paid">{t("amountPaidInputLabel")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">฿</span>
                <Input
                  id="qb-paid"
                  type="number"
                  min={0}
                  value={amountPaid}
                  onChange={(e) => handlePaidChange(e.target.value)}
                  placeholder={t("totalPricePlaceholder")}
                  disabled={agreedNum <= 0}
                  aria-invalid={paidOver}
                  aria-describedby="qb-paid-hint"
                  className={`pl-7 ${paidOver ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
              </div>
              {/* Error takes the slot when invalid, otherwise the live balance */}
              {paidOver ? (
                <p id="qb-paid-hint" className="text-xs font-medium text-red-600">
                  {t("errorPaidExceedsAgreed")}
                </p>
              ) : agreedNum > 0 ? (
                <p
                  id="qb-paid-hint"
                  className={`text-xs font-medium ${balance > 0 ? "text-amber-600" : "text-brand"}`}
                >
                  {balance > 0
                    ? t("balanceDue", { amount: balance.toLocaleString() })
                    : t("paymentFull")}
                </p>
              ) : null}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="qb-notes">{t("notesLabel")}</Label>
            <Textarea
              id="qb-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={2}
            />
          </div>

          {/* Submit */}
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("creating")}
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                {t("createBooking")}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
