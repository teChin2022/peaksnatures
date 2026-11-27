"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { format, parseISO, startOfToday, addMonths } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import { CalendarIcon, Info, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format-date";
import { hostErrorKey } from "@/lib/host-error";

export interface ChangeQuickBookingTarget {
  id: string;
  room_id: string | null;
  check_in: string;
  check_out: string;
  total_price: number;
  amount_paid: number;
}

interface ChangeQuickBookingDialogProps {
  /** Mount one per booking (key by id): the form starts from the booking. */
  booking: ChangeQuickBookingTarget;
  /** The houses of the booking's own homestay. */
  rooms: { id: string; name: string; price_per_night: number }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const DATE_ERRORS: Record<string, string> = {
  DATES_UNAVAILABLE: "datesUnavailable",
  DATES_BLOCKED: "datesBlocked",
  DATES_HELD: "datesHeld",
  PENDING_EXISTS: "changeBookingPendingExists",
};

/**
 * The host moves a booking they entered (จองด่วน) to another house or dates
 * and sets the agreed price. The guest is not told; the host does that.
 */
export function ChangeQuickBookingDialog({
  booking,
  rooms,
  open,
  onOpenChange,
  onSuccess,
}: ChangeQuickBookingDialogProps) {
  const t = useTranslations("dashboard");
  const th = useTranslations("hostErrors");
  const locale = useLocale();

  const [roomId, setRoomId] = useState(booking.room_id ?? "");
  const [checkIn, setCheckIn] = useState<Date | undefined>(parseISO(booking.check_in));
  const [checkOut, setCheckOut] = useState<Date | undefined>(parseISO(booking.check_out));
  const [price, setPrice] = useState(String(booking.total_price));
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const nights =
    checkIn && checkOut
      ? Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
  const newCheckIn = checkIn ? format(checkIn, "yyyy-MM-dd") : "";
  const newCheckOut = checkOut ? format(checkOut, "yyyy-MM-dd") : "";
  const changed =
    roomId !== booking.room_id || newCheckIn !== booking.check_in || newCheckOut !== booking.check_out;
  const priceNum = parseInt(price, 10);
  const priceValid = price !== "" && Number.isInteger(priceNum) && priceNum >= 0;
  const balance = priceValid ? Math.max(0, priceNum - booking.amount_paid) : 0;
  const canSubmit = Boolean(roomId && nights > 0 && changed && priceValid);

  const today = new Date(new Date().setHours(0, 0, 0, 0));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/bookings/change-dates/host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: booking.id,
          new_room_id: roomId,
          new_check_in: newCheckIn,
          new_check_out: newCheckOut,
          total_price: priceNum,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const dateKey = typeof data?.error === "string" ? DATE_ERRORS[data.error] : undefined;
        const hostKey = hostErrorKey(data);
        toast.error(
          dateKey
            ? t(dateKey as Parameters<typeof t>[0])
            : hostKey
              ? th(hostKey)
              : t("changeBookingFailed"),
        );
        return;
      }
      toast.success(t("changeBookingSuccess"));
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error(t("changeBookingFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("changeBookingTitle")}</DialogTitle>
          <DialogDescription>{t("changeBookingDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="cb-room">{t("selectRoomLabel")}</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger id="cb-room" className="w-full">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cb-checkin">{t("checkInLabel")}</Label>
              <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                <PopoverTrigger asChild>
                  <Button id="cb-checkin" variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4 text-earth-600" />
                    {checkIn ? fmtDate(checkIn, "d MMM yyyy", locale) : <span className="text-earth-600">—</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={checkIn}
                    defaultMonth={checkIn}
                    onSelect={(d) => {
                      setCheckIn(d);
                      setCheckInOpen(false);
                      if (d && checkOut && d >= checkOut) setCheckOut(undefined);
                    }}
                    locale={locale === "th" ? thLocale : undefined}
                    captionLayout="dropdown"
                    startMonth={startOfToday()}
                    endMonth={addMonths(startOfToday(), 24)}
                    disabled={(date) => date < today}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cb-checkout">{t("checkOutLabel")}</Label>
              <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                <PopoverTrigger asChild>
                  <Button id="cb-checkout" variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4 text-earth-600" />
                    {checkOut ? fmtDate(checkOut, "d MMM yyyy", locale) : <span className="text-earth-600">—</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={checkOut}
                    defaultMonth={checkOut ?? checkIn}
                    onSelect={(d) => {
                      setCheckOut(d);
                      setCheckOutOpen(false);
                    }}
                    locale={locale === "th" ? thLocale : undefined}
                    captionLayout="dropdown"
                    startMonth={startOfToday()}
                    endMonth={addMonths(startOfToday(), 24)}
                    disabled={(date) => (checkIn ? date <= checkIn : date <= today)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {nights > 0 && (
            <p className="text-xs text-brand font-medium -mt-2">{t("nightsCount", { count: nights })}</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cb-price">{t("changeBookingPriceLabel")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-earth-600 text-sm pointer-events-none">฿</span>
              <Input
                id="cb-price"
                type="number"
                inputMode="numeric"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-describedby="cb-price-hint"
                className="pl-7"
              />
            </div>
            <p id="cb-price-hint" className="text-xs text-earth-700">
              {t("amountPaid")} ฿{booking.amount_paid.toLocaleString()}
              {priceValid && (
                <>
                  {" · "}
                  <span className={`font-medium ${balance > 0 ? "text-amber-800" : "text-brand"}`}>
                    {balance > 0 ? t("balanceDue", { amount: balance.toLocaleString() }) : t("paymentFull")}
                  </span>
                </>
              )}
            </p>
          </div>

          <p role="note" className="flex items-start gap-2 rounded-xl bg-earth-100 p-3 text-sm text-earth-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-earth-600" aria-hidden="true" />
            {t("changeBookingGuestNote")}
          </p>

          <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("changeBookingSave")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
