"use client";

import { Fragment } from "react";
import Image from "next/image";
import { ShieldCheck, Phone, BadgeCheck } from "lucide-react";

import { useTranslations, useLocale } from "next-intl";
import { getInitials, lineUrl } from "@/lib/utils";
import { fmtDateStr } from "@/lib/format-date";
import { LineIcon } from "@/components/booking/booking-footer";
import { SectionHeading, SectionMark } from "@/components/booking/section-mark";

interface HostLocationSectionProps {
  hostName: string;
  hostPhone: string | null;
  /** The homestay's LINE ID or link; Thai guests ask there first. */
  lineId?: string | null;
  hostAvatarUrl: string | null;
  isVerified: boolean;
  hostCreatedAt: string;
  totalBookings: number;
  lastBookingDate: string | null;
  location: string;
  mapEmbedUrl: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Older than this, "last booking" reads as a quiet listing rather than a lively one, so it is left out. */
const RECENT_BOOKING_DAYS = 30;

const CONTACT_LINK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm text-earth-600 transition-colors hover:text-brand outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** One figure of the host's track record: a large value over a small label. */
function Stat({
  value,
  label,
  small = false,
}: {
  value: React.ReactNode;
  label?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div>
      <p className={`font-serif leading-none text-earth-900 ${small ? "text-2xl md:text-3xl" : "text-4xl md:text-5xl"}`}>{value}</p>
      {label && <p className="mt-3 flex items-center gap-2 text-sm text-earth-600">{label}</p>}
    </div>
  );
}

/**
 * The landing's "Meet your host" section, then its location map: two numbered
 * sections, as in the design reference.
 */
export function HostLocationSection({
  hostName,
  hostPhone,
  lineId,
  hostAvatarUrl,
  isVerified,
  hostCreatedAt,
  totalBookings,
  lastBookingDate,
  location,
  mapEmbedUrl,
}: HostLocationSectionProps) {
  const t = useTranslations("hostCard");
  const ta = useTranslations("about");
  const tl = useTranslations("landing");
  const locale = useLocale();

  const now = Date.now();
  const diffMs = now - new Date(hostCreatedAt).getTime();
  const totalMonths = Math.max(0, Math.floor(diffMs / (30.44 * DAY_MS)));
  const yearsHosting = Math.floor(totalMonths / 12);
  const isUnderOneYear = yearsHosting < 1;
  const recentBookingDate =
    lastBookingDate && now - new Date(lastBookingDate).getTime() <= RECENT_BOOKING_DAYS * DAY_MS ? lastBookingDate : null;

  return (
    <>
      <section id="host" className="scroll-mt-20 py-14 md:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionMark />
          <SectionHeading>{tl("meetHost")}</SectionHeading>

          <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-12 md:items-center">
            {/* Who the host is. Verification is shown when earned, never flagged when missing (as in the hero). */}
            <div className="flex flex-col items-start gap-5 md:col-span-5 md:flex-row md:items-center">
              <div className="relative shrink-0">
                <div className="h-24 w-24 overflow-hidden rounded-full bg-earth-100 ring-2 ring-earth-200 md:h-28 md:w-28">
                  {hostAvatarUrl ? (
                    <Image src={hostAvatarUrl} alt={hostName} width={112} height={112} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-earth-200 font-serif text-3xl text-earth-600">
                      {getInitials(hostName)}
                    </div>
                  )}
                </div>
                {isVerified && (
                  <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand shadow-md ring-2 ring-earth-50">
                    <ShieldCheck className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                {/* Words stay whole, so a Thai name wraps between first and last name, not mid-word. */}
                <p className="font-serif text-2xl leading-snug text-earth-900">
                  {hostName.split(" ").map((word, i) => (
                    <Fragment key={i}>
                      {i > 0 && " "}
                      <span className="whitespace-nowrap">{word}</span>
                    </Fragment>
                  ))}
                </p>
                {isVerified && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand ring-1 ring-brand/20">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {t("verifiedHost")}
                  </span>
                )}
                {(hostPhone || lineId) && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                    {hostPhone && (
                      <a href={`tel:${hostPhone}`} className={CONTACT_LINK}>
                        <Phone className="h-3.5 w-3.5" />
                        {hostPhone}
                      </a>
                    )}
                    {/* Thai guests ask on LINE first, so it is a button (DESIGN.md secondary), not a grey link. */}
                    {lineId && (
                      <a
                        href={lineUrl(lineId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-11 items-center gap-2 rounded-full border border-earth-200 bg-white px-5 text-sm font-semibold text-earth-800 transition-colors hover:bg-earth-100 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                      >
                        <LineIcon className="h-4 w-4" />
                        {t("chatOnLine")}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Track record. Zero bookings and an old or missing last booking are left out rather than shown as gaps. */}
            <div className="grid grid-cols-1 items-end gap-x-6 gap-y-8 border-t border-earth-200 pt-8 md:col-span-7 md:grid-cols-3 md:border-l md:border-t-0 md:pl-10 md:pt-0">
              {totalMonths === 0 ? (
                <Stat value={t("monthsHosting", { count: 0 })} small />
              ) : (
                <Stat
                  value={isUnderOneYear ? totalMonths : yearsHosting}
                  label={isUnderOneYear ? t("monthsHosting", { count: totalMonths }) : t("yearsHosting", { count: yearsHosting })}
                />
              )}
              {totalBookings > 0 && (
                <Stat value={totalBookings.toLocaleString()} label={t("totalBookings", { count: totalBookings })} />
              )}
              {recentBookingDate && (
                <Stat
                  small
                  value={fmtDateStr(recentBookingDate, "d MMM yyyy", locale)}
                  label={
                    <>
                      <span aria-hidden className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      {t("lastBooking")}
                    </>
                  }
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {mapEmbedUrl && (
        <section id="location" className="scroll-mt-20 py-14 md:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionMark />
            <SectionHeading>{ta("location")}</SectionHeading>
            <p className="mt-3 text-sm text-earth-600">{location}</p>
            <div className="mt-8 overflow-hidden rounded-2xl border border-earth-200 bg-white">
              <iframe
                src={mapEmbedUrl}
                className="h-80 w-full md:h-[28rem]"
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                title={ta("mapTitle")}
              />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
