import { ArrowRight } from "lucide-react";
import { HomestayCard } from "./homestay-card";

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

export function UniqueHomestays({ homestays }: { homestays: HomestayData[] }) {
  return (
    <section id="unique-homestays" className="py-24 bg-section-alt">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col items-center mb-12 gap-6 text-center">
          <div className="max-w-xl">
            <span className="text-sm font-bold uppercase tracking-[0.3em] text-gray-400 block mb-4">
              ที่พักที่คัดสรรแล้ว
            </span>
            <h2 className="text-4xl md:text-5xl font-serif text-gray-900">
              โฮมสเตย์กลางธรรมชาติ
            </h2>
          </div>
          {homestays.length > 12 && (
            <button className="group flex items-center gap-2 text-gray-900 font-bold text-sm tracking-widest hover:gap-4 transition-all">
              VIEW ALL PROPERTIES <ArrowRight size={16} />
            </button>
          )}
        </div>

        {homestays.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {homestays.slice(0, 6).map((h) => (
              <HomestayCard
                key={h.slug}
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
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-200 py-16 text-center">
            <p className="text-lg font-serif text-gray-500">
              No homestays listed yet
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Check back soon — new properties are being added.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
