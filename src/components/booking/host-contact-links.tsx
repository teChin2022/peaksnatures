"use client";

import { MessageCircle, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { hostContactLink } from "@/lib/quick-booking";

/**
 * How a guest reaches the host after a quick booking: the homestay's Facebook
 * page (Messenger when the address allows it) and the host's phone. Whatever
 * the host has is shown, so the guest always has a way to send the slip; only
 * when neither exists does it say the host will call.
 */
export function HostContactLinks({
  facebookUrl,
  hostPhone,
  messengerLabel,
}: {
  facebookUrl: string | null | undefined;
  hostPhone: string | null | undefined;
  /** Replaces the default "send your slip" wording on the Messenger button. */
  messengerLabel?: string;
}) {
  const t = useTranslations("booking");
  const contact = hostContactLink(facebookUrl);
  const phone = hostPhone?.trim() || null;

  if (!contact && !phone) {
    return <p className="text-sm text-earth-600">{t("hostContactNone")}</p>;
  }

  const focus =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  return (
    <div className="flex w-full flex-col gap-2">
      {contact && (
        <a
          href={contact.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-brand-hover ${focus}`}
        >
          <MessageCircle size={18} aria-hidden="true" />
          {contact.kind === "messenger" ? (messengerLabel ?? t("hostContactMessenger")) : t("hostContactPage")}
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-earth-200 bg-white px-6 text-sm font-medium text-earth-800 transition-colors hover:bg-earth-50 ${focus}`}
        >
          <Phone size={18} aria-hidden="true" />
          {t("hostContactCall", { phone })}
        </a>
      )}
    </div>
  );
}
