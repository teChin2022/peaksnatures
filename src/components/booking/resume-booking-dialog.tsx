"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, History } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { isValidEmail, isValidPhone, sanitizePhoneInput } from "@/lib/utils";
import type { BookingDraftResponse, ResumeDraftDetail } from "@/lib/booking-draft";

interface ResumeBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  homestayId: string;
}

/**
 * "Continue an unfinished booking" — the way back in for a guest who reached the
 * QR, switched to their banking app, and never came back to the tab.
 *
 * Deliberately dumb: it looks the draft up and dispatches ONE event. It holds no
 * cart state and does no catalog validation. BookingSection owns every state
 * change that follows, because step 2's fields live in its local state and
 * splitting the restore across two components would commit the cart while the
 * guest fields were still in flight.
 */
export function ResumeBookingDialog({ open, onOpenChange, homestayId }: ResumeBookingDialogProps) {
  const t = useTranslations("resumeBooking");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  // Fails open, like every other Turnstile call site: Cloudflare being
  // unreachable must never lock a guest out of their own booking.
  const turnstilePassed = !!turnstileToken || turnstileError;

  // Reopening after a miss should feel like a fresh attempt, not a stuck one.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setError(null);
      setNotFound(false);
      setLoading(false);
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!isValidPhone(phone)) return setError(t("errorInvalidPhone"));
    if (!isValidEmail(email)) return setError(t("errorInvalidEmail"));
    if (!consent) return setError(t("errorConsent"));

    setError(null);
    setNotFound(false);
    setLoading(true);
    try {
      const res = await fetch("/api/bookings/draft/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homestay_id: homestayId,
          phone,
          email,
          turnstileToken: turnstileToken || undefined,
        }),
      });
      const data = (await res.json()) as BookingDraftResponse | { found: false };

      if (!res.ok || !data.found) {
        setNotFound(true);
        // A used token is spent; without a reset the next attempt has none.
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }

      // BookingSection takes it from here. Same channel as "book-room". The
      // phone rides along because the lookup response does not echo it back and
      // the form needs it for the hold request.
      const detail: ResumeDraftDetail = { ...data, phone };
      document.dispatchEvent(new CustomEvent("resume-draft", { detail }));
      onOpenChange(false);
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const startNew = () => {
    onOpenChange(false);
    document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-brand" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
        </DialogHeader>

        {notFound ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-earth-200 bg-earth-50 p-4 text-center">
              <p className="text-sm font-semibold text-earth-900">{t("notFoundTitle")}</p>
              <p className="mt-1 text-xs text-earth-500">{t("notFoundDesc")}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNotFound(false)}
                className="flex-1 rounded-full border border-earth-200 px-4 py-3 text-sm font-medium text-earth-700 hover:bg-earth-50 transition-colors"
              >
                {t("submit")}
              </button>
              <button
                type="button"
                onClick={startNew}
                className="flex-1 rounded-full bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-hover transition-colors"
              >
                {t("startNew")}
              </button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="resume-phone" className="text-sm font-medium text-earth-700">
                {t("phoneLabel")}
              </label>
              <input
                id="resume-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                placeholder={t("phonePlaceholder")}
                className="w-full rounded-xl border border-earth-200 px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="resume-email" className="text-sm font-medium text-earth-700">
                {t("emailLabel")}
              </label>
              <input
                id="resume-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                className="w-full rounded-xl border border-earth-200 px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {/* Doubles as the step-1 PDPA consent, so restoring it into the form
                is honest rather than a bypass, and as notice for the disclosure
                we are about to make. */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-earth-300 text-earth-900 focus:ring-earth-900"
              />
              <span className="text-xs text-earth-600">
                {t.rich("consent", {
                  privacy: (chunks) => (
                    <a href="/legal#privacy" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-earth-900">{chunks}</a>
                  ),
                  terms: (chunks) => (
                    <a href="/legal#terms" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-earth-900">{chunks}</a>
                  ),
                })}
              </span>
            </label>

            {turnstileSiteKey && !turnstilePassed && (
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={turnstileSiteKey}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => {
                    setTurnstileToken(null);
                    setTurnstileError(true);
                  }}
                  options={{ theme: "light", size: "normal" }}
                />
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || !turnstilePassed}
              className="w-full rounded-full bg-brand px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("searching")}
                </>
              ) : (
                t("submit")
              )}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
