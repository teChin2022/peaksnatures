"use client";

import { useState, useEffect } from "react";
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
  Mail,
  MapPin,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  StickyNote,
  ListPlus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
}

export default function CheckinsPage() {
  const t = useTranslations("checkins");
  const locale = useLocale();
  const [bookings, setBookings] = useState<CheckinBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCheckins = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: hostRow } = await supabase
        .from("hosts")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!hostRow) { setLoading(false); return; }

      const { data: homestayRows } = await supabase
        .from("homestays")
        .select("id")
        .eq("host_id", (hostRow as { id: string }).id);
      const homestayIds = ((homestayRows as { id: string }[]) || []).map((h) => h.id);
      if (homestayIds.length === 0) { setLoading(false); return; }

      // Today in local timezone (YYYY-MM-DD)
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const [{ data: bookingRows }, { data: roomRows }] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, guest_name, guest_email, guest_phone, guest_province, check_in, check_out, num_guests, total_price, amount_paid, payment_type, status, checked_in_at, selected_options, notes, room_id")
          .in("homestay_id", homestayIds)
          .eq("check_in", todayStr)
          .in("status", ["confirmed", "completed"])
          .order("guest_name", { ascending: true }),
        supabase
          .from("rooms")
          .select("id, name")
          .in("homestay_id", homestayIds),
      ]);

      const roomMap = Object.fromEntries(
        ((roomRows as { id: string; name: string }[]) || []).map((r) => [r.id, r.name])
      );

      const rows = ((bookingRows as (CheckinBooking & { room_id: string | null })[]) || []).map((b) => ({
        ...b,
        room_name: b.room_id ? roomMap[b.room_id] || "-" : "-",
      }));

      setBookings(rows);
      setLoading(false);
    };

    fetchCheckins();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-brand" />
          {t("title")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
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
            <ClipboardCheck className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500">{t("noCheckins")}</p>
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
              <Card key={booking.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Status bar */}
                  <div className={`h-1 ${isCheckedIn ? "bg-brand" : "bg-amber-400"}`} />

                  <div className="p-4 space-y-3">
                    {/* Header: name + status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-base truncate">
                          {booking.guest_name}
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          ID: {booking.id.slice(0, 8)}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={isCheckedIn
                          ? "bg-brand-50 text-brand shrink-0"
                          : "bg-amber-100 text-amber-700 shrink-0"
                        }
                      >
                        {isCheckedIn ? (
                          <><CheckCircle2 className="mr-1 h-3 w-3" />{t("checkedIn")}</>
                        ) : (
                          <><Clock className="mr-1 h-3 w-3" />{t("notCheckedIn")}</>
                        )}
                      </Badge>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <BedDouble className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span>{t("room")}: <span className="font-medium text-gray-900">{booking.room_name}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Users className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span>{t("guests")}: <span className="font-medium text-gray-900">{booking.num_guests}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <CalendarDays className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span>
                          {fmtDateStr(booking.check_in, "d MMM yyyy", locale)} → {fmtDateStr(booking.check_out, "d MMM yyyy", locale)}
                          <span className="text-gray-400 ml-1">({nights} {t("nights")})</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
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

                    {/* Room Options */}
                    {options.length > 0 && (
                      <div className="flex items-start gap-2 rounded-lg bg-brand-50/50 p-2.5 text-xs text-gray-600">
                        <ListPlus className="h-3.5 w-3.5 text-brand shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium text-gray-700">{t("options")}:</span>{" "}
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
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {booking.guest_phone}
                      </span>
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
                      <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600">
                        <StickyNote className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
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
    </div>
  );
}
