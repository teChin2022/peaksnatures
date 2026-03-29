"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Search, Loader2, CalendarDays, Users, CheckCircle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReviewFormInline } from "@/components/reviews/review-form-inline";
import { fmtDateStr } from "@/lib/format-date";

interface EligibleBooking {
  id: string;
  guest_name: string;
  guest_email: string;
  room_name: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number;
  created_at: string;
}

interface ReviewSubmissionProps {
  homestayId: string;
  homestayName: string;
  homestaySlug: string;
}

export function ReviewSubmission({ homestayId, homestayName, homestaySlug }: ReviewSubmissionProps) {
  const t = useTranslations("reviewsPage");
  const locale = useLocale();

  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<EligibleBooking[] | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<EligibleBooking | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleLookup = useCallback(async () => {
    if (!identifier.trim() || loading) return;
    setLoading(true);
    setBookings(null);
    setSelectedBooking(null);

    try {
      const res = await fetch("/api/reviews/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homestay_id: homestayId, identifier: identifier.trim() }),
      });
      const data = await res.json();
      setBookings(data.bookings || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [identifier, homestayId, loading]);

  const handleSuccess = useCallback(() => {
    setSubmitted(true);
  }, []);

  const handleWriteAnother = useCallback(() => {
    setSubmitted(false);
    setSelectedBooking(null);
    setBookings(null);
    setIdentifier("");
  }, []);

  // Success state
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2F5D50]/10">
          <CheckCircle className="h-8 w-8 text-[#2F5D50]" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-gray-900">{t("thankYou")}</h2>
        <p className="mt-2 max-w-sm text-sm text-gray-500">{t("reviewSubmittedDesc")}</p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={handleWriteAnother}>
            {t("writeAnother")}
          </Button>
          <Link href={`/${homestaySlug}`}>
            <Button className="bg-[#2F5D50] text-white hover:bg-[#264A40]">
              {t("backToHomestayBtn", { name: homestayName })}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Review form (booking selected)
  if (selectedBooking) {
    return (
      <div className="space-y-4">
        {/* Selected booking summary */}
        <div className="flex items-center justify-between rounded-xl border border-[#2F5D50]/20 bg-[#2F5D50]/5 p-4">
          <div>
            <p className="text-sm font-medium text-gray-900">{selectedBooking.guest_name}</p>
            <p className="text-xs text-gray-500">
              {selectedBooking.room_name} · {fmtDateStr(selectedBooking.check_in, "d MMM yyyy", locale)} — {fmtDateStr(selectedBooking.check_out, "d MMM yyyy", locale)}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedBooking(null)}>
            {t("changeBooking")}
          </Button>
        </div>

        {/* Review form */}
        <ReviewFormInline
          bookingId={selectedBooking.id}
          guestEmail={selectedBooking.guest_email}
          homestayId={homestayId}
          onSuccess={handleSuccess}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lookup form */}
      <div className="mx-auto max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("identifierLabel")}</Label>
          <div className="flex gap-2">
            <Input
              placeholder={t("identifierPlaceholder")}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            />
            <Button
              onClick={handleLookup}
              disabled={!identifier.trim() || loading}
              className="bg-[#2F5D50] text-white hover:bg-[#264A40] shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      {bookings !== null && bookings.length === 0 && (
        <div className="mx-auto max-w-md rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
          <p className="text-sm text-gray-600">{t("noEligibleBookings")}</p>
          <p className="mt-1 text-xs text-gray-400">{t("noBookingsHint")}</p>
        </div>
      )}

      {bookings !== null && bookings.length > 0 && (
        <div className="mx-auto max-w-md space-y-3">
          <p className="text-sm font-medium text-gray-700">{t("selectBooking")}</p>
          {bookings.map((booking) => (
            <button
              key={booking.id}
              type="button"
              onClick={() => setSelectedBooking(booking)}
              className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-[#2F5D50]/30 hover:bg-[#2F5D50]/5"
            >
              <p className="text-sm font-semibold text-gray-900">{booking.guest_name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {t("stayedAt", { room: booking.room_name })}
              </p>
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {fmtDateStr(booking.check_in, "d MMM", locale)} — {fmtDateStr(booking.check_out, "d MMM", locale)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {booking.num_guests}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
