"use client";

import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GuestBookingMode } from "@/types/database";
import { GUEST_BOOKING_MODES, hostContactLink } from "@/lib/quick-booking";

const LABEL_KEY = {
  normal: "guestBookingModeNormal",
  quick: "guestBookingModeQuick",
  both: "guestBookingModeBoth",
} as const;

const DESC_KEY = {
  normal: "guestBookingModeNormalDesc",
  quick: "guestBookingModeQuickDesc",
  both: "guestBookingModeBothDesc",
} as const;

/**
 * Which booking flows this host opens to guests (hosts.guest_booking_mode). A
 * controlled field: the homestay page owns the value and saves it with the
 * other host-level terms. `facebookUrl` is the page's own Facebook field, read
 * live so the host sees what a guest will get before saving.
 */
export function GuestBookingModeField({
  value,
  onChange,
  facebookUrl,
}: {
  value: GuestBookingMode;
  onChange: (mode: GuestBookingMode) => void;
  facebookUrl: string;
}) {
  const t = useTranslations("dashboardHomestay");
  const contact = hostContactLink(facebookUrl);
  const contactKey =
    contact?.kind === "messenger"
      ? "guestBookingModeContactMessenger"
      : contact?.kind === "page"
        ? "guestBookingModeContactPage"
        : "guestBookingModeContactNone";

  return (
    <fieldset className="border-t pt-4 space-y-3">
      <legend className="sr-only">{t("guestBookingMode")}</legend>
      <div className="flex items-center gap-2 text-sm font-medium" aria-hidden="true">
        <Zap className="h-4 w-4 text-brand" />
        {t("guestBookingMode")}
      </div>

      <div className="space-y-2">
        {GUEST_BOOKING_MODES.map((mode) => {
          const selected = value === mode;
          return (
            <label
              key={mode}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                selected ? "border-brand bg-brand-50" : "border-earth-200 hover:border-earth-300"
              }`}
            >
              <input
                type="radio"
                name="guest-booking-mode"
                value={mode}
                checked={selected}
                onChange={() => onChange(mode)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium text-earth-900">{t(LABEL_KEY[mode])}</span>
                <span className="block text-xs text-earth-600">{t(DESC_KEY[mode])}</span>
              </span>
            </label>
          );
        })}
      </div>

      {value !== "normal" && (
        <div className="space-y-1.5 rounded-xl bg-amber-50 p-3 text-xs text-amber-800" data-testid="quick-mode-notes">
          <p>{t("guestBookingModeQuickNote")}</p>
          <p>{t(contactKey)}</p>
        </div>
      )}
    </fieldset>
  );
}
