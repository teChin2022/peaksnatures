import Image from "next/image";
import { Clock, MapPin, ShieldCheck, Star } from "lucide-react";
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
          quality={85}
          className="object-cover motion-safe:animate-in motion-safe:zoom-in-108 motion-safe:duration-[8000ms] motion-safe:ease-out"
        />
      )}
      {/* Dark enough behind the text for a bright photo (mist, sky): white large text stays at 3.4:1 or better. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/65" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center text-white text-shadow-lg text-shadow-black/40">
        <h1 className={`font-serif text-4xl leading-tight sm:text-6xl md:text-7xl ${RISE}`}>{name}</h1>
        {tagline && (
          <p className={`mt-5 font-serif text-lg text-white/90 sm:text-2xl ${italic} ${RISE} motion-safe:delay-150`}>{tagline}</p>
        )}

        <div className={`mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-white/90 ${RISE} motion-safe:delay-300`}>
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
              {reviewCount > 0 && <span className="text-white/75">({reviewCount})</span>}
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
          <p className={`mt-4 text-sm text-white/90 ${RISE} motion-safe:delay-450`}>
            {tc("from")} <span className="text-base font-semibold text-white">฿{fromPrice.toLocaleString()}</span>
            {tc("perNight")}
          </p>
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
        className="absolute bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 text-white/80 transition-colors hover:text-white md:bottom-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:delay-1000"
      >
        <span className={`font-serif text-sm ${italic}`}>{t("discover")}</span>
        <span aria-hidden className="scroll-cue-line h-10 w-px bg-white/60" />
      </a>
    </section>
  );
}
