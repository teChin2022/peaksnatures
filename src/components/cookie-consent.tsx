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
    <div className="fixed bottom-0 left-0 right-0 z-[9999] animate-in slide-in-from-bottom-4 duration-500">
      <div className="mx-auto max-w-4xl px-4 pb-4">
        <div className="relative rounded-2xl border bg-white/95 p-4 shadow-lg backdrop-blur-md sm:flex sm:items-center sm:gap-4 sm:p-5">
          <button
            onClick={handleDecline}
            className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors sm:hidden"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-3 sm:flex-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <Cookie className="h-4.5 w-4.5 text-amber-600" />
            </div>
            <div className="pr-6 sm:pr-0">
              <p className="text-sm font-medium text-gray-900">{t("title")}</p>
              <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                {t("message")}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 sm:mt-0 sm:shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDecline}
              className="rounded-full text-xs"
            >
              {t("decline")}
            </Button>
            <Button
              size="sm"
              onClick={handleAccept}
              className="rounded-full bg-brand text-xs text-white hover:bg-brand-hover"
            >
              {t("accept")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
