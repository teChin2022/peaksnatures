"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { MapPin, Search } from "lucide-react";

interface LandingHeroProps {
  /** The search box text; LandingContent owns it so the results' "clear" can empty it. */
  query: string;
  onQueryChange: (query: string) => void;
  onSearch?: (location: string) => void;
}

// Same entrance as the /[slug] hero: CSS, so it runs without JavaScript, and
// motion-safe: so "Reduce motion" shows the lines at once.
const RISE =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:fill-mode-both";

export function LandingHero({ query, onQueryChange, onSearch }: LandingHeroProps) {
  const t = useTranslations("home.hero");
  const handleSearch = (searchTerm?: string) => {
    const term = (searchTerm ?? query).trim();
    if (searchTerm !== undefined) onQueryChange(term);
    onSearch?.(term);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("unique-homestays")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section className="relative h-[70svh] min-h-[540px] md:h-[85vh] w-full overflow-hidden">
      <div className="absolute inset-0">
        {/* images.unoptimized (settled) means no generated srcSet, so phones get their own file: the
            portrait centre object-cover shows there, 800×1200 and 111 KB instead of 2000px and 620 KB.
            Eager + high priority instead of `priority`, whose preload would fetch the big file on phones too.
            shortcut: both files are cut from this one photo; re-cut the portrait when the owner's replaces it. */}
        <picture>
          <source media="(max-width: 767px)" srcSet="/hero-mountain-portrait.jpg" />
          <Image
            src="/hero-mountain.jpg"
            alt={t("imageAlt")}
            fill
            loading="eager"
            fetchPriority="high"
            className="object-cover"
          />
        </picture>
      </div>
      {/* Same scrim as the /[slug] hero: flat black/55 keeps white text at 4.5:1 even over a
          white patch (DESIGN.md Photo Scrim Rule), whatever photo replaces this one. */}
      <div className="absolute inset-0 bg-black/55" />

      <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center text-center"
      >
        <h1
          className={`${RISE} text-3xl sm:text-4xl md:text-6xl lg:text-7xl text-white text-shadow-lg text-shadow-black/40 font-serif mb-4 md:mb-6 leading-tight`}
        >
          {t("title1")}
          <br />
          {t("title2")}
        </h1>

        <p
          className={`${RISE} motion-safe:delay-150 text-lg md:text-xl text-white text-shadow-lg text-shadow-black/40 mb-8 md:mb-12 max-w-2xl`}
        >
          {t("subtitle")}
        </p>

        {/* Search bar */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          // Concentric on phones: the pill button sits 12px in (two p-1.5), so 26px + 12px ≈ this 40px.
          className={`${RISE} motion-safe:delay-300 w-full max-w-md md:max-w-2xl bg-white rounded-[2.5rem] md:rounded-full p-1.5 md:p-2 shadow-md flex flex-col md:flex-row items-stretch md:items-center relative has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand transition-none`}
        >
          <div className="flex-1 px-7 py-4 md:py-3 text-left hover:bg-earth-50/50 transition-colors rounded-t-[2.125rem] md:rounded-l-full md:rounded-t-none group">
            <div className="flex items-center gap-3">
              <MapPin
                size={16}
                className="text-earth-600 group-hover:text-earth-800 transition-colors"
              />
              <div className="flex-1">
                <label htmlFor="landing-search" className="block text-xs font-semibold text-earth-600 mb-0.5">
                  {t("searchLabel")}
                </label>
                <input
                  id="landing-search"
                  type="text"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full text-base font-semibold text-earth-900 outline-none placeholder:font-normal placeholder:text-earth-600 bg-transparent"
                />
              </div>
            </div>
          </div>

          <div className="p-1.5 md:p-0 md:pr-1.5">
            <button
              type="submit"
              aria-label={t("search")}
              className="w-full md:w-auto bg-brand text-white px-8 py-4 md:p-5 rounded-full hover:bg-brand-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 flex items-center justify-center gap-3 group"
            >
              <Search
                size={20}
                className="group-hover:scale-110 transition-transform"
              />
              <span className="md:hidden font-bold text-sm">
                {t("search")}
              </span>
            </button>
          </div>
        </form>

      </div>
    </section>
  );
}
