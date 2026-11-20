"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTranslations, useLocale } from "next-intl";
import { differenceInDays } from "date-fns";
import { fmtDateStr } from "@/lib/format-date";
import { getProvinceLabel } from "@/lib/provinces";
import {
  CalendarDays,
  Users,
  BedDouble,
  Phone,
  LogOut,
  Mail,
  MapPin,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  StickyNote,
  ListPlus,
  Paperclip,
  Banknote,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { countAttachmentsByBooking } from "@/lib/booking-attachments";
import { hostErrorKey } from "@/lib/host-error";
import { ErrorView } from "@/components/error-view";

interface SelectedOption {
  id: string;
  name: string;
  price: number;
}

interface CheckinBooking {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  guest_province: string | null;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number;
  amount_paid: number;
  payment_type: string;
  status: string;
  checked_in_at: string | null;
  notes: string | null;
  selected_options: SelectedOption[] | null;
  room_name: string;
  /** Computed, not selected — the column list above is deliberately explicit. */
  attachment_count: number;
}

export default function CheckinsPage() {
  const t = useTranslations("checkins");
  const th = useTranslations("hostErrors");
  const te = useTranslations("errorPage");
  const locale = useLocale();
  // The page works on this device's date (the queries below); say which day it is.
  const now = new Date();
  const todayLabel = fmtDateStr(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    "EEEE d MMMM yyyy",
    locale,
  );
  const [bookings, setBookings] = useState<CheckinBooking[]>([]);
  // A failed read must not read as "nobody arrives today".
  const [loadError, setLoadError] = useState(false);
  // Today's departures: the home page's "check-outs today" tile lands on #checkouts.
  const [departures, setDepartures] = useState<{ id: string; guest_name: string; guest_phone: string; room_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  // Two taps: money recorded here has no undo.
  const [confirmingCashId, setConfirmingCashId] = useState<string | null>(null);
  const [recordingCashId, setRecordingCashId] = useState<string | null>(null);

  // The guest pays the rest in cash on arrival; only the host can record it.
  const handleRecordCash = async (bookingId: string) => {
    setRecordingCashId(bookingId);
    try {
      const res = await fetch("/api/bookings/host-cash-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const key = hostErrorKey(data);
        toast.error(key ? th(key) : t("recordCashError"));
        return;
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, amount_paid: data.amount_paid, payment_type: "full" } : b))
      );
      setConfirmingCashId(null);
      toast.success(t("recordCashSuccess"));
    } catch {
      toast.error(t("recordCashError"));
    } finally {
      setRecordingCashId(null);
    }
  };

  const handleCheckIn = async (bookingId: string) => {
    setCheckingInId(bookingId);
    try {
      const res = await fetch("/api/bookings/host-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const key = hostErrorKey(data);
        toast.error(key ? th(key) : t("checkInError"));
        return;
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, checked_in_at: data.checked_in_at } : b))
      );
      toast.success(t("checkInSuccess"));
    } catch {
      toast.error(t("checkInError"));
    } finally {
      setCheckingInId(null);
    }
  };

  useEffect(() => {
    const fetchCheckins = async () => {
      const supabase = createClient();
      // No user_id filter: RLS shows a login only its own host, or the one it is staff of (081),
      // so the host read need not wait for getUser().
      // PGRST116 is "no row": a new account, not a failed read.
      const failed = (e: { code?: string } | null) => !!e && e.code !== "PGRST116";
      const giveUp = () => { setLoadError(true); setLoading(false); };
      const [{ data: { user } }, { data: hostRow, error: hostError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("hosts").select("id").single(),
      ]);
      if (!user) { setLoading(false); return; }
      if (failed(hostError)) return giveUp();
      if (!hostRow) { setLoading(false); return; }

      const { data: homestayRows, error: homestayError } = await supabase
        .from("homestays")
        .select("id")
        .eq("host_id", (hostRow as { id: string }).id);
      if (failed(homestayError)) return giveUp();
      const homestayIds = ((homestayRows as { id: string }[]) || []).map((h) => h.id);
      if (homestayIds.length === 0) { setLoading(false); return; }

      // Today in local timezone (YYYY-MM-DD)
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const [{ data: bookingRows, error: bookingError }, { data: departureRows, error: departureError }, { data: roomRows }] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, guest_name, guest_email, guest_phone, guest_province, check_in, check_out, num_guests, total_price, amount_paid, payment_type, status, checked_in_at, selected_options, notes, room_id")
          .in("homestay_id", homestayIds)
          .eq("check_in", todayStr)
          .in("status", ["confirmed", "completed"])
          .order("guest_name", { ascending: true }),
        // Same rule as the home page's tile (lib/today-work): confirmed, leaving today.
        supabase
          .from("bookings")
          .select("id, guest_name, guest_phone, room_id")
          .in("homestay_id", homestayIds)
          .eq("check_out", todayStr)
          .eq("status", "confirmed")
          .order("guest_name", { ascending: true }),
        supabase
          .from("rooms")
          .select("id, name")
          .in("homestay_id", homestayIds),
      ]);

      if (bookingError || departureError) return giveUp();

      const roomMap = Object.fromEntries(
        ((roomRows as { id: string; name: string }[]) || []).map((r) => [r.id, r.name])
      );

      const rows = ((bookingRows as (CheckinBooking & { room_id: string | null })[]) || []).map((b) => ({
        ...b,
        room_name: b.room_id ? roomMap[b.room_id] || "-" : "-",
      }));

      // Counts only, in one query. This is the surface where forgetting an
      // agreed request actually costs something: the guest is at the door.
      const { data: attachmentRows } = rows.length > 0
        ? await supabase
            .from("booking_attachments")
            .select("booking_id")
            .in("booking_id", rows.map((b) => b.id))
        : { data: null };
      const counts = countAttachmentsByBooking(attachmentRows as { booking_id: string }[] | null);

      setBookings(rows.map((b) => ({ ...b, attachment_count: counts[b.id] ?? 0 })));
      setDepartures(
        ((departureRows as { id: string; guest_name: string; guest_phone: string; room_id: string | null }[]) || []).map((d) => ({
          ...d,
          room_name: d.room_id ? roomMap[d.room_id] || "-" : "-",
        })),
      );
      setLoading(false);
    };

    fetchCheckins();
  }, []);

  // #checkouts (the home tile) points at a section that only exists after loading.
  useEffect(() => {
    if (!loading && window.location.hash === "#checkouts") {
      document.getElementById("checkouts")?.scrollIntoView({ block: "start" });
    }
  }, [loading]);

  if (loadError) {
    return (
      <ErrorView
        title={te("title")}
        description={te("description")}
        retryLabel={te("retry")}
        onRetry={() => window.location.reload()}
        backHref="/dashboard"
        backLabel={te("dashboard")}
      />
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-earth-900 flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-brand" />
          {t("title")}
        </h1>
        {/* After loading only: the server renders in UTC, this device may already be on tomorrow. */}
        <p className="text-sm text-earth-600 mt-1">{t("subtitle")}{!loading && ` · ${todayLabel}`}</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-60" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-earth-500 mb-3" />
            <p className="text-earth-600">{t("noCheckins")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const nights = differenceInDays(new Date(booking.check_out), new Date(booking.check_in));
            const hasBalance = booking.amount_paid < booking.total_price;
            const isCheckedIn = !!booking.checked_in_at;
            const options = Array.isArray(booking.selected_options) ? booking.selected_options : [];

            return (
              <Card key={booking.id} className="overflow-hidden py-0 gap-0">
                <CardContent className="p-0">
                  {/* Status bar */}
                  <div className={`h-1 ${isCheckedIn ? "bg-brand" : "bg-amber-400"}`} />

                  <div className="p-4 space-y-3">
                    {/* Header: name + status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-earth-900 text-base truncate">
                          {booking.guest_name}
                        </h2>
                        <p className="text-xs text-earth-600 mt-0.5">
                          ID: {booking.id.slice(0, 8)}
                        </p>
                        {booking.attachment_count > 0 && (
                          <Link
                            href={`/dashboard/bookings?booking=${booking.id}`}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-earth-100 px-2 py-0.5 text-xs font-medium text-earth-800 transition-colors pointer-fine:hover:bg-earth-200"
                          >
                            <Paperclip className="h-3 w-3" />
                            {t("attachments")} ({booking.attachment_count})
                          </Link>
                        )}
                      </div>
                      {isCheckedIn ? (
                        <Badge variant="secondary" className="bg-brand-50 text-brand shrink-0">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {t("checkedIn")}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleCheckIn(booking.id)}
                          disabled={checkingInId === booking.id}
                          className="shrink-0 h-11 sm:h-9 bg-brand hover:bg-brand/90 text-white"
                        >
                          {checkingInId === booking.id ? (
                            <>
                              <Clock className="mr-1 h-3.5 w-3.5 animate-pulse" />
                              {t("checkingIn")}
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              {t("checkInNow")}
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div className="flex items-center gap-2 text-earth-700">
                        <BedDouble className="h-3.5 w-3.5 text-earth-600 shrink-0" />
                        <span>{t("room")}: <span className="font-medium text-earth-900">{booking.room_name}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-earth-700">
                        <Users className="h-3.5 w-3.5 text-earth-600 shrink-0" />
                        <span>{t("guests")}: <span className="font-medium text-earth-900">{booking.num_guests}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-earth-700">
                        <CalendarDays className="h-3.5 w-3.5 text-earth-600 shrink-0" />
                        <span>
                          {fmtDateStr(booking.check_in, "d MMM yyyy", locale)} → {fmtDateStr(booking.check_out, "d MMM yyyy", locale)}
                          <span className="text-earth-600 ml-1">({nights} {t("nights")})</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-earth-700">
                        <span className="font-medium text-brand">฿{booking.total_price.toLocaleString()}</span>
                        {hasBalance ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                            {t("balanceDue", { amount: (booking.total_price - booking.amount_paid).toLocaleString() })}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-brand-50 text-brand text-xs">
                            {t("fullPaid")}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Cash for the balance, recorded by the host (the guest's own "paid in cash" is gone). */}
                    {hasBalance && (
                      <div className="flex flex-wrap items-center gap-2">
                        {confirmingCashId === booking.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleRecordCash(booking.id)}
                              disabled={recordingCashId === booking.id}
                              className="h-11 sm:h-9 bg-brand hover:bg-brand/90 text-white"
                            >
                              <Banknote className="mr-1 h-3.5 w-3.5" />
                              {t("recordCashConfirm", { amount: (booking.total_price - booking.amount_paid).toLocaleString() })}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmingCashId(null)}
                              disabled={recordingCashId === booking.id}
                              className="h-11 sm:h-9"
                            >
                              {t("recordCashCancel")}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmingCashId(booking.id)}
                            className="h-11 sm:h-9 border-earth-500 text-earth-800"
                          >
                            <Banknote className="mr-1 h-3.5 w-3.5" />
                            {t("recordCash")}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Room Options */}
                    {options.length > 0 && (
                      <div className="flex items-start gap-2 rounded-lg bg-brand-50/50 p-2.5 text-xs text-earth-700">
                        <ListPlus className="h-3.5 w-3.5 text-brand shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium text-earth-800">{t("options")}:</span>{" "}
                          {options.map((o, i) => (
                            <span key={o.id}>
                              {o.name} <span className="text-brand font-medium">(+฿{o.price.toLocaleString()})</span>
                              {i < options.length - 1 && ", "}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contact + province */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-earth-600">
                      <a href={`tel:${booking.guest_phone}`} className="flex min-h-6 items-center gap-1 underline-offset-4 hover:underline">
                        <Phone className="h-3 w-3" />
                        {booking.guest_phone}
                      </a>
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {booking.guest_email}
                      </span>
                      {booking.guest_province && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {getProvinceLabel(booking.guest_province, locale)}
                        </span>
                      )}
                    </div>

                    {/* Notes */}
                    {booking.notes && (
                      <div className="flex items-start gap-2 rounded-lg bg-earth-50 p-2.5 text-xs text-earth-700">
                        <StickyNote className="h-3.5 w-3.5 text-earth-600 shrink-0 mt-0.5" />
                        <span>{booking.notes}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && (
        <section id="checkouts" aria-labelledby="checkouts-title" className="mt-8 scroll-mt-20">
          <h2 id="checkouts-title" className="mb-3 flex items-center gap-2 text-base font-semibold text-earth-900">
            <LogOut className="h-4 w-4 text-earth-600" aria-hidden />
            {t("checkOutsToday")} ({departures.length})
          </h2>
          {departures.length === 0 ? (
            <p className="text-sm text-earth-600">{t("noCheckouts")}</p>
          ) : (
            <ul className="divide-y divide-earth-100 rounded-xl border border-earth-200 bg-white">
              {departures.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/bookings?booking=${d.id}`}
                      className="font-medium text-earth-900 underline-offset-4 hover:underline"
                    >
                      {d.guest_name}
                    </Link>
                    <p className="text-xs text-earth-600">{t("room")}: {d.room_name}</p>
                  </div>
                  <a href={`tel:${d.guest_phone}`} className="flex min-h-11 items-center gap-1 text-sm text-earth-700 underline-offset-4 hover:underline">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {d.guest_phone}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
