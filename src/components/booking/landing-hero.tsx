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
    // Mist Ridge: the name sits low and left over the photo, aligned with the sections below.
    <section className="relative flex h-[100svh] min-h-[560px] w-full items-end overflow-hidden bg-pine-deep">
      {heroImageUrl && (
        // Slow zoom only: the photo is the page's largest paint, so it never fades in.
        <Image
          src={heroImageUrl}
          alt={name}
          fill
          sizes="100vw"
          priority
          className="object-cover motion-safe:animate-in motion-safe:zoom-in-110 motion-safe:duration-[6000ms] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]"
        />
      )}
      {/* Flat, so the text rows get the same shade wherever they sit: solid white over the brightest photo stays at 4.76:1. */}
      <div className="absolute inset-0 bg-black/55" />

      {/* Bottom padding clears the scroll cue, and on phones the sticky Book bar under it. */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-[calc(12rem+env(safe-area-inset-bottom))] text-white text-shadow-lg text-shadow-black/40 sm:px-6 md:pb-40">
        <h1 className="font-serif text-5xl leading-[1.15] text-balance sm:text-6xl md:text-7xl lg:text-8xl">
          {/* The name rises from behind a mask (globals.css .hero-rise); the padding keeps Thai marks above and below the line inside it. */}
          <span className="-my-[0.12em] block overflow-hidden py-[0.12em]">
            <span className="hero-rise block">
              {/* Lines break at the name's spaces, not between Thai syllables ("แคมป์ | ปิ้ง"); a word too long for the line still wraps inside its box. */}
              {name.trim().split(/\s+/).map((word, i) => (
                <Fragment key={i}>
                  {i > 0 && " "}
                  <span className="inline-block max-w-full">{word}</span>
                </Fragment>
              ))}
            </span>
          </span>
        </h1>
        {tagline && (
          <p className={`mt-4 max-w-[32ch] text-lg text-white/95 sm:text-xl md:text-2xl ${italic} ${RISE} motion-safe:delay-700`}>{tagline}</p>
        )}

        {/* The only other thing the hero says, and only when it is true (settled: blocked hosts show the notice). */}
        {bookingDisabled && (
          <p
            className={`mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 text-shadow-none ${RISE} motion-safe:delay-900`}
          >
            <Clock className="h-4 w-4" />
            {tb("unavailableTitle")}
          </p>
        )}
      </div>

      <a
        href={discoverHref}
        // Clears the sticky Book bar on mobile (LandingBookBar).
        className="group absolute bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 rounded-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:transition-none md:bottom-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:delay-[1400ms]"
      >
        <span className={`font-serif text-sm underline-offset-4 group-hover:underline ${italic}`}>{t("discover")}</span>
        <span aria-hidden className="scroll-cue-line h-10 w-px bg-white/60" />
      </a>
    </section>
  );
}
