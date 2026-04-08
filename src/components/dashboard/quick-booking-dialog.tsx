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
      setBookingSource("");
      setNotes("");
    }
  }, [open, rooms, defaultCheckIn, defaultCheckOut]);

  const nights =
    checkIn && checkOut
      ? Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

  const canSubmit =
    guestName.trim() &&
    guestPhone.trim() &&
    roomId &&
    checkIn &&
    checkOut &&
    nights > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !checkIn || !checkOut) return;
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
          {/* Guest Name */}
          <div className="space-y-1.5">
            <Label htmlFor="qb-name">{t("guestNameLabel")}</Label>
            <Input
              id="qb-name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder={t("guestNamePlaceholder")}
            />
          </div>

          {/* Phone + Email row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qb-phone">{t("guestPhoneLabel")}</Label>
              <Input
                id="qb-phone"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder={t("guestPhonePlaceholder")}
              />
            </div>
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

          {/* Room + Source row */}
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

          {/* Guests + Total Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qb-guests">{t("numGuestsLabel")} ({locale === "th" ? "ไม่บังคับ" : "optional"})</Label>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400 shrink-0" />
                <Input
                  id="qb-guests"
                  type="number"
                  min={1}
                  value={numGuests}
                  onChange={(e) => setNumGuests(e.target.value)}
                  placeholder="2"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-price">{t("totalPriceLabel")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">฿</span>
                <Input
                  id="qb-price"
                  type="number"
                  min={0}
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  placeholder={t("totalPricePlaceholder")}
                  className="pl-7"
                />
              </div>
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
