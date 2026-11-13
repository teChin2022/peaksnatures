import { Fragment } from "react";
import Image from "next/image";
import { Clock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

interface LandingHeroProps {
  name: string;
  tagline: string | null;
  heroImageUrl: string | null;
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
  discoverHref,
  bookingDisabled = false,
}: LandingHeroProps) {
  const t = await getTranslations("landing");
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

        {/* The only other thing the hero says, and only when it is true (settled: blocked hosts show the notice). */}
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
