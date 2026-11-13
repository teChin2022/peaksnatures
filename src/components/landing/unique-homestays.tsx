"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, SearchX, Tent } from "lucide-react";
import { HomestayCard } from "./homestay-card";

const PAGE_SIZE = 50;

interface HomestayData {
  slug: string;
  name: string;
  location: string;
  hero_image_url: string | null;
  gallery: string[];
  min_price: number | null;
  max_guests: number;
  tagline: string | null;
  review_count: number;
  average_rating: number;
  is_host_verified: boolean;
}

export function UniqueHomestays({
  homestays,
  locationFilter,
  onClearFilter,
}: {
  homestays: HomestayData[];
  locationFilter?: string;
  onClearFilter?: () => void;
}) {
  const t = useTranslations("home.list");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [prevFilter, setPrevFilter] = useState(locationFilter);

  // Reset paging when the hero search term changes
  if (prevFilter !== locationFilter) {
    setPrevFilter(locationFilter);
    setVisibleCount(PAGE_SIZE);
  }

  const q = (locationFilter ?? "").trim();
  const needle = q.toLowerCase();
  const filtered = q
    ? homestays.filter((h) => [h.name, h.location, h.tagline ?? ""].some((v) => v.toLowerCase().includes(needle)))
    : homestays;

  // The clear button disappears with the search, so focus moves to the list heading.
  const clear = () => {
    onClearFilter?.();
    headingRef.current?.focus();
  };

  const displayed = filtered.slice(0, visibleCount);
  const remaining = filtered.length - displayed.length;
  // With no match the empty panel below says it all; the count line stays only for screen readers.
  const noMatch = q !== "" && filtered.length === 0;
  // Two homestays in a 3-column grid left a hole at lg: give them the row, with wider photos.
  const pair = displayed.length === 2;

  return (
    <section id="unique-homestays" className="scroll-mt-20 py-14 md:py-20 lg:py-28 bg-earth-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 md:mb-12">
          <div className="max-w-xl">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl md:text-4xl lg:text-5xl font-serif text-earth-900 leading-tight outline-none"
            >
              {t("title")}
            </h2>
          </div>
          {/* Always mounted, so screen readers announce the count when a search runs. */}
          <div className={q && !noMatch ? "mt-4 flex flex-wrap items-center gap-x-3 gap-y-1" : "flex"}>
            <p aria-live="polite" className={noMatch ? "sr-only" : "text-sm text-earth-600"}>
              {q ? t("results", { count: filtered.length, query: q }) : ""}
            </p>
            {q && !noMatch && (
              <button
                type="button"
                onClick={clear}
                className="rounded-sm text-sm font-semibold text-brand underline underline-offset-4 outline-none hover:text-brand-hover focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t("clearSearch")}
              </button>
            )}
          </div>
        </div>

        {displayed.length > 0 ? (
          <>
            {/* One list for every width: a vertical stack on phones (owner's pick 2026-11-13, Booking.com-style), a grid from sm. */}
            <ul className={`grid gap-x-8 gap-y-10 sm:grid-cols-2 ${pair ? "" : "lg:grid-cols-3"}`}>
              {displayed.map((h) => (
                <li key={h.slug}>
                  <HomestayCard
                    slug={h.slug}
                    name={h.name}
                    location={h.location}
                    heroImageUrl={h.hero_image_url}
                    gallery={h.gallery}
                    minPrice={h.min_price}
                    maxGuests={h.max_guests}
                    tagline={h.tagline}
                    reviewCount={h.review_count}
                    averageRating={h.average_rating}
                    isHostVerified={h.is_host_verified}
                    wide={pair}
                  />
                </li>
              ))}
            </ul>

            {remaining > 0 && (
              <div className="mt-12 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="group inline-flex items-center gap-2 rounded-full border border-earth-300 bg-white px-10 py-4 text-sm font-bold text-earth-900 transition-colors hover:border-earth-400 hover:bg-earth-100 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  {t("loadMore")}
                  <span className="font-normal text-earth-600">{t("loadMoreCount", { count: remaining })}</span>
                  <ChevronDown size={16} aria-hidden="true" className="motion-safe:transition-transform motion-safe:group-hover:translate-y-0.5" />
                </button>
              </div>
            )}
          </>
        ) : (
          // DESIGN.md EmptyState pattern (icon, title, one line, one action) on a Linen panel.
          <div className="flex flex-col items-center rounded-2xl bg-earth-100 px-6 py-14 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white">
              {q ? <SearchX className="h-5 w-5 text-earth-600" aria-hidden="true" /> : <Tent className="h-5 w-5 text-earth-600" aria-hidden="true" />}
            </div>
            <p className="font-serif text-xl text-earth-900 break-words [overflow-wrap:anywhere]">
              {q ? t("noMatchTitle", { query: q }) : t("emptyTitle")}
            </p>
            <p className="mt-2 max-w-sm text-sm text-earth-600">
              {q ? t("noMatchHint") : t("emptyHint")}
            </p>
            {q && (
              <button
                type="button"
                onClick={clear}
                className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brand px-6 text-sm font-semibold text-white outline-none transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-earth-100"
              >
                {t("showAll")}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
