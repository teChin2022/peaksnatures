"use client";

import { useState, useSyncExternalStore } from "react";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

// The consent cookie is browser-only state. Subscribing is a no-op because it
// never changes outside this component's own handlers, and the server snapshot
// reports "already consented" so SSR and the hydrating render both emit nothing.
const subscribeToConsent = () => () => {};
const getConsentSnapshot = () => getCookie("cookie_consent") !== null;
const getConsentServerSnapshot = () => true;

export function CookieConsent() {
  const t = useTranslations("cookie");
  const tc = useTranslations("common");
  const consented = useSyncExternalStore(
    subscribeToConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );
  const [dismissed, setDismissed] = useState(false);

  const handleAccept = () => {
    setCookie("cookie_consent", "accepted", 365);
    setDismissed(true);
  };

  const handleDecline = () => {
    setCookie("cookie_consent", "declined", 365);
    setDismissed(true);
  };

  if (consented || dismissed) return null;

  return (
    <div
      // On phones a fixed bottom bar (data-bottom-bar: the Book bars, 5rem tall with the spacer) stays visible below the notice.
      // Fades in for everyone; the 16px rise only when motion is welcome (300ms, the project's ease-out curve).
      className="fixed inset-x-0 bottom-0 z-[9999] max-md:[:root:has([data-bottom-bar])_&]:bottom-[calc(5rem+env(safe-area-inset-bottom))] animate-in fade-in duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:slide-in-from-bottom-4"
    >
      <div className="mx-auto max-w-4xl px-4 pb-4">
        {/* Floats over the page, so a popover's shadow; flat white with a Sand border, no glass (DESIGN.md). */}
        <div className="relative rounded-2xl border border-earth-200 bg-white p-4 shadow-md sm:flex sm:items-center sm:gap-4 sm:p-5">
          <button
            type="button"
            onClick={handleDecline}
            className="absolute right-1 top-1 inline-flex size-11 items-center justify-center rounded-full text-earth-600 transition-colors hover:bg-earth-100 hover:text-earth-900 outline-none focus-visible:ring-2 focus-visible:ring-brand sm:hidden"
            aria-label={tc("close")}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-3 sm:flex-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-earth-100">
              <Cookie className="h-4.5 w-4.5 text-earth-600" />
            </div>
            <div className="pr-8 sm:pr-0">
              <p className="text-sm font-semibold text-earth-900">{t("title")}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-earth-600">
                {t("message")}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 sm:mt-0 sm:shrink-0">
            <Button
              variant="outline"
              onClick={handleDecline}
              // DESIGN.md secondary: Sand border, Teak Deep label, no shadow; Forest focus ring.
              className="h-11 rounded-full border-earth-200 px-5 text-sm font-semibold text-earth-800 shadow-none focus-visible:border-earth-200 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {t("decline")}
            </Button>
            <Button
              onClick={handleAccept}
              className="h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {t("accept")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
