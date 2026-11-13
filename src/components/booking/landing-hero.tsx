import { Fragment } from "react";
import Image from "next/image";
import { BadgeCheck, CalendarX, Clock, MapPin, ShieldCheck, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

interface LandingHeroProps {
  name: string;
  tagline: string | null;
  heroImageUrl: string | null;
  location: string;
  isVerified: boolean;
  averageRating: number;
  reviewCount: number;
  /** Lowest nightly price across the houses; null hides the line. */
  fromPrice: number | null;
  /** Where "Discover" scrolls to: the first section after the hero. */
  discoverHref: string;
  /** The host can't take bookings: says so up front. */
  bookingDisabled?: boolean;
  /** The host's free-cancellation window in days, as /book shows it; 0 leaves the line out. */
  cancellationDays?: number;
  /** The host takes quick bookings only: they confirm by hand, so no "instant confirmation". */
  quickOnly?: boolean;
}

// The hero's lines rise in one after another; motion-safe: so "Reduce motion" shows them at once.
const RISE =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:fill-mode-both";

/** Full-screen opening of the homestay landing (/[slug]): photo, name, tagline, a cue to scroll. */
export async function LandingHero({
  name,
  tagline,
  heroImageUrl,
  location,
  isVerified,
  averageRating,
  reviewCount,
  fromPrice,
  discoverHref,
  bookingDisabled = false,
  cancellationDays = 0,
  quickOnly = false,
}: LandingHeroProps) {
  const t = await getTranslations("landing");
  const th = await getTranslations("hero");
  const tc = await getTranslations("common");
  const tb = await getTranslations("booking");
  // Italic for Latin only: Thai has no italic face, so the browser would slant it artificially.
  const italic = (await getLocale()) === "en" ? "italic" : "";

  return (
    <section className="relative flex h-[100svh] min-h-[560px] w-full items-center justify-center overflow-hidden bg-earth-900">
      {heroImageUrl && (
        // Slow zoom only: the photo is the page's largest paint, so it never fades in.
        <Image
          src={heroImageUrl}
          alt={name}
          fill
          sizes="100vw"
          priority
          className="object-cover motion-safe:animate-in motion-safe:zoom-in-108 motion-safe:duration-[8000ms] motion-safe:ease-out"
        />
      )}
      {/* Flat, so the text rows get the same shade wherever they sit: solid white over the brightest photo stays at 4.76:1. */}
      <div className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center text-white text-shadow-lg text-shadow-black/40">
        <h1 className={`font-serif text-4xl leading-tight text-balance sm:text-6xl md:text-7xl ${RISE}`}>
          {/* Lines break at the name's spaces, not between Thai syllables ("แคมป์ | ปิ้ง"); a word too long for the line still wraps inside its box. */}
          {name.trim().split(/\s+/).map((word, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="inline-block max-w-full">{word}</span>
            </Fragment>
          ))}
        </h1>
        {tagline && (
          <p className={`mt-5 font-serif text-lg sm:text-2xl ${italic} ${RISE} motion-safe:delay-150`}>{tagline}</p>
        )}

        <div className={`mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm ${RISE} motion-safe:delay-300`}>
          {location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {location}
            </span>
          )}
          {averageRating > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
              {averageRating.toFixed(1)}
              {reviewCount > 0 && <span>({reviewCount})</span>}
            </span>
          )}
          {isVerified && (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              {th("verifiedHost")}
            </span>
          )}
        </div>

        {fromPrice !== null && (
          <p className={`mt-4 text-sm ${RISE} motion-safe:delay-450`}>
            {tc("from")} <span className="text-base font-semibold">฿{fromPrice.toLocaleString()}</span>
            {tc("perNight")}
          </p>
        )}

        {/* The booking promise /book's hero makes, under the price it belongs with. */}
        {!bookingDisabled && (
          <div className={`mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm ${RISE} motion-safe:delay-600`}>
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4" />
              {th(quickOnly ? "hostConfirms" : "instantConfirm")}
            </span>
            {cancellationDays > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarX className="h-4 w-4" />
                {tb("cancellationPolicyNote", { days: cancellationDays })}
              </span>
            )}
          </div>
        )}

        {bookingDisabled && (
          <p
            className={`mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 text-shadow-none ${RISE} motion-safe:delay-450`}
          >
            <Clock className="h-4 w-4" />
            {tb("unavailableTitle")}
          </p>
        )}
      </div>

      <a
        href={discoverHref}
        // Clears the sticky Book bar on mobile (LandingBookBar).
        className="group absolute bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 rounded-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:transition-none md:bottom-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:delay-1000"
      >
        <span className={`font-serif text-sm underline-offset-4 group-hover:underline ${italic}`}>{t("discover")}</span>
        <span aria-hidden className="scroll-cue-line h-10 w-px bg-white/60" />
      </a>
    </section>
  );
}
