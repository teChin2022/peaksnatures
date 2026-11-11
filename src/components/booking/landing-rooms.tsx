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
    <section id="rooms" className="scroll-mt-20 py-14 md:py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionMark />
        <SectionHeading>{t("title")}</SectionHeading>
        {/* How paying works, before a guest picks a house; no deposit claim: deposits change by month. */}
        {!bookingDisabled && (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-earth-600">
            {/* Breaks only at the copy's spaces, so a Thai phrase never splits across lines. */}
            {t("paymentNote").split(" ").map((phrase, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                <span className="inline-block">{phrase}</span>
              </Fragment>
            ))}
          </p>
        )}

        <div className="mt-10 grid gap-10 md:gap-16">
          {rooms.map((room, i) => (
            // Phones stack the photo (3:2) over the details (the owner's choice, 2026-11-11, so prices line up down the page).
            // From md the photo is a 4:3 half beside the details, sides alternating. Without a photo the frame stays from md so
            // the sides keep alternating, and on phones the details take the whole row.
            <article key={room.id} className="grid gap-4 sm:gap-6 md:grid-cols-2 md:items-center md:gap-12">
              <div
                className={`relative aspect-[3/2] overflow-hidden rounded-xl bg-earth-200 md:aspect-[4/3] ${i % 2 === 1 ? "md:order-last" : ""} ${
                  room.images[0] ? "" : "hidden md:block"
                }`}
              >
                {room.images[0] && (
                  <Image
                    src={room.images[0]}
                    alt={room.name}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    // A closed house dims its photo only, so its text stays readable.
                    className={`object-cover ${room.is_active ? "" : "opacity-60 grayscale"}`}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="font-serif text-2xl text-earth-900">{room.name}</h3>
                  {!room.is_active && (
                    <span className="rounded-full bg-earth-200 px-2.5 py-0.5 text-xs font-medium text-earth-700">
                      {tav("roomClosed")}
                    </span>
                  )}
                </div>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-earth-600">
                  <Users className="h-4 w-4" />
                  {ta("upToGuests", { count: room.max_guests })}
                </p>
                {room.description && (
                  <ExpandableText html={room.description} clampClassName="line-clamp-3 lg:line-clamp-6" className="mt-4" />
                )}
                <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-t border-earth-200 pt-4">
                  <div>
                    <p className="text-sm text-earth-600">{t("basePrice")}</p>
                    <p className="whitespace-nowrap">
                      {/* Lining figures: the serif's old-style ones read "฿100" as "฿1OO". Set here, not with .tabular-nums, which resets the feature list. */}
                      <span className="font-serif text-3xl text-earth-900" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
                        ฿{room.price_per_night.toLocaleString()}
                      </span>
                      <span className="ml-1 text-sm text-earth-600">{tc("perNight")}</span>
                    </p>
                  </div>
                  {room.is_active && !bookingDisabled && (
                    // DESIGN.md button-secondary; Bark Light border (earth-500) because Sand fails 3:1 on a control edge.
                    <Link
                      href={bookHref}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-earth-500 bg-white px-5 text-sm font-semibold text-earth-800 outline-none transition-colors hover:bg-earth-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                    >
                      {th("checkAvailability")}
                      <ArrowRight className="h-4 w-4" />
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
