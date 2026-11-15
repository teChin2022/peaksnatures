"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Phone, Mail, Loader2, CalendarDays, Users, CheckCircle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReviewFormInline } from "@/components/reviews/review-form-inline";
import { fmtDateStr } from "@/lib/format-date";
import { isValidEmail, isValidPhone, sanitizePhoneInput } from "@/lib/utils";

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

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const canLookup = isValidPhone(phone) && isValidEmail(email);
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<EligibleBooking[] | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<EligibleBooking | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleLookup = useCallback(async () => {
    if (!canLookup || loading) return;
    setLoading(true);
    setBookings(null);
    setSelectedBooking(null);

    try {
      const res = await fetch("/api/reviews/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homestay_id: homestayId,
          phone,
          email: email.trim(),
          turnstileToken: turnstileToken || "",
        }),
      });
      const data = await res.json();
      if (res.status === 403) {
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        setTurnstileVerified(false);
        setBookings([]);
        return;
      }
      setTurnstileVerified(true);
      setBookings(data.bookings || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [canLookup, phone, email, homestayId, loading, turnstileToken]);

  const handleSuccess = useCallback(() => {
    setSubmitted(true);
  }, []);

  const handleWriteAnother = useCallback(() => {
    setSubmitted(false);
    setSelectedBooking(null);
    setBookings(null);
    setPhone("");
    setEmail("");
    setTurnstileToken(null);
    setTurnstileVerified(false);
    turnstileRef.current?.reset();
  }, []);

  // Success state
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
          <CheckCircle className="h-8 w-8 text-brand" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-earth-900">{t("thankYou")}</h2>
        <p className="mt-2 max-w-sm text-sm text-earth-500">{t("reviewSubmittedDesc")}</p>
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={handleWriteAnother}
            className="cursor-pointer border-earth-200 text-earth-700 hover:border-brand hover:text-brand"
          >
            {t("writeAnother")}
          </Button>
          <Link href={`/${homestaySlug}`}>
            <Button className="h-11 cursor-pointer rounded-xl bg-brand px-5 text-white hover:bg-brand-hover">
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
        <div className="flex flex-col gap-3 rounded-2xl border border-brand/20 bg-brand-50 p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div>
            <p className="text-sm font-semibold text-earth-900">{selectedBooking.guest_name}</p>
            <p className="text-xs text-earth-600">
              {selectedBooking.room_name} · {fmtDateStr(selectedBooking.check_in, "d MMM yyyy", locale)} — {fmtDateStr(selectedBooking.check_out, "d MMM yyyy", locale)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer self-start text-xs text-earth-600 hover:bg-white hover:text-brand md:self-auto"
            onClick={() => setSelectedBooking(null)}
          >
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
      <div>
        {/* Same fields + button as the booking search (booking-search-view.tsx): keep the two in step.
            Phone AND email, as /api/reviews/lookup requires (src/lib/guest-lookup.ts). */}
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="reviews-phone" className="block text-sm font-semibold text-earth-700">
              {t("phoneLabel")}
            </Label>
            <div className="relative mt-2">
              <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-earth-500" aria-hidden="true" />
              <Input
                id="reviews-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                placeholder={t("phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                aria-describedby="reviews-lookup-hint"
                className="!pl-10 p-3.5 !h-12 rounded-xl !border !border-earth-500 !bg-white hover:!border-earth-700 transition-all text-base md:text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-2 focus-visible:!ring-brand focus-visible:!ring-offset-2"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="reviews-email" className="block text-sm font-semibold text-earth-700">
              {t("emailLabel")}
            </Label>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-earth-500" aria-hidden="true" />
              <Input
                id="reviews-email"
                type="email"
                inputMode="email"
                enterKeyHint="search"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                aria-describedby="reviews-lookup-hint"
                className="!pl-10 p-3.5 !h-12 rounded-xl !border !border-earth-500 !bg-white hover:!border-earth-700 transition-all text-base md:text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-2 focus-visible:!ring-brand focus-visible:!ring-offset-2"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleLookup}
            disabled={!canLookup || loading || (!turnstileVerified && !turnstileToken && !turnstileError)}
            className="inline-flex h-12 w-full shrink-0 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto sm:min-w-28"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t("lookupLoading")} /> : t("lookupButton")}
          </button>
        </div>
        <p
          id="reviews-lookup-hint"
          className="mt-2 text-xs leading-relaxed text-earth-600"
        >
          {t("noBookingsHint")}
        </p>

        {/* Turnstile CAPTCHA — hidden once solved or verified */}
        {!turnstileToken && !turnstileVerified && (
          <div className="mt-4 flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => { setTurnstileToken(null); setTurnstileError(true); }}
              options={{ theme: "light", size: "normal" }}
            />
          </div>
        )}
      </div>

      {/* Results */}
      {bookings !== null && bookings.length === 0 && (
        <div className="rounded-2xl border border-dashed border-earth-200 bg-white/60 p-6 text-center">
          <p className="text-sm text-earth-600">{t("noEligibleBookings")}</p>
        </div>
      )}

      {bookings !== null && bookings.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-earth-700">
            {t("selectBooking")}
          </h2>
          {bookings.map((booking) => (
            <button
              key={booking.id}
              type="button"
              onClick={() => setSelectedBooking(booking)}
              className="w-full cursor-pointer rounded-2xl border border-earth-200 bg-white p-5 text-left transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <p className="text-sm font-semibold text-earth-900">{booking.guest_name}</p>
              <p className="mt-0.5 text-xs text-earth-600">
                {t("stayedAt", { room: booking.room_name })}
              </p>
              <div className="mt-2 flex items-center gap-4 text-xs text-earth-600">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3 text-earth-400" aria-hidden="true" />
                  {fmtDateStr(booking.check_in, "d MMM", locale)} — {fmtDateStr(booking.check_out, "d MMM", locale)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3 text-earth-400" aria-hidden="true" />
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
