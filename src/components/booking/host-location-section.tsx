"use client";

import { Fragment } from "react";
import Image from "next/image";
import { Phone, BadgeCheck, MapPin } from "lucide-react";

import { useTranslations, useLocale } from "next-intl";
import { getInitials, lineUrl } from "@/lib/utils";
import { fmtDateStr } from "@/lib/format-date";
import { LineIcon } from "@/components/booking/booking-footer";
import { SectionHeading, SectionMark } from "@/components/booking/section-mark";
import { CountUp } from "@/components/booking/reveal";

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

/** One figure of the host's track record: a large value over a small label, in a column of the stats row. */
function Stat({ value, label, small = false }: { value: React.ReactNode; label?: React.ReactNode; small?: boolean }) {
  return (
    <div className="px-2 [&+&]:border-l [&+&]:border-line">
      <p className={`font-serif leading-tight text-ink lining-nums ${small ? "text-xl" : "text-3xl"}`}>{value}</p>
      {label && <p className="mt-1 text-[13px] text-ink-2">{label}</p>}
    </div>
  );
}

/**
 * The landing's "Meet your host" section: the host's card and, beside it from
 * lg, the location map (anchor #location for the phone menu).
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
    <section id="host" className="scroll-mt-20 py-14 md:py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionMark />
        <SectionHeading>{tl("meetHost")}</SectionHeading>

        {/* Side by side from lg only: at tablet width the split squeezed the name onto two lines and broke the date. */}
        <div className={`mt-8 grid grid-cols-1 gap-5 ${mapEmbedUrl ? "lg:grid-cols-[5fr_7fr]" : "lg:max-w-xl"}`}>
          {/* Who the host is. Verification is shown when earned, never flagged when missing (as in the hero).
              Phones center it like a contact card under the section's left-aligned heading; from md the avatar sits beside the name. */}
          <div className="rounded-[20px] bg-white px-6 py-7 text-center md:text-left">
            <div className="flex flex-col items-center gap-4 md:flex-row md:gap-5">
              <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full bg-pine">
                {hostAvatarUrl ? (
                  <Image src={hostAvatarUrl} alt={hostName} width={88} height={88} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-serif text-3xl text-white">
                    {getInitials(hostName)}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                {/* Words stay whole, so a Thai name wraps between first and last name, not mid-word. */}
                <p className="font-serif text-[26px] leading-snug text-ink">
                  {hostName.split(" ").map((word, i) => (
                    <Fragment key={i}>
                      {i > 0 && " "}
                      <span className="whitespace-nowrap">{word}</span>
                    </Fragment>
                  ))}
                </p>
                {isVerified && (
                  <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-pine">
                    <BadgeCheck className="h-4 w-4" />
                    {t("verifiedHost")}
                  </span>
                )}
              </div>
            </div>

            {(hostPhone || lineId) && (
              <div className="mt-5 flex flex-wrap justify-center gap-2.5 md:justify-start">
                {hostPhone && (
                  <a
                    href={`tel:${hostPhone}`}
                    className="inline-flex min-h-12 items-center gap-2 whitespace-nowrap rounded-full bg-pine px-6 text-[15px] font-medium text-white transition-colors hover:bg-pine-hover outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
                  >
                    <Phone className="h-4 w-4" />
                    {hostPhone}
                  </a>
                )}
                {/* Thai guests ask on LINE first, so it is a button beside the phone, not a grey link. */}
                {lineId && (
                  <a
                    href={lineUrl(lineId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line-strong px-6 text-[15px] font-medium text-ink transition-colors hover:bg-mist outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
                  >
                    <LineIcon className="h-4 w-4" />
                    {t("chatOnLine")}
                  </a>
                )}
              </div>
            )}

            {/* Track record. Zero bookings and an old or missing last booking are left out rather than shown as gaps. */}
            <div className={`mt-6 grid border-t border-line pt-5 ${totalBookings > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
              {totalMonths === 0 ? (
                <Stat value={t("monthsHosting", { count: 0 })} small />
              ) : (
                <Stat
                  value={<CountUp value={isUnderOneYear ? totalMonths : yearsHosting} />}
                  label={isUnderOneYear ? t("monthsHosting", { count: totalMonths }) : t("yearsHosting", { count: yearsHosting })}
                />
              )}
              {totalBookings > 0 && (
                <Stat value={<CountUp value={totalBookings} />} label={t("totalBookings", { count: totalBookings })} />
              )}
            </div>
            {recentBookingDate && (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-ink-2">
                <span aria-hidden className="inline-flex h-2 w-2 rounded-full bg-[#2E7D5B]" />
                {t("lastBooking")} {fmtDateStr(recentBookingDate, "d MMM yyyy", locale)}
              </p>
            )}
          </div>

          {mapEmbedUrl && (
            <div id="location" className="flex scroll-mt-20 flex-col overflow-hidden rounded-[20px] bg-white">
              <iframe
                src={mapEmbedUrl}
                className="h-72 w-full flex-1 md:h-96 lg:h-auto lg:min-h-[320px]"
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                title={ta("mapTitle")}
              />
              <div className="flex items-start gap-3 px-6 py-5">
                <MapPin className="mt-1 h-[18px] w-[18px] shrink-0 text-pine" aria-hidden />
                <div className="min-w-0">
                  <h3 className="font-medium text-ink">{ta("location")}</h3>
                  <p className="text-[15px] text-ink-2">{location}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
