"use client";

import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionHeading, SectionMark } from "@/components/booking/section-mark";
import { ExpandableText } from "@/components/booking/expandable-text";

/** The fields a landing house card shows; the page sends nothing more to the browser. */
export interface LandingRoom {
  id: string;
  name: string;
  /** Sanitized rich text (getHomestayData), or null when it has no text. */
  description: string | null;
  price_per_night: number;
  max_guests: number;
  images: string[];
  is_active: boolean;
}

interface LandingRoomsProps {
  /** Bookable houses first, then closed ones, as on the booking page. */
  rooms: LandingRoom[];
  /** The booking page. /book picks dates first and can't preselect a house, so the link says "check availability". */
  bookHref: string;
  /** The host can't take bookings: the houses show without a link. */
  bookingDisabled?: boolean;
}

/** Every house with its normal price. Booking itself happens on /book. */
export function LandingRooms({ rooms, bookHref, bookingDisabled = false }: LandingRoomsProps) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const ta = useTranslations("about");
  const tav = useTranslations("availability");
  const th = useTranslations("hero");

  if (rooms.length === 0) return null;

  return (
    <section id="rooms" className="scroll-mt-20 pb-14 md:pb-20 lg:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionMark />
        <SectionHeading>{t("title")}</SectionHeading>
        {/* How paying works, before a guest picks a house; no deposit claim: deposits change by month. */}
        {!bookingDisabled && (
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">
            {/* Breaks only at the copy's spaces, so a Thai phrase never splits across lines. */}
            {t("paymentNote").split(" ").map((phrase, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                <span className="inline-block">{phrase}</span>
              </Fragment>
            ))}
          </p>
        )}

        <div className="mt-9 grid gap-6">
          {rooms.map((room, i) => (
            // Phones stack the photo (3:2) over the details (the owner's choice, 2026-11-11, so prices line up down the page).
            // From md the photo fills one side of the card, sides alternating. Without a photo the frame stays from md so
            // the sides keep alternating, and on phones the details take the whole card.
            <article key={room.id} className="grid overflow-hidden rounded-[20px] bg-white md:min-h-[400px] md:grid-cols-[1.15fr_1fr]">
              <div
                // Unveils as it scrolls in (RevealScope); the card's own corners clip it.
                data-reveal-kind="unveil"
                className={`group relative aspect-[3/2] overflow-hidden bg-mist-2 md:aspect-auto ${i % 2 === 1 ? "md:order-last" : ""} ${
                  room.images[0] ? "" : "hidden md:block"
                }`}
              >
                {room.images[0] && (
                  <Image
                    src={room.images[0]}
                    alt={room.name}
                    fill
                    sizes="(min-width: 768px) 55vw, 100vw"
                    // A closed house dims its photo only, so its text stays readable.
                    className={`object-cover ${room.is_active ? "" : "opacity-60 grayscale"}`}
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-2.5 px-5 pt-5 pb-6 md:px-10 md:py-9">
                <span aria-hidden className="font-serif text-[13px] tracking-[0.2em] text-ink-3 lining-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="font-serif text-[28px] leading-[1.3] text-ink md:text-[34px]">{room.name}</h3>
                  {!room.is_active && (
                    <span className="rounded-full bg-mist-2 px-3 py-1 text-xs font-medium text-ink-2">
                      {tav("roomClosed")}
                    </span>
                  )}
                </div>
                <p className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                  <Users className="h-4 w-4" />
                  {ta("upToGuests", { count: room.max_guests })}
                </p>
                {room.description && (
                  <ExpandableText html={room.description} clampClassName="line-clamp-3 lg:line-clamp-5" fadeClassName="from-white via-white/80" />
                )}
                <div className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-t border-line pt-4">
                  <div>
                    <p className="text-[13px] text-ink-2">{t("ratePrice")}</p>
                    <p className="whitespace-nowrap">
                      {/* Lining figures: the serif's old-style ones read "฿100" as "฿1OO". Set here, not with .tabular-nums, which resets the feature list. */}
                      <span className="font-serif text-3xl leading-tight text-ink" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
                        ฿{room.price_per_night.toLocaleString()}
                      </span>
                      <span className="ml-1 text-sm text-ink-2">{tc("perNight")}</span>
                    </p>
                  </div>
                  {room.is_active && !bookingDisabled && (
                    // Secondary pill: the page's one filled action is the Book button.
                    <Link
                      href={bookHref}
                      className="group/cta inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong px-6 text-[15px] font-medium text-ink outline-none transition-colors hover:bg-mist focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
                    >
                      {th("checkAvailability")}
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/cta:translate-x-[3px] motion-reduce:transition-none" />
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
